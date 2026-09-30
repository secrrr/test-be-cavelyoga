const express = require('express');
const { createOrder, processOrdersBatch } = require('../services/order.service');

const router = express.Router();

router.post("/orders/process", async (req, res) => {
    try {
        const { merchantId, orderIds } = req.body;
        
        if (!merchantId || !orderIds || !Array.isArray(orderIds)) {
             return res.status(400).json({ 
                 error: "Invalid request body. 'merchantId' (string) and 'orderIds' (array) are required." 
             });
        }

        if (orderIds.length > 10000) {
             return res.status(400).json({ 
                 error: "Maksimal order yang dapat diproses dalam satu waktu adalah 10.000." 
             });
        }

        const result = await processOrdersBatch(merchantId, orderIds);

        const isPartialFailure = result.failed.length > 0 && result.success.length > 0;
        const isAllFailed = result.failed.length > 0 && result.success.length === 0;

        let statusCode = 200;
        if (isPartialFailure) {
            statusCode = 207;
        } else if (isAllFailed) {
            statusCode = 422;
        }

        res.status(statusCode).json({
            message: "Batch processing completed",
            data: result
        });
    } catch (error) {
        console.error("Error Processing Orders Batch : ", error);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
    }
});

module.exports = router;