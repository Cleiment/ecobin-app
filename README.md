# EcoBin App

Aplikasi web EcoBin untuk **Pengguna** dan **Admin**, termasuk **Simulator Stasiun** pengganti Smart Waste Station fisik.

> EcoBin adalah konsep startup untuk tugas mata kuliah E-Bisnis. Nama mitra dan data yang ditampilkan merupakan contoh.

## Menjalankan

Butuh Node.js 22.13 atau lebih baru (memakai SQLite bawaan Node).

```bash
npm install
npm start
```

Buka `http://localhost:3000`. Saat pertama dijalankan, file `ecobin.db` dibuat dan diisi data awal secara otomatis. Terminal juga menampilkan alamat untuk membuka aplikasi dari HP di Wi-Fi yang sama.

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan server dan memuat ulang otomatis saat file berubah |
| `npm run reset-db` | Menghapus database dan membuat ulang dari data awal. Hentikan server dulu |

## Akun demo

Akun demo khusus prototipe lokal, ditulis di [db/seed.js](db/seed.js):

| Peran | Email | Password |
|---|---|---|
| Admin | admin@ecobin.example | ecobin-admin-2026 |
| Pengguna (cukup poin untuk tukar voucher) | rina@ecobin.example | ecobin-demo-2026 |
| Pengguna (poin belum cukup, sering ditolak) | sari@ecobin.example | ecobin-demo-2026 |

## Alur demo

1. **Laptop:** masuk sebagai admin, buka **Simulator Stasiun**, lalu pilih unit.
2. **HP:** buka alamat Wi-Fi dari terminal, masuk sebagai pengguna, lalu buka **QR Saya**.
3. Tunjukkan QR di HP ke webcam laptop, atau ketik kode member di simulator.
4. Pilih lubang dan barang. Barang yang salah lubang atau tercampur akan ditolak.
5. Di HP, poin dan riwayat langsung bertambah. Tukar poin di **Reward**.
6. Di laptop, tandai voucher **sudah dipakai** dan kosongkan unit yang hampir penuh.

Kamera hanya bisa dipakai di `localhost` atau HTTPS, jadi simulator dijalankan di laptop yang menjalankan server.

## Demo di Vercel

Aplikasi bisa di-deploy ke Vercel tanpa konfigurasi tambahan (Express terdeteksi otomatis dari `server.js`).

| Pengaturan | Nilai |
|---|---|
| Framework Preset | Express |
| Root Directory | kosong (root repo) |
| Node.js Version | 24.x (sesuai `engines` di `package.json`) |
| Build / Install Command | default |

Di Vercel, database otomatis ditaruh di `/tmp/ecobin.db` dan diisi data demo saat server mulai. **Data ini tidak permanen**: setoran, akun baru, dan voucher hasil demo bisa kembali ke data awal saat server Vercel dimulai ulang atau saat deploy baru. Jika Vercel menjalankan beberapa salinan server sekaligus, masing-masing punya database sendiri, jadi login bisa tiba-tiba terputus.

Karena Vercel memakai HTTPS, kamera HP juga bisa dipakai untuk simulator.

## Struktur

```
server.js             titik masuk Express
db/                   skema, koneksi node:sqlite, data awal
lib/                  login, kode, poin, voucher, setoran, format tampilan
routes/               auth, user (/app), admin (/admin), station (/admin/stasiun)
views/                template EJS: layouts, partials, auth, user, admin, station
public/               CSS, JS, font, logo, manifest
```

## Aturan sistem

- Eco Point = berat (kg) × poin per kg kategori, dibulatkan ke bawah. Setoran ditolak mendapat 0 poin.
- Voucher berlaku 30 hari sejak ditukar.
- Unit dengan isi ≥ 80% kapasitas ditandai **Hampir penuh** di dashboard.
- Kategori, voucher, dan lokasi yang sudah dipakai hanya bisa dinonaktifkan, tidak bisa dihapus.
