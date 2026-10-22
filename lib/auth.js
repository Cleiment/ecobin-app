const crypto = require("node:crypto");
const db = require("../db/database");

const SESSION_COOKIE = "ecobin_sid";
const FLASH_COOKIE = "ecobin_flash";
const SESSION_DAYS = 7;

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    try { cookies[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* abaikan cookie rusak */ }
  }
  return cookies;
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.run(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`, token, userId);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: SESSION_DAYS * 86400000 });
}

function endSession(req, res) {
  if (req.sessionToken) db.run("DELETE FROM sessions WHERE token = ?", req.sessionToken);
  res.clearCookie(SESSION_COOKIE);
}

// Membaca sesi dan pesan flash dari cookie di setiap request
function sessionMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);

  const token = cookies[SESSION_COOKIE];
  if (token) {
    const user = db.get(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                         WHERE s.token = ? AND s.expires_at > datetime('now')`, token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }
  res.locals.currentUser = req.user || null;

  res.locals.flash = null;
  if (cookies[FLASH_COOKIE]) {
    try { res.locals.flash = JSON.parse(cookies[FLASH_COOKIE]); } catch { /* abaikan */ }
    res.clearCookie(FLASH_COOKIE);
  }
  res.flash = (type, message) => {
    res.cookie(FLASH_COOKIE, JSON.stringify({ type, message }), { httpOnly: true, sameSite: "lax" });
  };

  next();
}

function homeFor(user) {
  return user && user.role === "admin" ? "/admin" : "/app";
}

function requireUser(req, res, next) {
  if (!req.user) return res.redirect("/masuk");
  if (req.user.role === "admin") return res.redirect("/admin");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect("/masuk");
  if (req.user.role !== "admin") {
    return res.status(403).page("errors/error", {
      title: "Akses ditolak",
      heading: "Halaman ini khusus admin",
      message: "Akunmu tidak punya akses ke halaman pengelola. Kembali ke beranda untuk melanjutkan."
    }, "plain");
  }
  next();
}

module.exports = { startSession, endSession, sessionMiddleware, requireUser, requireAdmin, homeFor };
