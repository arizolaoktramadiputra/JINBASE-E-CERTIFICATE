const Database = require('better-sqlite3');
const db = new Database('data/contributors.db', { readonly: true });

const count = db.prepare('SELECT COUNT(*) as c FROM contributors').get();
console.log('Total record:', count.c);

const exact = db.prepare('SELECT * FROM contributors WHERE LOWER(email) = ?').all('putrinoviyanti1494@gmail.com');
console.log('Exact match:', exact.length > 0 ? 'OK - ' + exact[0].name : 'TIDAK DITEMUKAN');

const like = db.prepare('SELECT * FROM contributors WHERE LOWER(email) LIKE ? LIMIT 5').all('%gmail%');
console.log('LIKE (gmail):', like.length, 'hasil');

const partial = db.prepare('SELECT * FROM contributors WHERE LOWER(email) LIKE ? LIMIT 5').all('%putri%');
console.log('LIKE (putri):', partial.length > 0 ? 'OK - ' + partial[0].name + ' | ' + partial[0].email : 'TIDAK DITEMUKAN');

db.close();
console.log('Verifikasi selesai!');
