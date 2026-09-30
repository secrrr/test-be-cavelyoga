const executeWithConcurrencyLimit = async (tasks, concurrency) => {
    const results = [];
    const executing = new Set();
    
    for (const task of tasks) {
        const p = Promise.resolve().then(() => task());
        results.push(p); 
        
        executing.add(p);
        
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
        
        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    
    return Promise.all(results);
};

module.exports = {
    executeWithConcurrencyLimit,
};
