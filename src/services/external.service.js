const hitExternalMockAPI = async (orderId) => {
    // Simulasi delay/latensi jaringan acak (antara 100ms hingga 500ms)
    const delay = Math.floor(Math.random() * 400) + 100;
    
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // Simulasi 10% kemungkinan layanan eksternal mengalami gangguan/timeout
            const isError = Math.random() < 0.1;
            
            if (isError) {
                reject(new Error("External service timeout / 500 Internal Error"));
            } else {
                resolve({ status: 200, message: "External processing success", orderId });
            }
        }, delay);
    });
};

module.exports = {
    hitExternalMockAPI
};
