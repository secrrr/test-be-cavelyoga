const express = require('express');
const dotenv = require('dotenv');

// Load environment variables pertama kali sebelum import module lain
dotenv.config();

const app = express();

const orderController = require('./src/controllers/order.controller');

app.use(express.json());

const PORT = process.env.PORT;

app.get('/test', (req, res) => {
    res.send("coba koneksi berhasil")
})

app.use("/", orderController)

if (require.main === module) {
    app.listen(PORT, () => {
        console.log('Server running on port', PORT);
    });
}

module.exports = app;