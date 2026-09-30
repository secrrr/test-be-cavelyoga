const { executeWithConcurrencyLimit } = require('../src/utils/concurrency.util');

describe('Concurrency Limit Utility', () => {
    test('Should not execute more than the concurrency limit at a time', async () => {
        const MAX_CONCURRENCY = 2;
        let currentlyExecuting = 0;
        let maxObservedExecuting = 0;

        // Bikin fungsi factory yang mensimulasikan pekerjaan (delay 50ms)
        const createTask = (id) => async () => {
            currentlyExecuting++;
            // Catat jumlah maksimal yang pernah berjalan bersamaan
            if (currentlyExecuting > maxObservedExecuting) {
                maxObservedExecuting = currentlyExecuting;
            }

            // Simulasi proses
            await new Promise(resolve => setTimeout(resolve, 50));
            
            currentlyExecuting--;
            return id;
        };

        const tasks = [
            createTask(1),
            createTask(2),
            createTask(3),
            createTask(4),
            createTask(5)
        ];

        const results = await executeWithConcurrencyLimit(tasks, MAX_CONCURRENCY);

        expect(results).toEqual([1, 2, 3, 4, 5]);
        // Validasi paling penting: Apakah pernah berjalan lebih dari limit (2)?
        expect(maxObservedExecuting).toBe(2); 
    });
});
