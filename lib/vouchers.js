const db = require("../db/database");
const { uniqueCode } = require("./codes");

const VALID_DAYS = 30;

// Menukar Eco Point dengan voucher. Mengembalikan { code } atau { error }.
function redeem(userId, voucherId) {
  return db.transaction(() => {
    const user = db.get("SELECT points FROM users WHERE id = ?", userId);
    const voucher = db.get("SELECT * FROM vouchers WHERE id = ?", voucherId);

    if (!voucher || !voucher.active) return { error: "Voucher ini sudah tidak tersedia." };
    if (voucher.stock < 1) return { error: "Stok voucher ini habis. Pilih voucher lain." };
    if (user.points < voucher.points_cost) {
      const missing = voucher.points_cost - user.points;
      return { error: `Eco Point-mu kurang ${missing.toLocaleString("id-ID")} poin untuk voucher ini.` };
    }

    const code = uniqueCode(db.open(), "EBV", "redemptions", "code");
    db.run("UPDATE users SET points = points - ? WHERE id = ?", voucher.points_cost, userId);
    db.run("UPDATE vouchers SET stock = stock - 1 WHERE id = ?", voucherId);
    db.run(`INSERT INTO redemptions (user_id, voucher_id, code, points_spent, expires_at)
            VALUES (?, ?, ?, ?, datetime('now', '+${VALID_DAYS} days'))`, userId, voucherId, code, voucher.points_cost);
    return { code, voucher };
  });
}

module.exports = { redeem, VALID_DAYS };
