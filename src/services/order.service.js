const { updateOrdersStatus, lockOrdersForProcessing } = require("../repositories/order.repository");
const { getMerchantById } = require("../repositories/merchant.repository");
const { chunkArray } = require("../utils/array.util");
const { executeWithConcurrencyLimit } = require("../utils/concurrency.util");
const { hitExternalMockAPI } = require("./external.service");

const processOrdersBatch = async (merchantId, orderIds) => {
    let merchant;
    try {
        merchant = await getMerchantById(merchantId);
        
        if (!merchant) {
            const error = new Error("Merchant tidak ditemukan di dalam sistem.");
            error.statusCode = 404;
            throw error;
        }

        if (merchant.active !== true) {
            const error = new Error("Akun Merchant sedang tidak aktif, tolong aktifkan terlebih dahulu");
            error.statusCode = 403; 
            throw error;
        }
    } catch (error) {
        throw error;
    }

    // implementasi per-BATCH (500 data) untuk meringankan penggunaan memori
    const BATCH_SIZE = 500;
    const orderIdBatches = chunkArray(orderIds, BATCH_SIZE);

    const processingResults = {
        totalProcessed: 0,
        success: [],
        failed: []
    };
    
    // untuk setiap batch, lakukan proses atomic locking
    for (const batch of orderIdBatches) {
        // menunggu data dari repository
        const lockedOrderIds = await lockOrdersForProcessing(merchant.id, batch);
        
        // Mencari order yang gagal dikunci dari variabel batch (yaitu order yang memiliki status bukan PENDING / bukan milik merchant terkait)
        const failedToLockIds = batch.filter(id => !lockedOrderIds.includes(id));
        // melakukan looping untuk membuangnya ke dalam array failed pada variabel processingResults
        for (const failedId of failedToLockIds) {
            processingResults.failed.push({
                orderId: failedId,
                reason: "Invalid Status / Invalid Merchant Relation"
            });
        }

        // Melakukan inisiasi hit ke API Eksternal dengan menjadikan array teks itu jadi sebuah array fungsi
        // dimana dia akan melakukan hit ke external service untuk setiap fungsinya
        const externalTasks = lockedOrderIds.map(orderId => {
            return async () => {
                try {
                    await hitExternalMockAPI(orderId);

                    return { id: orderId, success: true };
                } catch (error) {
                    return { id: orderId, success: false, reason: error.message };
                }
            };
        });

        const MAX_CONCURRENCY = 5;
        const externalResults = await executeWithConcurrencyLimit(externalTasks, MAX_CONCURRENCY);

        const successIdsToUpdate = [];
        const failedIdsToUpdate = [];

        for (const res of externalResults) {
            if (res.success) {
                successIdsToUpdate.push(res.id);
                processingResults.success.push(res.id);
            } else {
                failedIdsToUpdate.push(res.id);
                processingResults.failed.push({
                    orderId: res.id,
                    reason: res.reason
                });
            }
        }

        if (successIdsToUpdate.length > 0) {
            await updateOrdersStatus(merchant.id, successIdsToUpdate, 'SUCCESS');
        }

        if (failedIdsToUpdate.length > 0) {
            await updateOrdersStatus(merchant.id, failedIdsToUpdate, 'FAILED');
        }

        processingResults.totalProcessed += batch.length;
    }

    return processingResults;
};

module.exports = {
    processOrdersBatch
};