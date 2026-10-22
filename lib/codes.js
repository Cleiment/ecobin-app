const crypto = require("node:crypto");

// Tanpa huruf/angka yang mudah tertukar (0/O, 1/I/L)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(prefix, length = 6) {
  let code = "";
  for (const byte of crypto.randomBytes(length)) code += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${code}`;
}

// Mencoba sampai kode belum dipakai di kolom tabel tertentu
function uniqueCode(db, prefix, table, column) {
  for (;;) {
    const code = randomCode(prefix);
    if (!db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`).get(code)) return code;
  }
}

module.exports = { randomCode, uniqueCode };
