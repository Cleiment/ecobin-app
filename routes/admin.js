const express = require("express");
const db = require("../db/database");
const { requireAdmin } = require("../lib/auth");
const { fmt } = require("../lib/format");

const router = express.Router();
router.use(requireAdmin);

const RETAILERS = ["Indomaret", "Alfamart"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const text = (value) => String(value ?? "").trim();
const int = (value) => (/^\d+$/.test(text(value)) ? Number(text(value)) : NaN);
const decimal = (value) => {
  const n = Number(text(value).replace(",", "."));
  return text(value) === "" ? NaN : n;
};

// Validasi sederhana: kembalikan pesan error pertama, atau null
function firstError(checks) {
  for (const [ok, message] of checks) if (!ok) return message;
  return null;
}

function fail(res, message, back) {
  res.flash("error", message);
  res.redirect(back);
}

/* ---------- Dashboard ---------- */

router.get("/", (req, res) => {
  const kpi = db.get(`
    SELECT
      COALESCE((SELECT SUM(weight_kg) FROM deposits WHERE status = 'diterima'), 0) AS total_kg,
      (SELECT COUNT(*) FROM deposits) AS deposits,
      (SELECT COUNT(*) FROM deposits WHERE status = 'ditolak') AS rejected,
      (SELECT COUNT(DISTINCT user_id) FROM deposits WHERE created_at >= datetime('now', '-30 days')) AS active_users,
      (SELECT COUNT(*) FROM users WHERE role = 'user') AS users,
      (SELECT COUNT(*) FROM redemptions) AS redemptions`);
  const byCategory = db.all(`
    SELECT c.name, c.color, COALESCE(SUM(d.weight_kg), 0) AS kg
    FROM categories c LEFT JOIN deposits d ON d.category_id = c.id AND d.status = 'diterima'
    GROUP BY c.id ORDER BY kg DESC`);
  const byLocation = db.all(`
    SELECT l.name, COALESCE(SUM(d.weight_kg), 0) AS kg
    FROM locations l LEFT JOIN deposits d ON d.location_id = l.id AND d.status = 'diterima'
    WHERE l.status = 'aktif' GROUP BY l.id ORDER BY kg DESC`);
  const nearlyFull = db.all(`
    SELECT * FROM locations
    WHERE active = 1 AND status = 'aktif' AND current_kg >= capacity_kg * 0.8
    ORDER BY current_kg / capacity_kg DESC`);
  const recent = db.all(`
    SELECT d.*, u.name AS user_name, l.name AS location_name, c.name AS category_name, c.color AS category_color
    FROM deposits d JOIN users u ON u.id = d.user_id JOIN locations l ON l.id = d.location_id JOIN categories c ON c.id = d.category_id
    ORDER BY d.created_at DESC LIMIT 6`);
  res.page("admin/dashboard", { title: "Dashboard", kpi, byCategory, byLocation, nearlyFull, recent }, "admin");
});

/* ---------- Kategori dan contoh barang ---------- */

router.get("/kategori", (req, res) => {
  const categories = db.all(`SELECT c.*, (SELECT COUNT(*) FROM deposits d WHERE d.category_id = c.id) AS used
                             FROM categories c ORDER BY c.active DESC, c.id`);
  const items = db.all("SELECT * FROM category_items ORDER BY name");
  for (const c of categories) c.items = items.filter((i) => i.category_id === c.id);
  const mixed = items.filter((i) => i.is_mixed);
  res.page("admin/categories", { title: "Kategori Sampah", categories, mixed }, "admin");
});

function categoryInput(body) {
  return { name: text(body.name), ppk: int(body.points_per_kg), color: text(body.color) || "#0B766F" };
}
function categoryError(input, id = 0) {
  return firstError([
    [input.name.length >= 2, "Nama kategori minimal 2 huruf."],
    [!db.get("SELECT 1 FROM categories WHERE name = ? AND id != ?", input.name, id), `Kategori "${input.name}" sudah ada.`],
    [Number.isInteger(input.ppk), "Poin per kg harus berupa angka bulat, 0 atau lebih."],
    [HEX_COLOR.test(input.color), "Warna harus berformat #RRGGBB."]
  ]);
}

router.post("/kategori", (req, res) => {
  const input = categoryInput(req.body);
  const error = categoryError(input);
  if (error) return fail(res, error, "/admin/kategori");
  db.run("INSERT INTO categories (name, points_per_kg, color) VALUES (?, ?, ?)", input.name, input.ppk, input.color);
  res.flash("success", `Kategori ${input.name} ditambahkan.`);
  res.redirect("/admin/kategori");
});

router.post("/kategori/:id", (req, res) => {
  const id = Number(req.params.id);
  const input = categoryInput(req.body);
  const error = categoryError(input, id);
  if (error) return fail(res, error, "/admin/kategori");
  db.run("UPDATE categories SET name = ?, points_per_kg = ?, color = ?, active = ? WHERE id = ?",
    input.name, input.ppk, input.color, req.body.active ? 1 : 0, id);
  res.flash("success", `Kategori ${input.name} disimpan.`);
  res.redirect("/admin/kategori");
});

router.post("/kategori/:id/hapus", (req, res) => {
  const category = db.get("SELECT * FROM categories WHERE id = ?", Number(req.params.id));
  if (!category) return fail(res, "Kategori tidak ditemukan.", "/admin/kategori");
  const used = db.get("SELECT COUNT(*) AS n FROM deposits WHERE category_id = ?", category.id).n;
  if (used) return fail(res, `Kategori ${category.name} sudah dipakai di ${used} setoran, jadi tidak bisa dihapus. Nonaktifkan saja.`, "/admin/kategori");
  db.run("DELETE FROM categories WHERE id = ?", category.id);
  res.flash("success", `Kategori ${category.name} dihapus.`);
  res.redirect("/admin/kategori");
});

router.post("/barang", (req, res) => {
  const categoryId = text(req.body.category_id);
  const isMixed = categoryId === "";
  const input = { name: text(req.body.name), min: decimal(req.body.min_kg), max: decimal(req.body.max_kg) };
  const error = firstError([
    [input.name.length >= 2, "Nama barang minimal 2 huruf."],
    [isMixed || db.get("SELECT 1 FROM categories WHERE id = ?", Number(categoryId)), "Kategori tidak ditemukan."],
    [input.min > 0, "Berat minimum harus lebih dari 0 kg."],
    [input.max >= input.min, "Berat maksimum harus sama atau lebih besar dari berat minimum."]
  ]);
  if (error) return fail(res, error, "/admin/kategori");
  db.run("INSERT INTO category_items (category_id, name, min_kg, max_kg, is_mixed) VALUES (?, ?, ?, ?, ?)",
    isMixed ? null : Number(categoryId), input.name, input.min, input.max, isMixed ? 1 : 0);
  res.flash("success", `Barang ${input.name} ditambahkan.`);
  res.redirect("/admin/kategori");
});

router.post("/barang/:id/hapus", (req, res) => {
  const item = db.get("SELECT * FROM category_items WHERE id = ?", Number(req.params.id));
  if (item) db.run("DELETE FROM category_items WHERE id = ?", item.id);
  res.flash("success", item ? `Barang ${item.name} dihapus.` : "Barang sudah tidak ada.");
  res.redirect("/admin/kategori");
});

/* ---------- Voucher ---------- */

router.get("/voucher", (req, res) => {
  const vouchers = db.all(`SELECT v.*, (SELECT COUNT(*) FROM redemptions r WHERE r.voucher_id = v.id) AS redeemed
                           FROM vouchers v ORDER BY v.active DESC, v.retailer, v.points_cost`);
  res.page("admin/vouchers", { title: "Voucher", vouchers, retailers: RETAILERS }, "admin");
});

function voucherInput(body) {
  return { retailer: text(body.retailer), name: text(body.name), nominal: int(body.nominal), cost: int(body.points_cost), stock: int(body.stock) };
}
function voucherError(v) {
  return firstError([
    [RETAILERS.includes(v.retailer), "Pilih mitra Indomaret atau Alfamart."],
    [v.name.length >= 3, "Nama voucher minimal 3 huruf."],
    [v.nominal > 0, "Nominal harus angka bulat lebih dari 0."],
    [v.cost > 0, "Harga poin harus angka bulat lebih dari 0."],
    [Number.isInteger(v.stock), "Stok harus angka bulat, 0 atau lebih."]
  ]);
}

router.post("/voucher", (req, res) => {
  const v = voucherInput(req.body);
  const error = voucherError(v);
  if (error) return fail(res, error, "/admin/voucher");
  db.run("INSERT INTO vouchers (retailer, name, nominal, points_cost, stock) VALUES (?, ?, ?, ?, ?)", v.retailer, v.name, v.nominal, v.cost, v.stock);
  res.flash("success", `${v.name} ditambahkan.`);
  res.redirect("/admin/voucher");
});

router.post("/voucher/:id", (req, res) => {
  const v = voucherInput(req.body);
  const error = voucherError(v);
  if (error) return fail(res, error, "/admin/voucher");
  db.run("UPDATE vouchers SET retailer = ?, name = ?, nominal = ?, points_cost = ?, stock = ?, active = ? WHERE id = ?",
    v.retailer, v.name, v.nominal, v.cost, v.stock, req.body.active ? 1 : 0, Number(req.params.id));
  res.flash("success", `${v.name} disimpan.`);
  res.redirect("/admin/voucher");
});

router.post("/voucher/:id/hapus", (req, res) => {
  const voucher = db.get("SELECT * FROM vouchers WHERE id = ?", Number(req.params.id));
  if (!voucher) return fail(res, "Voucher tidak ditemukan.", "/admin/voucher");
  const used = db.get("SELECT COUNT(*) AS n FROM redemptions WHERE voucher_id = ?", voucher.id).n;
  if (used) return fail(res, `${voucher.name} sudah ditukar ${used} kali, jadi tidak bisa dihapus. Nonaktifkan saja.`, "/admin/voucher");
  db.run("DELETE FROM vouchers WHERE id = ?", voucher.id);
  res.flash("success", `${voucher.name} dihapus.`);
  res.redirect("/admin/voucher");
});

/* ---------- Lokasi dan unit ---------- */

router.get("/lokasi", (req, res) => {
  const locations = db.all(`
    SELECT l.*, (SELECT COUNT(*) FROM deposits d WHERE d.location_id = l.id) AS used,
           (SELECT MAX(emptied_at) FROM pickups p WHERE p.location_id = l.id) AS last_pickup
    FROM locations l ORDER BY l.active DESC, l.status, l.name`);
  res.page("admin/locations", { title: "Lokasi dan Unit", locations, retailers: RETAILERS }, "admin");
});

function locationInput(body) {
  return { retailer: text(body.retailer), name: text(body.name), address: text(body.address), status: text(body.status), capacity: decimal(body.capacity_kg) };
}
function locationError(l) {
  return firstError([
    [RETAILERS.includes(l.retailer), "Pilih jaringan gerai Indomaret atau Alfamart."],
    [l.name.length >= 3, "Nama gerai minimal 3 huruf."],
    [l.address.length >= 5, "Isi alamat gerai."],
    [["aktif", "segera"].includes(l.status), "Pilih status Aktif atau Segera hadir."],
    [l.capacity > 0, "Kapasitas harus lebih dari 0 kg."]
  ]);
}

router.post("/lokasi", (req, res) => {
  const l = locationInput(req.body);
  const error = locationError(l);
  if (error) return fail(res, error, "/admin/lokasi");
  db.run("INSERT INTO locations (retailer, name, address, status, capacity_kg) VALUES (?, ?, ?, ?, ?)", l.retailer, l.name, l.address, l.status, l.capacity);
  res.flash("success", `${l.name} ditambahkan.`);
  res.redirect("/admin/lokasi");
});

router.post("/lokasi/:id", (req, res) => {
  const l = locationInput(req.body);
  const error = locationError(l);
  if (error) return fail(res, error, "/admin/lokasi");
  db.run("UPDATE locations SET retailer = ?, name = ?, address = ?, status = ?, capacity_kg = ?, active = ? WHERE id = ?",
    l.retailer, l.name, l.address, l.status, l.capacity, req.body.active ? 1 : 0, Number(req.params.id));
  res.flash("success", `${l.name} disimpan.`);
  res.redirect("/admin/lokasi");
});

router.post("/lokasi/:id/kosongkan", (req, res) => {
  const back = text(req.body.back) === "dashboard" ? "/admin" : "/admin/lokasi";
  const location = db.get("SELECT * FROM locations WHERE id = ?", Number(req.params.id));
  if (!location) return fail(res, "Unit tidak ditemukan.", back);
  if (location.current_kg <= 0) return fail(res, `${location.name} sudah kosong.`, back);
  db.transaction(() => {
    db.run("INSERT INTO pickups (location_id, weight_kg) VALUES (?, ?)", location.id, location.current_kg);
    db.run("UPDATE locations SET current_kg = 0 WHERE id = ?", location.id);
  });
  res.flash("success", `${location.name} dikosongkan. ${fmt.kg(location.current_kg)} tercatat sebagai pengangkutan.`);
  res.redirect(back);
});

router.post("/lokasi/:id/hapus", (req, res) => {
  const location = db.get("SELECT * FROM locations WHERE id = ?", Number(req.params.id));
  if (!location) return fail(res, "Lokasi tidak ditemukan.", "/admin/lokasi");
  const used = db.get("SELECT COUNT(*) AS n FROM deposits WHERE location_id = ?", location.id).n;
  if (used) return fail(res, `${location.name} sudah menerima ${used} setoran, jadi tidak bisa dihapus. Nonaktifkan saja.`, "/admin/lokasi");
  db.transaction(() => {
    db.run("DELETE FROM pickups WHERE location_id = ?", location.id);
    db.run("DELETE FROM locations WHERE id = ?", location.id);
  });
  res.flash("success", `${location.name} dihapus.`);
  res.redirect("/admin/lokasi");
});

/* ---------- Pengguna ---------- */

router.get("/pengguna", (req, res) => {
  const q = text(req.query.q);
  const like = `%${q}%`;
  const users = db.all(`
    SELECT u.*,
      (SELECT COUNT(*) FROM deposits d WHERE d.user_id = u.id) AS deposits,
      (SELECT COALESCE(SUM(weight_kg), 0) FROM deposits d WHERE d.user_id = u.id AND d.status = 'diterima') AS kg,
      (SELECT MAX(created_at) FROM deposits d WHERE d.user_id = u.id) AS last_deposit
    FROM users u
    WHERE u.role = 'user' AND (? = '' OR u.name LIKE ? OR u.email LIKE ? OR u.member_code LIKE ?)
    ORDER BY u.created_at DESC`, q, like, like, like);
  res.page("admin/users", { title: "Pengguna", users, q }, "admin");
});

router.get("/pengguna/:id", (req, res, next) => {
  const user = db.get("SELECT * FROM users WHERE id = ? AND role = 'user'", Number(req.params.id));
  if (!user) return next();
  const deposits = db.all(`
    SELECT d.*, l.name AS location_name, c.name AS category_name, c.color AS category_color
    FROM deposits d JOIN locations l ON l.id = d.location_id JOIN categories c ON c.id = d.category_id
    WHERE d.user_id = ? ORDER BY d.created_at DESC LIMIT 50`, user.id);
  const redemptions = db.all(`SELECT r.*, v.name AS voucher_name, v.retailer FROM redemptions r JOIN vouchers v ON v.id = r.voucher_id
                              WHERE r.user_id = ? ORDER BY r.created_at DESC`, user.id);
  const totals = db.get(`SELECT COALESCE(SUM(CASE WHEN status = 'diterima' THEN weight_kg END), 0) AS kg,
                                COALESCE(SUM(points), 0) AS points, COUNT(*) AS n, SUM(status = 'ditolak') AS rejected
                         FROM deposits WHERE user_id = ?`, user.id);
  res.page("admin/user-detail", { title: user.name, user, deposits, redemptions, totals }, "admin");
});

/* ---------- Riwayat setoran ---------- */

router.get("/setoran", (req, res) => {
  const filters = {
    lokasi: text(req.query.lokasi),
    kategori: text(req.query.kategori),
    status: text(req.query.status),
    dari: text(req.query.dari),
    sampai: text(req.query.sampai)
  };
  const where = [];
  const params = [];
  if (filters.lokasi) { where.push("d.location_id = ?"); params.push(Number(filters.lokasi)); }
  if (filters.kategori) { where.push("d.category_id = ?"); params.push(Number(filters.kategori)); }
  if (["diterima", "ditolak"].includes(filters.status)) { where.push("d.status = ?"); params.push(filters.status); }
  // Tanggal filter dalam WIB (UTC+7), dibandingkan dengan waktu UTC di database
  if (/^\d{4}-\d{2}-\d{2}$/.test(filters.dari)) { where.push("d.created_at >= datetime(?, '-7 hours')"); params.push(filters.dari); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(filters.sampai)) { where.push("d.created_at < datetime(?, '+1 day', '-7 hours')"); params.push(filters.sampai); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const deposits = db.all(`
    SELECT d.*, u.name AS user_name, u.id AS uid, l.name AS location_name, c.name AS category_name, c.color AS category_color
    FROM deposits d JOIN users u ON u.id = d.user_id JOIN locations l ON l.id = d.location_id JOIN categories c ON c.id = d.category_id
    ${whereSql} ORDER BY d.created_at DESC LIMIT 300`, ...params);
  const summary = db.get(`
    SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN status = 'diterima' THEN weight_kg END), 0) AS kg,
           COALESCE(SUM(points), 0) AS points, SUM(status = 'ditolak') AS rejected
    FROM deposits d ${whereSql}`, ...params);
  const locations = db.all("SELECT id, name FROM locations ORDER BY name");
  const categories = db.all("SELECT id, name FROM categories ORDER BY name");
  res.page("admin/deposits", { title: "Riwayat Setoran", deposits, summary, filters, locations, categories }, "admin");
});

/* ---------- Penukaran voucher ---------- */

router.get("/penukaran", (req, res) => {
  const status = text(req.query.status);
  let where = "";
  if (status === "aktif") where = "WHERE r.status = 'aktif' AND r.expires_at > datetime('now')";
  if (status === "dipakai") where = "WHERE r.status = 'dipakai'";
  if (status === "kedaluwarsa") where = "WHERE r.status = 'aktif' AND r.expires_at <= datetime('now')";
  const redemptions = db.all(`
    SELECT r.*, u.name AS user_name, u.id AS uid, v.name AS voucher_name, v.retailer
    FROM redemptions r JOIN users u ON u.id = r.user_id JOIN vouchers v ON v.id = r.voucher_id
    ${where} ORDER BY r.created_at DESC LIMIT 300`);
  res.page("admin/redemptions", { title: "Penukaran Voucher", redemptions, status }, "admin");
});

router.post("/penukaran/:id/pakai", (req, res) => {
  const r = db.get("SELECT * FROM redemptions WHERE id = ?", Number(req.params.id));
  if (!r) return fail(res, "Penukaran tidak ditemukan.", "/admin/penukaran");
  if (fmt.redemptionStatus(r).label !== "Aktif") return fail(res, `Voucher ${r.code} tidak aktif, jadi tidak bisa ditandai dipakai.`, "/admin/penukaran");
  db.run("UPDATE redemptions SET status = 'dipakai', used_at = datetime('now') WHERE id = ?", r.id);
  res.flash("success", `Voucher ${r.code} ditandai sudah dipakai.`);
  res.redirect("/admin/penukaran");
});

module.exports = router;
