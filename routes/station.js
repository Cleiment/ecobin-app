const express = require("express");
const db = require("../db/database");
const { requireAdmin } = require("../lib/auth");
const { findMember, processDeposit, MAX_QUANTITY } = require("../lib/deposits");

const router = express.Router();
router.use(requireAdmin);

router.get("/", (req, res) => {
  const locations = db.all("SELECT * FROM locations WHERE active = 1 ORDER BY status, name");
  res.page("station/select", { title: "Simulator Stasiun", locations }, "admin");
});

router.post("/api/member", (req, res) => {
  const member = findMember(req.body.code);
  if (!member) return res.status(404).json({ error: "Kode member tidak terdaftar. Periksa kodenya, lalu coba lagi." });
  res.json({ member: { name: member.name, code: member.member_code, points: member.points } });
});

router.get("/:id", (req, res, next) => {
  const location = db.get("SELECT * FROM locations WHERE id = ? AND active = 1", Number(req.params.id));
  if (!location) return next();
  if (location.status !== "aktif") {
    res.flash("error", `${location.name} berstatus Segera hadir. Ubah statusnya menjadi Aktif untuk memakai simulator.`);
    return res.redirect("/admin/stasiun");
  }
  const categories = db.all("SELECT id, name, color FROM categories WHERE active = 1 ORDER BY id");
  const items = db.all(`SELECT i.id, i.name, i.is_mixed FROM category_items i
                        LEFT JOIN categories c ON c.id = i.category_id
                        WHERE i.is_mixed = 1 OR c.active = 1 ORDER BY i.name`);
  const config = {
    location: { id: location.id, name: location.name, current: location.current_kg, capacity: location.capacity_kg },
    categories, items, maxQuantity: MAX_QUANTITY
  };
  res.page("station/kiosk", { title: `Stasiun ${location.name}`, location, config }, "kiosk");
});

router.post("/:id/setor", (req, res) => {
  const result = processDeposit({
    memberCode: req.body.code,
    locationId: Number(req.params.id),
    categoryId: Number(req.body.categoryId),
    itemId: Number(req.body.itemId),
    quantity: req.body.quantity
  });
  if (result.error) return res.status(result.httpStatus).json({ error: result.error });
  res.json({
    status: result.status,
    reason: result.reason,
    weight: result.weight,
    points: result.points,
    balance: result.balance,
    category: result.category,
    member: { name: result.member.name },
    location: result.location ? { current: result.location.current_kg, capacity: result.location.capacity_kg } : null
  });
});

module.exports = router;
