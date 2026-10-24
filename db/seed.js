/*
 * Data awal EcoBin.
 *
 * Akun demo (khusus prototipe lokal):
 *   Admin     : admin@ecobin.example  / ecobin-admin-2026
 *   Pengguna  : rina@ecobin.example   / ecobin-demo-2026
 *   Pengguna  : sari@ecobin.example   / ecobin-demo-2026
 *
 * Jalankan `npm run reset-db` untuk menghapus database dan membuat ulang dari data ini.
 * Hentikan server terlebih dahulu, karena file database terkunci selama server berjalan.
 */
const fs = require("node:fs");
const path = require("node:path");
const { hashPassword } = require("../lib/password");
const { uniqueCode } = require("../lib/codes");

const ADMIN_PASSWORD = "ecobin-admin-2026";
const DEMO_PASSWORD = "ecobin-demo-2026";

// PRNG sederhana supaya riwayat demo selalu sama setiap reset
function prng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function sqliteTime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function seed(db) {
  const insert = (sql, ...params) => db.prepare(sql).run(...params).lastInsertRowid;

  db.exec("BEGIN");
  try {
    // Kategori dan contoh barang
    const categories = [
      { name: "Organik", ppk: 50, color: "#2DC98A", items: [["Kulit pisang", 0.1, 0.3], ["Sisa sayur", 0.2, 0.6], ["Ampas kopi", 0.05, 0.2], ["Daun kering", 0.05, 0.25]] },
      { name: "Anorganik", ppk: 100, color: "#0B766F", items: [["Botol plastik", 0.02, 0.05], ["Kardus", 0.1, 0.5], ["Kaleng minuman", 0.012, 0.02], ["Kertas bekas", 0.005, 0.02]] },
      { name: "Residu", ppk: 20, color: "#7E9692", items: [["Tisu bekas", 0.01, 0.05], ["Bungkus mi instan", 0.003, 0.008], ["Sachet kopi", 0.002, 0.005]] }
    ];
    const catIds = {};
    const items = {};
    for (const c of categories) {
      catIds[c.name] = insert("INSERT INTO categories (name, points_per_kg, color) VALUES (?, ?, ?)", c.name, c.ppk, c.color);
      for (const [name, min, max] of c.items) {
        items[name] = { category: c.name, min, max };
        insert("INSERT INTO category_items (category_id, name, min_kg, max_kg) VALUES (?, ?, ?, ?)", catIds[c.name], name, min, max);
      }
    }
    insert("INSERT INTO category_items (category_id, name, min_kg, max_kg, is_mixed) VALUES (NULL, ?, ?, ?, 1)", "Campuran botol dan tisu", 0.05, 0.2);
    insert("INSERT INTO category_items (category_id, name, min_kg, max_kg, is_mixed) VALUES (NULL, ?, ?, ?, 1)", "Kantong sampah tercampur", 0.3, 1.5);

    // Lokasi (sama dengan Company Profile): 9 aktif, 4 segera hadir di Kota Pontianak dan Kubu Raya.
    // Ahmad Yani dan Imam Bonjol sengaja hampir penuh untuk demo dashboard.
    const locations = [
      ["Indomaret", "Indomaret Ahmad Yani", "Jl. Ahmad Yani, Pontianak Selatan", "aktif", 150, 128.4],
      ["Indomaret", "Indomaret Reformasi", "Jl. Reformasi, Pontianak Tenggara", "aktif", 120, 41.2],
      ["Indomaret", "Indomaret Prof. M. Yamin", "Jl. Prof. M. Yamin, Pontianak Kota", "aktif", 150, 62.7],
      ["Indomaret", "Indomaret Gajah Mada", "Jl. Gajah Mada, Pontianak Selatan", "aktif", 150, 18.9],
      ["Indomaret", "Indomaret Imam Bonjol", "Jl. Imam Bonjol, Pontianak Selatan", "aktif", 120, 104.5],
      ["Indomaret", "Indomaret Kom. Yos Sudarso", "Jl. Kom. Yos Sudarso, Pontianak Barat", "aktif", 120, 33.6],
      ["Indomaret", "Indomaret Khatulistiwa", "Jl. Khatulistiwa, Pontianak Utara", "aktif", 120, 55.0],
      ["Indomaret", "Indomaret Tanjung Raya 2", "Jl. Tanjung Raya 2, Pontianak Timur", "segera", 120, 0],
      ["Indomaret", "Indomaret Parit Haji Husin 2", "Jl. Parit Haji Husin 2, Pontianak Tenggara", "segera", 120, 0],
      ["Indomaret", "Indomaret Sungai Raya Dalam", "Jl. Sungai Raya Dalam, Sungai Raya, Kubu Raya", "aktif", 150, 74.3],
      ["Indomaret", "Indomaret Adisucipto", "Jl. Adisucipto, Sungai Raya, Kubu Raya", "aktif", 150, 26.8],
      ["Indomaret", "Indomaret Trans Kalimantan", "Jl. Trans Kalimantan, Sungai Ambawang, Kubu Raya", "segera", 150, 0],
      ["Indomaret", "Indomaret Sungai Kakap", "Jl. Raya Sungai Kakap, Sungai Kakap, Kubu Raya", "segera", 120, 0]
    ];
    const activeLocIds = [];
    for (const [retailer, name, address, status, cap, cur] of locations) {
      const id = insert("INSERT INTO locations (retailer, name, address, status, capacity_kg, current_kg) VALUES (?, ?, ?, ?, ?, ?)", retailer, name, address, status, cap, cur);
      if (status === "aktif") activeLocIds.push(id);
    }

    // Voucher
    const vouchers = [
      ["Indomaret", "Voucher Belanja Indomaret Rp10.000", 10000, 500, 50],
      ["Indomaret", "Voucher Belanja Indomaret Rp25.000", 25000, 1200, 20]
    ];
    const voucherIds = vouchers.map((v) =>
      insert("INSERT INTO vouchers (retailer, name, nominal, points_cost, stock) VALUES (?, ?, ?, ?, ?)", ...v));

    // Akun
    insert("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
      "Admin EcoBin", "admin@ecobin.example", hashPassword(ADMIN_PASSWORD));

    const demoUsers = [
      { name: "Rina Aulia", email: "rina@ecobin.example", seed: 7, visits: 22, rejectRate: 0.08, redeem: true },
      { name: "Sari Wulandari", email: "sari@ecobin.example", seed: 21, visits: 10, rejectRate: 0.3, redeem: false }
    ];
    const ppk = Object.fromEntries(categories.map((c) => [c.name, c.ppk]));
    const itemNames = Object.keys(items);

    for (const u of demoUsers) {
      const userId = insert("INSERT INTO users (name, email, password_hash, member_code) VALUES (?, ?, ?, ?)",
        u.name, u.email, hashPassword(DEMO_PASSWORD), uniqueCode(db, "ECO", "users", "member_code"));
      const rand = prng(u.seed);
      let points = 0;

      for (let v = 0; v < u.visits; v++) {
        const daysAgo = Math.round(21 - (v * 20) / u.visits - rand() * 1.5);
        const when = new Date(Date.now() - daysAgo * 86400000);
        when.setUTCHours(2 + Math.floor(rand() * 12), Math.floor(rand() * 60), Math.floor(rand() * 60));
        const locationId = activeLocIds[Math.floor(rand() * activeLocIds.length)];
        const perVisit = 1 + Math.floor(rand() * 2);

        for (let d = 0; d < perVisit; d++) {
          const itemName = itemNames[Math.floor(rand() * itemNames.length)];
          const item = items[itemName];
          const created = sqliteTime(new Date(when.getTime() + d * 45000));

          if (rand() < u.rejectRate) {
            // Ditolak karena dimasukkan ke lubang yang salah
            const wrong = categories.find((c) => c.name !== item.category);
            insert(`INSERT INTO deposits (user_id, location_id, category_id, item_name, quantity, status, reason, created_at)
                    VALUES (?, ?, ?, ?, 1, 'ditolak', ?, ?)`,
              userId, locationId, catIds[wrong.name], itemName,
              `Sampah tidak sesuai dengan lubang ${wrong.name}. Sampah dikeluarkan kembali.`, created);
            continue;
          }

          const quantity = item.max < 0.06 ? 15 + Math.floor(rand() * 26) : 2 + Math.floor(rand() * 4);
          let weight = 0;
          for (let q = 0; q < quantity; q++) weight += item.min + rand() * (item.max - item.min);
          weight = Math.round(weight * 1000) / 1000;
          const earned = Math.floor(weight * ppk[item.category]);
          points += earned;
          insert(`INSERT INTO deposits (user_id, location_id, category_id, item_name, quantity, weight_kg, points, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'diterima', ?)`,
            userId, locationId, catIds[item.category], itemName, quantity, weight, earned, created);
        }
      }

      if (u.redeem && points >= 500) {
        const created = new Date(Date.now() - 5 * 86400000);
        const expires = new Date(created.getTime() + 30 * 86400000);
        insert("INSERT INTO redemptions (user_id, voucher_id, code, points_spent, created_at, expires_at) VALUES (?, ?, ?, 500, ?, ?)",
          userId, voucherIds[0], uniqueCode(db, "EBV", "redemptions", "code"), sqliteTime(created), sqliteTime(expires));
        db.prepare("UPDATE vouchers SET stock = stock - 1 WHERE id = ?").run(voucherIds[0]);
        points -= 500;
      }
      db.prepare("UPDATE users SET points = ? WHERE id = ?").run(points, userId);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = { seed };

// `node db/seed.js --reset`: hapus database lalu buat ulang
if (require.main === module && process.argv.includes("--reset")) {
  const { DB_PATH, open } = require("./database");
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = DB_PATH + suffix;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  open();
  console.log(`Database direset: ${path.relative(process.cwd(), DB_PATH)}`);
}
