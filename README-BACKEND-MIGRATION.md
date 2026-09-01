# Migrasi Pencarian ke Backend — Ringkasan Perubahan

## Masalah yang diperbaiki
Sebelumnya, seluruh daftar kontributor (nama + email) dimuat lewat
`data/contributors.js` langsung ke browser. Artinya siapa pun yang
membuka halaman bisa membuka DevTools dan melihat **semua** email
kontributor lain — bukan cuma miliknya sendiri.

## Apa yang berubah

| Sebelum | Sesudah |
|---|---|
| `data/contributors.js` dimuat penuh ke browser | Data hanya ada di `server/data/contributors.json`, tidak pernah dikirim utuh ke client |
| `searchContributors()` jalan di browser | Logika pencarian (exact/substring/fuzzy Levenshtein) dipindah ke `server/server.js` |
| `maskEmail()` dipanggil di client | Email sudah di-mask oleh server sebelum dikirim |
| Delay loading pakai `setTimeout` palsu | Loading menunggu response asli dari `fetch()`, dengan jeda minimum 800ms agar animasi tetap halus |

## Cara menjalankan

```bash
# 1. Jalankan backend
cd appreciation-card-fix
npm install
npm start
# -> API aktif di http://localhost:3000

# 2. Buka index.html seperti biasa (lewat live-server / hosting statis apa pun)
#    Pastikan window.JINBASE_API_URL di index.html mengarah ke alamat server di atas.
```

## Yang perlu kamu lakukan sebelum deploy ke production

1. **Isi data asli** di `data/contributors.json` (format sama seperti
   contoh yang ada), lalu **jangan pernah commit file ini ke repo publik**.
   Tambahkan ke `.gitignore` dan simpan lewat environment/secret store,
   atau pindahkan ke database (Postgres/Supabase/Airtable) kalau datanya besar.
2. **Set `ALLOWED_ORIGIN`** di server (env var) ke domain frontend kamu,
   supaya API tidak bisa dipanggil sembarang situs lain.
3. **Update `window.JINBASE_API_URL`** di `index.html` ke alamat server
   production (mis. `https://api.btsjinproject.com`).
4. Deploy backend ke layanan seperti Render, Railway, Fly.io, atau VPS biasa.
   (Kalau mau serverless — Vercel/Cloudflare Workers — logic di `server.js`
   bisa dipindah ke satu function dengan penyesuaian kecil.)

## Trade-off yang perlu diketahui
- Mode `file://` (buka `index.html` langsung dari folder tanpa server) **tidak
  lagi berfungsi**, karena sekarang butuh backend yang berjalan. Ini konsekuensi
  wajar dari menutup celah privasi data — sebelumnya "praktis" karena semua
  data ada di client, tapi itu juga sumber masalahnya.
- Rate limiting sederhana (20 request/menit/IP) sudah ditambahkan di endpoint
  `/api/search` untuk mengurangi risiko orang menebak-nebak email satu per satu.
