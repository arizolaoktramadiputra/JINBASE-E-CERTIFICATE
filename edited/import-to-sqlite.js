/**
 * import-to-sqlite.js
 * ============================================================
 * Script untuk mengkonversi data kontributor (JSON / Excel)
 * menjadi SQLite database (data/contributors.db).
 *
 * Cara pakai:
 *   node import-to-sqlite.js
 *
 * Jalankan ulang script ini setiap kali file data/contributors.json
 * atau file Excel diperbarui.
 * ============================================================
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ── Path konfigurasi ──────────────────────────────────────────
const JSON_PATHS = [
  path.resolve(__dirname, '../data/contributors.json'),
  path.resolve(__dirname, 'data/contributors.json'),
];

const EXCEL_PATH = path.resolve(
  __dirname, '../database-donasi.xlsx'
);

const DB_DIR  = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'contributors.db');

// ── Pastikan direktori data ada ───────────────────────────────
fs.mkdirSync(DB_DIR, { recursive: true });

// ── Hapus DB lama jika ada ────────────────────────────────────
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('🗑  Database lama dihapus.');
}

// ── Buat SQLite database ──────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Buat tabel dengan skema lengkap
db.exec(`
  CREATE TABLE IF NOT EXISTS contributors (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    email             TEXT NOT NULL,
    search_key        TEXT,
    email_search_key  TEXT,
    contribution_type TEXT NOT NULL DEFAULT 'money',
    is_participant    INTEGER DEFAULT 1,
    amount            TEXT DEFAULT '0',
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_email ON contributors (email);
  CREATE INDEX IF NOT EXISTS idx_name  ON contributors (name);
  CREATE INDEX IF NOT EXISTS idx_search_key ON contributors (search_key);
  CREATE INDEX IF NOT EXISTS idx_email_search_key ON contributors (email_search_key);
`);

console.log('✅ Tabel contributors dibuat.');

const insertStmt = db.prepare(`
  INSERT INTO contributors (id, name, email, search_key, email_search_key, contribution_type, is_participant, amount)
  VALUES (@id, @name, @email, @search_key, @email_search_key, @contribution_type, @is_participant, @amount)
`);

// ── Cek apakah ada file contributors.json ──────────────────────
let jsonPathToUse = JSON_PATHS.find(p => fs.existsSync(p));

if (jsonPathToUse) {
  console.log(`📂 Membaca data dari JSON: ${jsonPathToUse}`);
  const raw = fs.readFileSync(jsonPathToUse, 'utf-8');
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed.contributors) ? parsed.contributors : (Array.isArray(parsed) ? parsed : []);
  console.log(`📊 Total item di JSON: ${items.length}`);

  const importAll = db.transaction((rows) => {
    let ok = 0, skip = 0, skipReasons = [];
    let autoId = 1;

    for (const row of rows) {
      const id    = (row.id || String(autoId).padStart(3, '0')).toString().trim();
      const name  = (row.name || '').toString().trim();
      const email = (row.email || '').toString().trim().toLowerCase();

      if (!name) {
        skip++;
        skipReasons.push(`Nama kosong (email: ${email || 'kosong'})`);
        continue;
      }
      if (!email || !email.includes('@')) {
        skip++;
        skipReasons.push(`Email tidak valid: "${email}" (nama: ${name})`);
        continue;
      }

      const search_key = row.search_key || name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email_search_key = row.email_search_key || email.toLowerCase().replace(/[^a-z0-9]/g, '');
      const contribution_type = row.contribution_type || 'money';
      const is_participant = row.is_participant === false ? 0 : 1;
      const amount = (row.amount || '0').toString();

      try {
        insertStmt.run({
          id,
          name,
          email,
          search_key,
          email_search_key,
          contribution_type,
          is_participant,
          amount
        });
        ok++;
      } catch (err) {
        skip++;
        skipReasons.push(`Gagal insert ID ${id} (${email}): ${err.message}`);
      }
      autoId++;
    }

    return { ok, skip, skipReasons };
  });

  const result = importAll(items);

  console.log('\n══════════════════════════════════════════');
  console.log('  ✅ Import Selesai!');
  console.log('══════════════════════════════════════════');
  console.log(`  📥 Total baris data    : ${items.length}`);
  console.log(`  ✔  Berhasil diimpor    : ${result.ok}`);
  console.log(`  ⚠  Dilewati (invalid)  : ${result.skip}`);

  if (result.skipReasons.length > 0) {
    console.log('\n  Detail baris yang dilewati:');
    result.skipReasons.slice(0, 10).forEach((r, i) => console.log(`    ${i + 1}. ${r}`));
  }

} else if (fs.existsSync(EXCEL_PATH)) {
  console.log(`📂 Membaca data dari Excel: ${EXCEL_PATH}`);
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
  console.log(`📊 Total baris di Excel: ${rows.length}`);

  const importAll = db.transaction((dataRows) => {
    let ok = 0, skip = 0, skipReasons = [];
    let autoId = 1;

    for (const row of dataRows) {
      const name  = (row[0] || '').toString().trim();
      const email = (row[1] || '').toString().trim().toLowerCase();

      if (!name) {
        skip++;
        skipReasons.push(`Nama kosong (email: ${email || 'kosong'})`);
        continue;
      }
      if (!email || !email.includes('@')) {
        skip++;
        skipReasons.push(`Email tidak valid: "${email}" (nama: ${name})`);
        continue;
      }

      const id = String(autoId).padStart(3, '0');
      const search_key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const email_search_key = email.toLowerCase().replace(/[^a-z0-9]/g, '');

      insertStmt.run({
        id,
        name,
        email,
        search_key,
        email_search_key,
        contribution_type: 'money',
        is_participant: 1,
        amount: '0'
      });
      ok++;
      autoId++;
    }

    return { ok, skip, skipReasons };
  });

  const result = importAll(rows);
  console.log(`✔  Berhasil diimpor dari Excel: ${result.ok}`);
} else {
  console.error('❌ Tidak ditemukan file contributors.json maupun Excel.');
  process.exit(1);
}

// Verifikasi final
const countResult = db.prepare('SELECT COUNT(*) as c FROM contributors').get();
const sample      = db.prepare('SELECT * FROM contributors LIMIT 5').all();

console.log(`\n  📦 Record di DB        : ${countResult.c}`);
console.log('\n  Sample data (5 pertama):');
sample.forEach(row =>
  console.log(`    [${row.id}] ${row.name} | ${row.email} | ${row.contribution_type} | Rp ${row.amount}`)
);

console.log(`\n  💾 Database tersimpan di: ${DB_PATH}`);
console.log('══════════════════════════════════════════\n');

db.close();
