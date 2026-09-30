const request = require('supertest');
const app = require('../index');

// Mock Repositories and External Service
jest.mock('../src/repositories/merchant.repository');
jest.mock('../src/repositories/order.repository');
jest.mock('../src/services/external.service');

const merchantRepo = require('../src/repositories/merchant.repository');
const orderRepo = require('../src/repositories/order.repository');
const externalService = require('../src/services/external.service');

describe('Order Processing API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('1. Successful order processing (Multiple orders)', async () => {
        // Setup Mocks
        merchantRepo.getMerchantById.mockResolvedValue({ id: 'merchant-123', name: 'Test', active: true });
        
        // Asumsikan semua order berhasil di-lock (status PENDING & milik merchant)
        orderRepo.lockOrdersForProcessing.mockResolvedValue(['order-1', 'order-2']);
        
        // Mock API Eksternal selalu sukses
        externalService.hitExternalMockAPI.mockResolvedValue({ status: 200 });
        
        // Mock Update DB
        orderRepo.updateOrdersStatus.mockResolvedValue();

        const response = await request(app)
            .post('/orders/process')
            .send({
                merchantId: 'merchant-123',
                orderIds: ['order-1', 'order-2']
            });

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe("Batch processing completed");
        expect(response.body.data.success).toEqual(['order-1', 'order-2']);
        expect(response.body.data.failed.length).toBe(0);
        expect(orderRepo.updateOrdersStatus).toHaveBeenCalledWith('merchant-123', ['order-1', 'order-2'], 'SUCCESS');
    });

    test('2. Invalid merchant (Merchant tidak ada)', async () => {
        merchantRepo.getMerchantById.mockResolvedValue(null);

        const response = await request(app)
            .post('/orders/process')
            .send({
                merchantId: 'invalid-merchant',
                orderIds: ['order-1']
            });

        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe("Merchant tidak ditemukan di dalam sistem.");
    });

    test('3. Invalid merchant (Merchant tidak aktif)', async () => {
        merchantRepo.getMerchantById.mockResolvedValue({ id: 'merchant-123', active: false });

        const response = await request(app)
            .post('/orders/process')
            .send({
                merchantId: 'merchant-123',
                orderIds: ['order-1']
            });

        expect(response.statusCode).toBe(403);
        expect(response.body.error).toBe("Akun Merchant sedang tidak aktif, tolong aktifkan terlebih dahulu");
    });

    test('4. Invalid order (Sebagian gagal di-lock / Bukan PENDING)', async () => {
        merchantRepo.getMerchantById.mockResolvedValue({ id: 'merchant-123', active: true });
        
        // order-2 tidak dikembalikan (artinya gagal validasi di database)
        orderRepo.lockOrdersForProcessing.mockResolvedValue(['order-1']);
        externalService.hitExternalMockAPI.mockResolvedValue({ status: 200 });
        orderRepo.updateOrdersStatus.mockResolvedValue();

        const response = await request(app)
            .post('/orders/process')
            .send({
                merchantId: 'merchant-123',
                orderIds: ['order-1', 'order-2']
            });

        // Akan 207 Partial Success
        expect(response.statusCode).toBe(207);
        expect(response.body.data.success).toEqual(['order-1']);
        expect(response.body.data.failed).toEqual([
            { orderId: 'order-2', reason: 'Invalid Status / Invalid Merchant Relation' }
        ]);
    });

    test('5. Failed external request & Timeout (Partial Failure)', async () => {
        merchantRepo.getMerchantById.mockResolvedValue({ id: 'merchant-123', active: true });
        orderRepo.lockOrdersForProcessing.mockResolvedValue(['order-1', 'order-2']);
        
        // Mock order-1 sukses, order-2 gagal/timeout
        externalService.hitExternalMockAPI.mockImplementation(async (id) => {
            if (id === 'order-1') return { status: 200 };
            throw new Error("External service timeout / 500 Internal Error");
        });
        
        orderRepo.updateOrdersStatus.mockResolvedValue();

        const response = await request(app)
            .post('/orders/process')
            .send({
                merchantId: 'merchant-123',
                orderIds: ['order-1', 'order-2']
            });

        expect(response.statusCode).toBe(207);
        expect(response.body.data.success).toEqual(['order-1']);
        expect(response.body.data.failed).toEqual([
            { orderId: 'order-2', reason: 'External service timeout / 500 Internal Error' }
        ]);
        expect(orderRepo.updateOrdersStatus).toHaveBeenCalledWith('merchant-123', ['order-1'], 'SUCCESS');
        expect(orderRepo.updateOrdersStatus).toHaveBeenCalledWith('merchant-123', ['order-2'], 'FAILED');
    });

    test('6. All orders failed (422 Unprocessable Entity)', async () => {
        merchantRepo.getMerchantById.mockResolvedValue({ id: 'merchant-123', active: true });
        // Semua gagal di-lock (misal karena statusnya sudah PROCESSING semua)
        orderRepo.lockOrdersForProcessing.mockResolvedValue([]);

        const response = await request(app)
            .post('/orders/process')
            .send({
                merchantId: 'merchant-123',
                orderIds: ['order-1', 'order-2']
            });

        expect(response.statusCode).toBe(422); // Sesuai dengan controller
        expect(response.body.data.success.length).toBe(0);
        expect(response.body.data.failed.length).toBe(2);
    });
});
