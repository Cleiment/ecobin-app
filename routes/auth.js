const express = require("express");
const db = require("../db/database");
const { hashPassword, verifyPassword } = require("../lib/password");
const { uniqueCode } = require("../lib/codes");
const { startSession, endSession, homeFor } = require("../lib/auth");

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get("/", (req, res) => res.redirect(req.user ? homeFor(req.user) : "/masuk"));

router.get("/masuk", (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  res.page("auth/login", { title: "Masuk", values: {}, error: null });
});

router.post("/masuk", (req, res) => {
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  const user = email ? db.get("SELECT * FROM users WHERE email = ?", email) : null;

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(400).page("auth/login", {
      title: "Masuk",
      values: { email },
      error: "Email atau password salah. Periksa kembali, lalu coba lagi."
    });
  }
  startSession(res, user.id);
  res.redirect(homeFor(user));
});

router.get("/daftar", (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  res.page("auth/register", { title: "Daftar", values: {}, errors: {} });
});

router.post("/daftar", (req, res) => {
  const values = {
    name: String(req.body.name || "").trim(),
    email: String(req.body.email || "").trim()
  };
  const password = String(req.body.password || "");
  const errors = {};

  if (values.name.length < 2) errors.name = "Isi nama lengkapmu, minimal 2 huruf.";
  else if (values.name.length > 60) errors.name = "Nama terlalu panjang. Maksimal 60 karakter.";
  if (!values.email) errors.email = "Isi email yang aktif.";
  else if (!EMAIL_PATTERN.test(values.email)) errors.email = "Format email belum benar. Contoh: nama@email.com";
  else if (db.get("SELECT 1 FROM users WHERE email = ?", values.email)) errors.email = "Email ini sudah terdaftar. Masuk dengan email ini atau pakai email lain.";
  if (password.length < 8) errors.password = "Password minimal 8 karakter.";

  if (Object.keys(errors).length) {
    return res.status(400).page("auth/register", { title: "Daftar", values, errors });
  }

  const memberCode = uniqueCode(db.open(), "ECO", "users", "member_code");
  const { lastInsertRowid } = db.run(
    "INSERT INTO users (name, email, password_hash, member_code) VALUES (?, ?, ?, ?)",
    values.name, values.email, hashPassword(password), memberCode
  );
  startSession(res, lastInsertRowid);
  res.flash("success", "Akunmu sudah jadi. Ini QR membership-mu untuk setor di EcoBin.");
  res.redirect("/app/qr");
});

router.post("/keluar", (req, res) => {
  endSession(req, res);
  res.redirect("/masuk");
});

module.exports = router;
