# Batch Order Processing System

API Backend (Node.js) untuk memproses ribuan pesanan (hingga 10.000 pesanan) secara serentak (*batch processing*) ke layanan eksternal tanpa membebani memori server (RAM) dan kebal terhadap masalah *Race Condition*.

## Fitur Utama
1. **Batching & Chunking:** Memecah 10.000 Order ID menjadi *batch* kecil (misal: per 500 data) agar memori Node.js tidak *overload*.
2. **Concurrency Limiter:** Menjamin maksimal hanya 5 *request* HTTP yang berjalan bersamaan ke API eksternal menggunakan custom Promise Pool.
3. **Atomic Locking Database:** Mencegah *Double-Click* atau *Race Condition* menggunakan kueri SQL dengan klausa `ANY()` dan `RETURNING`.
4. **Isolasi Kegagalan:** Jika 1 pesanan gagal (timeout), tidak akan menghentikan eksekusi pesanan lainnya.
5. **Multi-Status HTTP Response:** Mengembalikan HTTP `207 Multi-Status` jika ada pesanan yang sukses namun ada juga yang gagal.

## Prasyarat
- Node.js (v18+)
- PostgreSQL

## Struktur Direktori & Deliverables
Proyek ini telah memenuhi seluruh *Deliverables* (Poin 15) dengan susunan *repository* sebagai berikut:
```text
SaaS_Merchant/
├── src/
│   ├── controllers/      # Layer rute dan HTTP handler
│   ├── db/               # Koneksi DB (index.js), skema (schema.sql), & seed data (seeder.js)
│   ├── repositories/     # Layer akses langsung ke Database (Query)
│   ├── services/         # Layer logika bisnis utama
│   └── utils/            # Fungsi bantuan independen (Concurrency, Array)
├── tests/                # Automated Tests (order.test.js, concurrency.test.js)
├── index.js              # Entry point aplikasi (Source Code)
├── package.json          # Dependencies & Scripts
└── README.md             # Dokumentasi
```

## Instalasi
1. Clone repositori ini.
2. Jalankan `npm install`.
3. Buat file `.env` di root direktori dengan referensi sebagai berikut:
   ```env
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=merchant_saas
   PORT=3000
   ```
4. Jalankan script DDL dari `src/db/schema.sql` di database PostgreSQL kamu.
5. Jalankan server:
   ```bash
   npm run dev
   ```
   ```bash
   node index.js
   ```

## Menjalankan Pengujian (Testing)
Aplikasi ini menggunakan **Jest** dan **Supertest** untuk pengujian integrasi dan unit (*Automated Testing*).
Untuk menjalankan pengujian, cukup eksekusi perintah berikut di terminal:
```bash
npm test
```
*Pastikan kamu tidak sedang menyalakan server dengan port yang sama saat menjalankan pengujian untuk menghindari bentrokan port.*

## Endpoint API
**POST /orders/process**

**Request Body:**
```json
{
  "merchantId": "uuid-string-valid",
  "orderIds": ["uuid-1", "uuid-2"]
}
```

**Response (HTTP 200 / 207 / 422):**
```json
{
    "message": "Batch processing completed",
    "data": {
        "totalProcessed": 2,
        "success": ["uuid-1"],
        "failed": [
            {
                "orderId": "uuid-2",
                "reason": "Invalid Status / Not Yours"
            }
        ]
    }
}
```

---

## 🏛️ Arsitektur Solusi (The Architecture of Solution)

Proyek ini menggunakan **Layered Architecture** (Controller - Service - Repository) untuk memisahkan *concern* dan memastikan skalabilitas yang baik:
1. **Controller Layer (`order.controller.js`)**: Bertanggung jawab menerima HTTP Request, memvalidasi input dasar (maksimal 10.000 pesanan), dan menentukan kode status HTTP yang tepat (200, 207, atau 422).
2. **Service Layer (`order.service.js`)**: Jantung dari aplikasi. Di sini terjadi logika bisnis, pembagian *array* menjadi kelompok kecil (*Chunking*), dan manajemen pemrosesan paralel (*Concurrency*).
3. **Repository Layer (`order.repository.js` & `merchant.repository.js`)**: Mengatur semua komunikasi langsung dengan database PostgreSQL.
4. **Utility Layer (`concurrency.util.js` & `array.util.js`)**: Kumpulan modul bantuan yang independen agar mudah diuji ulang (*Reusable*).

---

## 🛠️ Keputusan Teknis Penting (Important Technical Decisions)

1. **Pembuatan Custom Promise Pool (Tidak memakai package eksternal)**
   Sesuai instruksi larangan penggunaan modul `p-limit`, sistem membangun fungsi `executeWithConcurrencyLimit()` dari nol menggunakan algoritma `Set` dan `Promise.race()`. Algoritma ini memastikan batas limit koneksi (maks 5 request simultan) selalu terjaga tanpa memblokir seluruh *thread*.
2. **Atomic SQL Locking (`ANY($1)`) dibandingkan Sequential `UPDATE`**
   Melakukan validasi kondisi dan penguncian baris (*locking*) di dalam database menggunakan 1 perintah kueri jauh lebih cepat dibanding melooping 500 ID dan mengubahnya satu per satu dari *backend*. Hal ini tidak hanya memangkas latensi, tetapi juga menjamin 100% perlindungan dari ancaman *Race Condition* karena mengandalkan konsistensi langsung dari mesin RDBMS (PostgreSQL).
3. **Pembagian (*Chunking*) per 500 Pesanan**
   Mengirim 10.000 UUID secara bersamaan dapat menyumbat memori aplikasi dan menembus ambang batas maksimum pengikatan parameter (*Parameter Binding Limit*) bawaan driver PostgreSQL. Angka 500 dipilih sebagai *Sweet Spot* keamanan dan kecepatan.

---

## ⚠️ CATATAN PENTING PRODUCTION (Edge Case Mitigation)

### Kewajiban Pembuatan *Reconciliation Cron Job*
Pada sistem *batch processing* skala besar, status pesanan di-lock menjadi `PROCESSING` sebelum dikirim ke API Eksternal. 
Bagaimana jika di tengah-tengah proses eksekusi (sebelum sempat di-update menjadi `SUCCESS` atau `FAILED`), tiba-tiba **Server Node.js mati/restart** (karena *power outage* atau proses *deploy*)?

Pesanan-pesanan tersebut akan **terjebak (stuck)** selamanya di status `PROCESSING`. 

**Solusi (Wajib diterapkan di Production):**
Harus dibuat sebuah skrip *Cron Job* atau *Background Worker* yang berjalan setiap X menit (misal 15 menit) untuk melakukan "Sapu Bersih" (*Reconciliation*).
- **Logika Cron Job:** `SELECT id FROM orders WHERE status = 'PROCESSING' AND updated_at < (NOW() - INTERVAL '15 minutes');`
- Data yang tertangkap oleh kueri tersebut adalah data "hantu" yang macet. Cron Job harus mengubah kembali statusnya menjadi `PENDING` atau langsung menjadi `FAILED` agar bisa diproses ulang oleh Merchant.

### Pengujian Beban (*Load Testing*)
Untuk melihat performa memori (RAM) Node.js, kamu bisa melakukan Load-Test menggunakan Postman atau JMeter.
Kirimkan *request payload* berisikan **10.000 UUID pesanan (orderIds)** sekaligus. 
Dengan teknik *Chunking* (per 500) dan *Concurrency Limiting* (max 5) yang ada di kode ini, penggunaan RAM Node.js akan tetap stabil dan terhindar dari *Out-Of-Memory (OOM)*.

---

## 📌 Assumptions & Limitations (Performance Scaling)

Sesuai dengan kriteria performa, sistem ini **dibatasi secara paksa (*hard-limit*) maksimal 10.000 ID pesanan per request** di level Controller. 

**Mengapa dibatasi 10.000?**
API saat ini bersifat **Synchronous** (klien harus menunggu *response* HTTP sampai seluruh pesanan selesai diproses). Jika *merchant* mengirimkan 50.000 pesanan:
1. Waktu pemrosesan akan melebihi batas *Timeout* HTTP standar (biasanya 1–2 menit), menyebabkan koneksi terputus (*Connection Reset*).
2. Mem-*parsing* JSON berisi 50.000 UUID dalam satu waktu dapat memblokir *Event Loop* Node.js, sehingga aplikasi akan *freeze* dan tidak bisa melayani *request* dari *merchant* lain.

**Solusi Skalabilitas Masa Depan (Untuk > 10.000 Order):**
Jika bisnis berkembang pesat dan membutuhkan pemrosesan puluhan ribu order per request, arsitektur harus diubah menjadi **Asynchronous Processing via Message Broker** (seperti RabbitMQ, Kafka, atau Redis BullMQ).
- **Alur yang diusulkan:** Controller hanya bertugas menerima payload, memasukannya ke antrean (*Queue*), lalu langsung membalas dengan `HTTP 202 Accepted` ("Pesanan sedang diproses di latar belakang").
- *Background Worker* kemudian akan menarik pesan dari antrean dan memprosesnya secara bertahap (menggunakan metode *Chunking* dan *Concurrency Limiter* yang sama seperti pada sistem saat ini).
- Merchant dapat mengecek hasil akhirnya melalui API *Polling* tambahan (misal: `GET /orders/status`).
