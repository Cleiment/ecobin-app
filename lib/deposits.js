const db = require("../db/database");

const MAX_QUANTITY = 50;

function findMember(code) {
  return db.get("SELECT id, name, member_code, points FROM users WHERE member_code = ? AND role = 'user'",
    String(code || "").trim().toUpperCase());
}

/*
 * Memproses satu setoran dari Simulator Stasiun, meniru validasi kamera AI:
 * - barang campuran selalu ditolak
 * - barang yang kategorinya tidak sama dengan lubang ditolak
 * - selain itu diterima: berat diacak dalam rentang barang, poin = floor(kg × poin/kg)
 * Mengembalikan { status, ... } atau { error, httpStatus }.
 */
function processDeposit({ memberCode, locationId, categoryId, itemId, quantity }) {
  const member = findMember(memberCode);
  if (!member) return { error: "Kode member tidak terdaftar.", httpStatus: 404 };

  const location = db.get("SELECT * FROM locations WHERE id = ?", locationId);
  if (!location || !location.active || location.status !== "aktif") return { error: "Unit ini tidak aktif.", httpStatus: 400 };
  if (location.current_kg >= location.capacity_kg) {
    return { error: "Unit penuh. Kosongkan unit dulu sebelum menerima setoran.", httpStatus: 409 };
  }

  const category = db.get("SELECT * FROM categories WHERE id = ? AND active = 1", categoryId);
  if (!category) return { error: "Lubang kategori ini tidak aktif.", httpStatus: 400 };

  const item = db.get("SELECT * FROM category_items WHERE id = ?", itemId);
  if (!item) return { error: "Barang tidak ditemukan.", httpStatus: 400 };

  const qty = Math.min(Math.max(Math.floor(Number(quantity) || 1), 1), MAX_QUANTITY);

  let reason = null;
  if (item.is_mixed) reason = "Sampah tercampur. Pisahkan dulu, lalu setor ulang.";
  else if (item.category_id !== category.id) reason = `Sampah tidak sesuai dengan lubang ${category.name}. Sampah dikeluarkan kembali.`;

  if (reason) {
    db.run(`INSERT INTO deposits (user_id, location_id, category_id, item_name, quantity, status, reason)
            VALUES (?, ?, ?, ?, ?, 'ditolak', ?)`, member.id, location.id, category.id, item.name, qty, reason);
    return { status: "ditolak", reason, member };
  }

  let weight = 0;
  for (let i = 0; i < qty; i++) weight += item.min_kg + Math.random() * (item.max_kg - item.min_kg);
  weight = Math.round(weight * 1000) / 1000;
  const points = Math.floor(weight * category.points_per_kg);

  return db.transaction(() => {
    db.run(`INSERT INTO deposits (user_id, location_id, category_id, item_name, quantity, weight_kg, points, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'diterima')`, member.id, location.id, category.id, item.name, qty, weight, points);
    db.run("UPDATE users SET points = points + ? WHERE id = ?", points, member.id);
    db.run("UPDATE locations SET current_kg = current_kg + ? WHERE id = ?", weight, location.id);
    const balance = db.get("SELECT points FROM users WHERE id = ?", member.id).points;
    const updated = db.get("SELECT current_kg, capacity_kg FROM locations WHERE id = ?", location.id);
    return { status: "diterima", weight, points, balance, category: category.name, member, location: updated };
  });
}

module.exports = { findMember, processDeposit, MAX_QUANTITY };
