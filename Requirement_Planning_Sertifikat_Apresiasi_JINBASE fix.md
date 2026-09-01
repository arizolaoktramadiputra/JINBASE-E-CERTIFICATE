# Requirement Planning
## Aplikasi Web Sertifikat Apresiasi Digital — JINBASE Indonesia

---

## 1. Ringkasan Proyek

**Nama Proyek:** Digital Appreciation Certificate Platform — BTS JIN Project (JINBASE Indonesia)

**Tujuan Utama:** Membangun aplikasi web yang memungkinkan kontributor (donatur uang maupun pembeli merchandise) untuk mencari namanya dalam database dan mendapatkan sertifikat apresiasi digital yang personal, dengan pengalaman visual yang halus dan berkesan (fade-in, loading animasi, dan reveal sertifikat berupa efek flip kartu).

**Referensi:** Brief PDF "Site for Collecting Appreciation Card Contributors" (3 halaman) menjadi acuan visual dan alur dasar. Dokumen ini memperluasnya menjadi rencana kebutuhan (requirement) yang siap dieksekusi oleh tim desain & development, termasuk penambahan fitur animasi flip kartu yang diminta.

---

## 2. Tujuan & Sasaran (Objectives)

| # | Tujuan | Ukuran Keberhasilan |
|---|--------|----------------------|
| 1 | Kontributor dapat menemukan sertifikat dengan mudah lewat nama/email | Waktu pencarian < 3 detik, tingkat keberhasilan pencarian > 95% untuk data valid |
| 2 | Pengalaman visual terasa premium & personal (bukan generator sertifikat generik) | Feedback kualitatif positif dari komunitas, animasi berjalan mulus di perangkat low-end |
| 3 | Sertifikat dapat disimpan/diunduh sebagai bukti apresiasi | Fitur download berfungsi di desktop & mobile (PNG/PDF) |
| 4 | Membedakan jenis kontribusi (donasi uang vs merchandise) secara visual | Template merah (uang) dan pink (merch) terimplementasi sesuai data |
| 5 | Data kontributor aman dan tidak disalahgunakan | Tidak ada eksposur data pihak lain saat pencarian |

---

## 3. Ruang Lingkup (Scope)

### 3.1 In-Scope
- Landing page pencarian nama/email dengan background video/foto + efek fade-in teks + search bar aktif
- Proses pencarian dengan status loading (animasi ikon maskot dengan efek pulse/loop)
- Hasil pencarian: **ditemukan** → lanjut ke reveal sertifikat; **tidak ditemukan** → tampilkan pesan "not participating"
- Reveal sertifikat dengan **animasi flip kartu 3D** (permintaan tambahan user)
- Dua jenis template sertifikat: merah (donasi uang) dan pink (donasi merchandise)
- Fitur download/save sertifikat (gambar atau PDF)
- Database kontributor (nama, email, jenis kontribusi, nominal/item, tanggal)
- Responsive design (desktop & mobile, sesuai 2 mockup ukuran di brief)

### 3.2 Out-of-Scope (asumsi awal, perlu konfirmasi)
- Sistem pembayaran/donasi itu sendiri (aplikasi ini hanya *menampilkan* sertifikat, bukan memproses donasi)
- Login/akun pengguna permanen (pencarian bersifat *stateless*, tanpa akun)
- Fitur sosial (share ke Instagram/Twitter otomatis) — bisa jadi fase 2
- Multi-bahasa (brief menggunakan Bahasa Indonesia untuk instruksi, Inggris untuk UI teks sertifikat) — perlu keputusan apakah UI full Inggris atau bilingual

---

## 4. Persona & Aktor

| Aktor | Deskripsi | Kebutuhan |
|-------|-----------|-----------|
| **Kontributor (End User)** | Fans BTS Jin/ARMY yang telah berdonasi uang atau membeli merchandise proyek | Mudah mencari nama, cepat, hasil personal, bisa disimpan |
| **Admin JINBASE** | Tim pengelola proyek yang meng-input data kontributor | Kemudahan upload/update database (idealnya via CSV/spreadsheet import atau dashboard sederhana), kontrol atas nama yang tampil di sertifikat |
| **(Opsional) Superadmin/Developer** | Pengelola sistem teknis | Monitoring uptime, log pencarian, keamanan data |

---

## 5. Alur Pengguna (User Flow) — Detail per Tahap

### Tahap 1 — Landing Page
- Background: video atau foto (loop, muted, autoplay) bertema BTS Jin
- Teks "Thank You" muncul dengan efek **fade-in halus** (durasi ~1–1.5 detik, delay bertahap antar elemen: judul → search bar → label "as BTS JIN PROJECT Contributors")
- Search bar dengan placeholder "Find Your Name or Email", tombol search (ikon kaca pembesar) aktif dengan hover/tap state
- Validasi input dasar: tidak boleh kosong, trim whitespace, opsional: minimal 2 karakter

### Tahap 2 — Proses Pencarian (Loading State)
- Setelah submit, tampil layar/modal "Looking for your name……" dengan maskot (ikon custom, bukan BT21 asli karena isu hak cipta — lihat Catatan Legal di bagian 9)
- Animasi: efek **pulse** (scale membesar-mengecil berulang) atau alternatif loop sederhana (bobbing/floating)
- Durasi loading: idealnya 800ms–2 detik (cukup untuk terasa "proses", tidak terlalu lama untuk terasa lambat) — bisa disesuaikan dengan waktu respons API sesungguhnya

### Tahap 3 — Hasil Pencarian
**Case A: Ditemukan ("We found you!")**
- Tampilkan pesan sukses singkat dengan maskot senang
- Lanjut otomatis (atau via tombol "Lihat Sertifikat") ke Tahap 4

**Case B: Tidak Ditemukan**
- Pesan: "Sorry, it seems you are not participating in this project."
- Sertakan CTA sekunder: "Coba cari lagi" atau "Hubungi admin jika ini keliru" (link ke kontak/CS)
- **Catatan penting:** hindari pesan yang menyudutkan user secara emosional; gunakan nada netral & suportif

### Tahap 4 — Reveal Sertifikat (Animasi Flip Kartu) ⭐ *Fitur tambahan yang diminta user*
- Sertifikat muncul dengan **animasi 3D card flip** (rotasi sumbu Y 0°→180°, durasi 0.6–0.9 detik, easing `ease-in-out` atau cubic-bezier custom)
- Sisi depan kartu (sebelum flip): bisa berupa "kartu tertutup" bertema BTS JIN Project (logo + tulisan "Tap/Klik untuk membuka" atau auto-flip)
- Sisi belakang (hasil flip): sertifikat lengkap dengan nama, pesan apresiasi, dan branding
- Template dinamis berdasarkan jenis kontribusi:
  - **Merah** → "AN APPRECIATION CARD" untuk donasi uang
  - **Pink** → "APPRECIATION CARD" + badge "DONATION MERCH" untuk pembelian merchandise
- Tombol download (ikon panah bawah) muncul setelah animasi flip selesai
- Opsi: tombol "Cari nama lain" untuk kembali ke Tahap 1

### Tahap 5 — Download/Simpan
- Export ke format gambar (PNG/JPG) resolusi tinggi untuk dibagikan ke media sosial
- Opsional: export PDF untuk kualitas cetak
- Nama file otomatis, misal: `Appreciation_Card_[NamaKontributor].png`

---

## 6. Kebutuhan Fungsional (Functional Requirements)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-01 | Sistem dapat menerima input nama ATAU email untuk pencarian | Must Have |
| FR-02 | Sistem melakukan pencocokan data dengan database kontributor (exact match & fuzzy match untuk typo minor) | Must Have |
| FR-03 | Sistem menampilkan status loading dengan animasi selama proses pencarian | Must Have |
| FR-04 | Sistem menampilkan pesan sukses/gagal sesuai hasil pencarian | Must Have |
| FR-05 | Sistem merender sertifikat dengan animasi flip kartu 3D | Must Have |
| FR-06 | Sistem membedakan template sertifikat berdasarkan jenis kontribusi (uang/merch) | Must Have |
| FR-07 | Sistem menyediakan fitur download sertifikat (PNG minimal) | Must Have |
| FR-08 | Admin dapat mengelola (tambah/update/hapus) data kontributor | Must Have |
| FR-09 | Sistem menangani kasus nama duplikat (2+ orang nama sama) — perlu strategi disambiguasi | Should Have |
| FR-10 | Sistem mencatat log pencarian (untuk analitik, tanpa data sensitif) | Could Have |
| FR-11 | Fitur share langsung ke media sosial | Could Have |
| FR-12 | Export sertifikat ke PDF | Could Have |

---

## 7. Kebutuhan Non-Fungsional (Non-Functional Requirements)

| Kategori | Detail |
|----------|--------|
| **Performa** | Waktu muat halaman awal < 3 detik meski ada video background (gunakan kompresi video/lazy-load, fallback ke foto statis di koneksi lambat) |
| **Responsivitas** | Layout menyesuaikan desktop, tablet, mobile (brief menunjukkan 2 varian ukuran) |
| **Kompatibilitas Browser** | Chrome, Safari, Firefox, Edge (versi 2 tahun terakhir); animasi CSS/JS harus punya fallback jika `prefers-reduced-motion` aktif |
| **Aksesibilitas** | Kontras teks cukup di atas background video/foto; animasi tidak boleh memicu masalah bagi pengguna sensitif terhadap gerakan (motion sickness) — sediakan opsi skip animasi |
| **Keamanan & Privasi** | Data nama/email tidak boleh bisa "ditebak" massal (rate limiting pencarian untuk cegah scraping data kontributor); tidak menampilkan data sensitif (nominal donasi) ke publik tanpa izin |
| **Skalabilitas** | Database mampu menampung ribuan entri kontributor tanpa penurunan performa pencarian |
| **Maintainability** | Template sertifikat sebaiknya berbasis komponen (mudah ganti warna/teks tanpa ubah kode inti) |

---

## 8. Kebutuhan Data & Struktur Database (Draft Skema)

**Tabel: `contributors`**

| Field | Tipe | Keterangan |
|-------|------|------------|
| id | UUID/int | Primary key |
| full_name | string | Nama yang dicari user |
| email | string | Alternatif kunci pencarian, sebaiknya di-hash sebagian untuk display |
| contribution_type | enum | `money` / `merchandise` |
| contribution_detail | string/decimal | Nominal (jika uang) atau nama item (jika merch) — opsional ditampilkan atau tidak |
| certificate_template | enum | `red` / `pink` (bisa auto-derive dari contribution_type) |
| donation_date | date | Untuk histori/arsip |
| is_active | boolean | Untuk soft-delete/menonaktifkan entri tanpa hapus permanen |
| created_at / updated_at | timestamp | Audit trail |

**Pertimbangan tambahan:**
- Apakah pencarian by-email menampilkan email penuh di sertifikat? (Rekomendasi: **tidak**, cukup nama yang tampil demi privasi)
- Bagaimana jika satu orang berkontribusi 2x (uang & merch)? Perlu keputusan: gabung jadi satu sertifikat gabungan, atau tampilkan keduanya sebagai list pilihan?
- Import data: sebaiknya admin bisa upload via CSV/Excel agar tidak input manual satu-satu

---

## 9. Catatan Legal & Konten (Penting)

- **Maskot BT21 (Koya/RJ)** yang muncul di mockup brief adalah IP resmi milik HYBE/LINE Friends. Untuk produksi nyata, tim **wajib** menggunakan ilustrasi custom/lisensi resmi, bukan aset BT21 asli, untuk menghindari pelanggaran hak cipta.
- Foto artis (Jin BTS) di background juga perlu dipastikan sumber & izin penggunaannya (foto resmi berlisensi, foto fan-made dengan izin, atau ilustrasi alternatif) — bukan sekadar foto hasil pencarian internet.
- Ini adalah pertimbangan yang perlu didiskusikan dengan tim legal/manajemen proyek JINBASE sebelum go-live, bukan sesuatu yang bisa diputuskan sepihak oleh tim development.

---

## 10. Rancangan Arsitektur Teknis (Keputusan Final)

**Stack yang dipilih: Next.js (React) + Tailwind CSS**, dioptimalkan untuk kecepatan pengembangan (time-to-launch singkat) tanpa mengorbankan kualitas animasi dan skalabilitas jangka pendek-menengah.

| Layer | Pilihan Final | Alasan Dipilih untuk Waktu Pengembangan Singkat |
|-------|----------------|---------------------------------------------------|
| Framework Utama | **Next.js 14+ (App Router), React, TypeScript** | Satu framework untuk frontend + backend (API Routes) sekaligus — tidak perlu setup server terpisah, mempercepat development karena tim hanya kelola satu codebase |
| Styling | **Tailwind CSS** | Styling langsung di komponen tanpa bolak-balik file CSS terpisah, mempercepat iterasi desain terutama untuk 2 varian warna sertifikat (merah/pink) via utility class & config theme |
| Animasi (fade-in, loading pulse, flip kartu 3D) | **Framer Motion** | Library animasi native untuk React, punya preset transform 3D (`rotateY`) dan `AnimatePresence` yang langsung cocok untuk flip kartu dan fade-in bertahap — tidak perlu menulis animasi manual dari nol |
| Backend/API Pencarian | **Next.js API Routes / Route Handlers** (built-in, tanpa server Node.js terpisah) | Tidak perlu setup Express/Fastify terpisah; endpoint `/api/search` cukup dibuat langsung di dalam project yang sama |
| Database | **Supabase (PostgreSQL managed)** | Setup database siap pakai dalam hitungan menit, sudah termasuk dashboard admin bawaan untuk input/update data kontributor tanpa perlu bangun admin panel dari nol di fase awal |
| Export Sertifikat (PNG/download) | **html-to-image** | Library ringan, langsung capture elemen sertifikat React jadi gambar, integrasi minimal dibanding jsPDF (PDF bisa jadi fase 2 jika dibutuhkan) |
| Hosting | **Vercel** | Deploy langsung dari repo Next.js dengan konfigurasi minimal (dibuat oleh tim yang sama dengan Next.js), termasuk CDN & optimasi video/gambar background otomatis |

**Kenapa kombinasi ini yang terbaik untuk waktu singkat (bukan opsi lain seperti Vue/Nuxt, Laravel, atau database self-hosted):**
1. **Satu ekosistem, satu bahasa** — Next.js menangani frontend & backend sekaligus dalam TypeScript/JavaScript, mengurangi context-switching tim dan waktu setup integrasi antar layer.
2. **Semua tools yang dipilih saling terintegrasi mulus** — Framer Motion dan Tailwind adalah pasangan paling umum dipakai bersama Next.js, dokumentasi & referensi implementasi (termasuk contoh card-flip) sangat banyak tersedia, mempercepat proses development tanpa banyak riset ulang.
3. **Supabase menghilangkan kebutuhan setup database & admin panel manual** — dashboard bawaannya bisa langsung dipakai tim admin JINBASE untuk input data kontributor tanpa menunggu fitur admin custom selesai dibangun.
4. **Deploy ke Vercel = nyaris tanpa konfigurasi DevOps** — cocok untuk tim kecil/timeline ketat karena tidak perlu mengurus server sendiri.

**Trade-off yang disadari:** jika di masa depan jumlah kontributor sangat besar (puluhan ribu+) atau butuh kontrol penuh atas server, tim bisa migrasi ke database self-hosted atau backend terpisah — namun untuk kebutuhan awal proyek ini (skala komunitas fan project), stack di atas paling efisien dari sisi waktu dan biaya.

---

## 11. Wireframe Reference Mapping (dari Brief PDF)

| Halaman Brief | Nama Tahap di Requirement Ini |
|---------------|-------------------------------|
| Page 1 — Landing search | Tahap 1: Landing Page |
| Page 2 — Loading & hasil (found/not found) | Tahap 2 & 3 |
| Page 3 — Appreciation card + download | Tahap 4 & 5 (dengan tambahan animasi flip) |
| Halaman tambahan — 2 varian warna (merah/pink) | FR-06, skema data `certificate_template` |

---

## 12. Edge Cases & Pertanyaan Terbuka (Perlu Klarifikasi ke Stakeholder)

1. Bagaimana jika nama yang dicari mengandung typo ringan? Apakah perlu fuzzy search atau strict match saja?
2. Apakah satu kontributor bisa punya lebih dari satu jenis kontribusi (uang + merch)? Bagaimana tampilannya?
3. Apakah nominal donasi ditampilkan di sertifikat, atau cukup ucapan apresiasi generik?
4. Berapa lama sertifikat ini akan "hidup" — apakah ada tenggat waktu/expired, atau permanen bisa diakses kapan saja?
5. Apakah dibutuhkan fitur admin dashboard penuh, atau cukup update via spreadsheet yang di-sync berkala?
6. Target jumlah kontributor (ratusan/ribuan) — untuk estimasi kebutuhan database & performa?
7. Apakah perlu proteksi tambahan (captcha) untuk mencegah bot melakukan pencarian massal ke seluruh database?

---

## 13. Rencana Tahapan Pengembangan (Usulan Timeline)

| Fase | Deliverable | Estimasi |
|------|-------------|----------|
| 1. Discovery & Klarifikasi | Jawaban atas pertanyaan di Bagian 12, finalisasi konten legal (Bagian 9) | 3–5 hari |
| 2. UI/UX Design | Desain high-fidelity semua state (landing, loading, found/not found, card flip, download) | 1–2 minggu |
| 3. Setup Database & Admin Input | Struktur data final, mekanisme input data kontributor | 3–5 hari (paralel dengan Fase 2) |
| 4. Development Frontend + Animasi | Implementasi fade-in, loading pulse, flip kartu 3D | 2–3 minggu |
| 5. Development Backend/API Pencarian | Endpoint search, validasi, rate limiting | 1 minggu (paralel) |
| 6. Integrasi Export/Download | Generate PNG/PDF sertifikat | 3–5 hari |
| 7. Testing (QA) | Cross-browser, cross-device, uji beban pencarian | 1 minggu |
| 8. Soft Launch & Feedback | Rilis terbatas ke sebagian komunitas, kumpulkan feedback | 3–5 hari |
| 9. Go-Live | Rilis penuh | — |

---

## 14. Ringkasan Rekomendasi Prioritas

1. **Selesaikan dulu isu legal aset visual** (maskot & foto artis) sebelum desain final dikerjakan.
2. **Definisikan skema data kontributor** secepatnya karena ini menjadi fondasi seluruh alur pencarian dan template sertifikat.
3. **Animasi flip kartu** sebaiknya dibangun sebagai komponen terpisah & reusable, agar mudah diuji performanya di berbagai device sebelum diintegrasikan ke alur penuh.
4. **Uji privasi & keamanan pencarian** sejak awal — ini aplikasi publik yang mengakses data personal kontributor, jadi rate limiting dan minim-eksposur data adalah prioritas, bukan tambahan di akhir.

---

*Dokumen ini adalah hasil analisis requirement berdasarkan brief visual yang diberikan. Siap digunakan sebagai acuan diskusi lanjutan dengan tim desain, developer, dan stakeholder JINBASE Indonesia sebelum masuk ke tahap desain teknis (wireframe/prototype) dan development.*
