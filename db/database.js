const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// Di Vercel folder proyek hanya bisa dibaca, jadi database ditaruh di /tmp.
// Data di /tmp tidak permanen: kembali ke data awal saat server Vercel dimulai ulang.
const DB_PATH = process.env.ECOBIN_DB
  || (process.env.VERCEL ? "/tmp/ecobin.db" : path.join(__dirname, "..", "ecobin.db"));

let db;

function open() {
  if (db) return db;
  const isNew = !fs.existsSync(DB_PATH);
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  if (isNew) {
    db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
    require("./seed").seed(db);
    console.log("Database baru dibuat dan diisi data awal.");
  }
  return db;
}

function get(sql, ...params) { return open().prepare(sql).get(...params); }
function all(sql, ...params) { return open().prepare(sql).all(...params); }
function run(sql, ...params) { return open().prepare(sql).run(...params); }

// Menjalankan fn dalam satu transaksi; dibatalkan seluruhnya jika fn melempar error.
function transaction(fn) {
  const conn = open();
  conn.exec("BEGIN");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

module.exports = { DB_PATH, open, get, all, run, transaction };
