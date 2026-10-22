const os = require("node:os");
const path = require("node:path");
const express = require("express");

const db = require("./db/database");
const { sessionMiddleware } = require("./lib/auth");
const { fmt } = require("./lib/format");

const PORT = Number(process.env.PORT) || 3000;

db.open();

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.disable("x-powered-by");

// Lokal: disajikan Express. Di Vercel: folder public/ disajikan langsung oleh CDN.
// Tanpa cache panjang supaya perubahan CSS/JS langsung terlihat saat pengembangan.
app.use(express.static(path.join(__dirname, "public")));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(sessionMiddleware);

app.use((req, res, next) => {
  res.locals.fmt = fmt;
  res.locals.path = req.path;
  // Render view lalu bungkus dengan layout: user, admin, kiosk, atau plain
  res.page = (view, locals = {}, layout = "plain") => {
    res.render(view, locals, (err, body) => {
      if (err) return next(err);
      res.render(`layouts/${layout}`, { ...locals, body });
    });
  };
  next();
});

app.use(require("./routes/auth"));
app.use("/app", require("./routes/user"));
app.use("/admin/stasiun", require("./routes/station"));
app.use("/admin", require("./routes/admin"));

app.use((req, res) => {
  res.status(404).page("errors/error", {
    title: "Halaman tidak ditemukan",
    heading: "Halaman tidak ditemukan",
    message: "Alamat yang kamu buka tidak ada. Periksa kembali alamatnya atau kembali ke beranda."
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (req.accepts(["html", "json"]) === "json") return res.status(500).json({ error: "Terjadi kesalahan di server." });
  res.status(500).page("errors/error", {
    title: "Terjadi kesalahan",
    heading: "Terjadi kesalahan di server",
    message: "Permintaan tidak bisa diproses. Muat ulang halaman; jika masih gagal, periksa terminal server."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`EcoBin berjalan di http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === "IPv4" && !net.internal) console.log(`Dari HP di Wi-Fi yang sama: http://${net.address}:${PORT}`);
    }
  }
});
