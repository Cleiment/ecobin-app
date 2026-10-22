const express = require("express");
const QRCode = require("qrcode");
const db = require("../db/database");
const { requireUser } = require("../lib/auth");
const { redeem } = require("../lib/vouchers");

const router = express.Router();
router.use(requireUser);

const DEPOSIT_SELECT = `
  SELECT d.*, l.name AS location_name, c.name AS category_name, c.color AS category_color
  FROM deposits d
  JOIN locations l ON l.id = d.location_id
  JOIN categories c ON c.id = d.category_id`;

router.get("/", (req, res) => {
  const recent = db.all(`${DEPOSIT_SELECT} WHERE d.user_id = ? ORDER BY d.created_at DESC LIMIT 3`, req.user.id);
  const totals = db.get(`SELECT COALESCE(SUM(weight_kg), 0) AS kg, COUNT(*) AS count
                         FROM deposits WHERE user_id = ? AND status = 'diterima'`, req.user.id);
  const activeVouchers = db.get(`SELECT COUNT(*) AS n FROM redemptions
                                 WHERE user_id = ? AND status = 'aktif' AND expires_at > datetime('now')`, req.user.id).n;
  const cheapest = db.get("SELECT MIN(points_cost) AS cost FROM vouchers WHERE active = 1 AND stock > 0");
  res.page("user/home", { title: "Beranda", recent, totals, activeVouchers, cheapest: cheapest && cheapest.cost }, "user");
});

router.get("/qr", async (req, res) => {
  const svg = await QRCode.toString(req.user.member_code, {
    type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0A2E2C", light: "#FFFFFF" }
  });
  res.page("user/qr", { title: "QR Membership", svg }, "user");
});

router.get("/reward", (req, res) => {
  const vouchers = db.all("SELECT * FROM vouchers WHERE active = 1 ORDER BY retailer, points_cost");
  res.page("user/reward", { title: "Reward", vouchers }, "user");
});

router.post("/reward/:id/tukar", (req, res) => {
  const result = redeem(req.user.id, Number(req.params.id));
  if (result.error) {
    res.flash("error", result.error);
    return res.redirect("/app/reward");
  }
  res.flash("success", `Voucher berhasil ditukar. Kode vouchermu: ${result.code}`);
  res.redirect("/app/voucher");
});

router.get("/voucher", (req, res) => {
  const redemptions = db.all(`SELECT r.*, v.name AS voucher_name, v.retailer, v.nominal
                              FROM redemptions r JOIN vouchers v ON v.id = r.voucher_id
                              WHERE r.user_id = ? ORDER BY r.created_at DESC`, req.user.id);
  res.page("user/vouchers", { title: "Voucher Milikku", redemptions }, "user");
});

router.get("/riwayat", (req, res) => {
  const deposits = db.all(`${DEPOSIT_SELECT} WHERE d.user_id = ? ORDER BY d.created_at DESC`, req.user.id);
  const summary = db.get(`SELECT COALESCE(SUM(CASE WHEN status = 'diterima' THEN weight_kg END), 0) AS kg,
                                 COALESCE(SUM(points), 0) AS points,
                                 SUM(status = 'ditolak') AS rejected
                          FROM deposits WHERE user_id = ?`, req.user.id);
  res.page("user/history", { title: "Riwayat Setoran", deposits, summary }, "user");
});

router.get("/lokasi", (req, res) => {
  const locations = db.all("SELECT * FROM locations WHERE active = 1 ORDER BY status, name");
  res.page("user/locations", { title: "Lokasi EcoBin", locations }, "user");
});

router.get("/profil", (req, res) => {
  res.page("user/profile", { title: "Profil", values: { name: req.user.name }, errors: {} }, "user");
});

router.post("/profil", (req, res) => {
  const name = String(req.body.name || "").trim();
  if (name.length < 2 || name.length > 60) {
    return res.status(400).page("user/profile", {
      title: "Profil", values: { name }, errors: { name: "Nama harus 2 sampai 60 karakter." }
    }, "user");
  }
  db.run("UPDATE users SET name = ? WHERE id = ?", name, req.user.id);
  res.flash("success", "Nama berhasil disimpan.");
  res.redirect("/app/profil");
});

module.exports = router;
