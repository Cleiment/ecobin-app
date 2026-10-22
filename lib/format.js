// Helper tampilan yang dipakai di semua template (res.locals.fmt)
const TIME_ZONE = "Asia/Pontianak";

function toDate(value) {
  if (value instanceof Date) return value;
  // Waktu SQLite "YYYY-MM-DD HH:MM:SS" disimpan dalam UTC
  return new Date(String(value).replace(" ", "T") + "Z");
}

const fmt = {
  number(n) {
    return Number(n || 0).toLocaleString("id-ID");
  },

  kg(n) {
    const value = Number(n || 0);
    return value.toLocaleString("id-ID", { minimumFractionDigits: value < 10 ? 2 : 1, maximumFractionDigits: value < 10 ? 2 : 1 }) + " kg";
  },

  rupiah(n) {
    return "Rp" + Number(n || 0).toLocaleString("id-ID");
  },

  date(value) {
    return toDate(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
  },

  dateTime(value) {
    return toDate(value).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }) + " WIB";
  },

  // Untuk input <input type="date">: tanggal lokal Pontianak
  isoDate(value) {
    return toDate(value).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
  },

  initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  },

  firstName(name) {
    return String(name || "").trim().split(/\s+/)[0];
  },

  // Tingkat isi unit: persen (maks. 100 untuk tampilan) dan label
  fill(location) {
    const pct = Math.round((location.current_kg / location.capacity_kg) * 100);
    let label = "Masih lega";
    let tone = "ok";
    if (pct >= 100) { label = "Penuh"; tone = "full"; }
    else if (pct >= 80) { label = "Hampir penuh"; tone = "warn"; }
    else if (pct >= 50) { label = "Terisi sebagian"; tone = "mid"; }
    return { pct, bar: Math.min(pct, 100), label, tone };
  },

  // Status voucher milik pengguna, termasuk yang sudah lewat masa berlaku
  redemptionStatus(r) {
    if (r.status === "dipakai") return { label: "Sudah dipakai", tone: "muted" };
    if (toDate(r.expires_at) < new Date()) return { label: "Kedaluwarsa", tone: "muted" };
    return { label: "Aktif", tone: "ok" };
  }
};

module.exports = { fmt, toDate };
