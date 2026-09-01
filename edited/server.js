/**
 * JINBASE E-Certificate — Backend Search API
 * ============================================================
 * Tujuan utama file ini: memindahkan seluruh data kontributor
 * (nama + email) dan logika pencarian ke server, sehingga
 * browser pengguna TIDAK PERNAH menerima daftar lengkap
 * kontributor — hanya hasil pencarian yang relevan untuk
 * query yang mereka kirim.
 *
 * Database: SQLite (data/contributors.db) via better-sqlite3
 * Untuk mengisi database, jalankan dulu:
 *   node import-to-sqlite.js
 *
 * Cara jalankan:
 *   npm install
 *   node import-to-sqlite.js   ← sekali saja (atau saat data berubah)
 *   npm start
 *   -> API tersedia di http://localhost:3000/api/search
 * ============================================================
 */

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const Database  = require('better-sqlite3');
const fs        = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------
   KONEKSI DATABASE SQLITE
   Path bisa di-override via env: DB_PATH
------------------------------------------------------------ */
const DB_PATH = process.env.DB_PATH ||
  path.join(__dirname, 'data', 'contributors.db');

let db = null;

function openDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Database SQLite tidak ditemukan:', DB_PATH);
    console.error('   Jalankan terlebih dahulu: node import-to-sqlite.js');
    process.exit(1);
  }

  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');

  const countResult = db.prepare('SELECT COUNT(*) as c FROM contributors').get();
  console.log(`✅ Terhubung ke SQLite: ${DB_PATH}`);
  console.log(`   📦 Total kontributor  : ${countResult.c}`);

  const byType = db.prepare(
    "SELECT contribution_type, COUNT(*) as c FROM contributors GROUP BY contribution_type"
  ).all();
  byType.forEach(row =>
    console.log(`   ${row.contribution_type === 'merchandise' ? '🛍 ' : '💰'} ${row.contribution_type.padEnd(12)}: ${row.c}`)
  );
}

openDatabase();

/* ------------------------------------------------------------
   PREPARED STATEMENTS untuk pencarian
------------------------------------------------------------ */

/**
 * Cari berdasarkan email exact atau LIKE, menggunakan SQL
 * sehingga tidak perlu load semua data ke memori.
 */
const stmtExact = db.prepare(
  "SELECT id, name, email, contribution_type FROM contributors WHERE LOWER(email) = LOWER(?)"
);
const stmtLike = db.prepare(
  "SELECT id, name, email, contribution_type FROM contributors WHERE LOWER(email) LIKE LOWER(?) LIMIT 50"
);
const stmtAll = db.prepare(
  "SELECT id, name, email, contribution_type FROM contributors"
);

/* ------------------------------------------------------------
   MIDDLEWARE
------------------------------------------------------------ */
app.use(express.json());

// Batasi origin yang boleh memanggil API ini di production.
// Ganti '*' dengan domain frontend kamu, mis. 'https://btsjinproject.com'
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

// Rate limit: cegah brute-force menebak-nebak email satu per satu.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 20,             // maksimal 20 request pencarian per menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.' },
});

/* ------------------------------------------------------------
   HELPERS
------------------------------------------------------------ */
function normalize(str) {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function stripKey(str) {
  return normalize(str).replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local[0]}***@${domain}`;
}

/**
 * Pencarian multi-tier:
 * 1. SQL exact match      → score 0
 * 2. SQL LIKE %query%     → score 1
 * 3. In-memory fuzzy      → score 2+dist
 *    (hanya jika SQL match < 5 hasil, agar tidak memuat semua data tiap request)
 */
function searchContributors(query) {
  const q    = normalize(query);
  const qKey = stripKey(query);

  if (!q || q.length < 2) return [];

  // 1. Exact match (sangat cepat via index)
  const exact = stmtExact.all(q).map(c => ({ contributor: c, score: 0 }));
  if (exact.length > 0) {
    return exact.map(r => r.contributor);
  }

  // 2. SQL LIKE match (memanfaatkan index email sebagian)
  const likePattern = `%${q}%`;
  const likeResults = stmtLike.all(likePattern).map(c => ({ contributor: c, score: 1 }));

  if (likeResults.length >= 1) {
    return likeResults
      .sort((a, b) => a.score - b.score)
      .map(r => r.contributor);
  }

  // 3. Fuzzy fallback — hanya jika tidak ada hasil dari SQL
  //    Load semua dan lakukan Levenshtein (sama seperti sebelumnya)
  const allContributors = stmtAll.all();
  const fuzzy = [];

  for (const c of allContributors) {
    const emailKey = stripKey(c.email || '');
    if (qKey.length >= 4 && emailKey.length >= 4) {
      const dist    = levenshtein(qKey, emailKey);
      const maxDist = emailKey.length <= 10 ? 2 : 3;
      if (dist <= maxDist) {
        fuzzy.push({ contributor: c, score: 2 + dist });
      }
    }
  }

  return fuzzy.sort((a, b) => a.score - b.score).map(r => r.contributor);
}

/* ------------------------------------------------------------
   ROUTES
------------------------------------------------------------ */

// Health check — untuk memastikan server & data hidup
app.get('/api/health', (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM contributors').get();
    res.json({ status: 'ok', contributorsLoaded: count.c, db: 'sqlite' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/search
 * body: { email: string }
 *
 * Mengembalikan HANYA hasil yang cocok (maks 10), dengan email
 * di-mask. Tidak pernah mengirim seluruh database ke client.
 */
app.post('/api/search', searchLimiter, (req, res) => {
  const { email } = req.body || {};

  if (typeof email !== 'string' || email.trim().length < 3) {
    return res.status(400).json({ error: 'Masukkan minimal 3 karakter email.' });
  }

  const matches = searchContributors(email).slice(0, 10);

  const results = matches.map((c, i) => ({
    id: i,                              // hanya untuk keperluan disambiguasi di UI
    name: c.name,
    maskedEmail: maskEmail(c.email),
    contribution_type: c.contribution_type || 'money',
  }));

  return res.json({ results });
});

/* ------------------------------------------------------------
   START
------------------------------------------------------------ */
app.listen(PORT, () => {
  console.log(`\n🚀 JINBASE search API running at http://localhost:${PORT}`);
  console.log(`   GET  http://localhost:${PORT}/api/health`);
  console.log(`   POST http://localhost:${PORT}/api/search\n`);
});

// Tutup koneksi DB dengan bersih saat proses berhenti
process.on('SIGINT',  () => { db && db.close(); process.exit(0); });
process.on('SIGTERM', () => { db && db.close(); process.exit(0); });
