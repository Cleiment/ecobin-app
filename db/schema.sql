-- Skema database EcoBin. Waktu disimpan dalam UTC (format SQLite datetime).

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  member_code   TEXT    UNIQUE,
  points        INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL
);

CREATE TABLE categories (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  points_per_kg INTEGER NOT NULL CHECK (points_per_kg >= 0),
  color         TEXT    NOT NULL DEFAULT '#0B766F',
  active        INTEGER NOT NULL DEFAULT 1
);

-- Contoh barang untuk Simulator Stasiun. category_id kosong = barang campuran.
CREATE TABLE category_items (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  min_kg      REAL    NOT NULL CHECK (min_kg > 0),
  max_kg      REAL    NOT NULL CHECK (max_kg >= min_kg),
  is_mixed    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE locations (
  id          INTEGER PRIMARY KEY,
  retailer    TEXT    NOT NULL CHECK (retailer IN ('Indomaret', 'Alfamart')),
  name        TEXT    NOT NULL,
  address     TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'segera')),
  capacity_kg REAL    NOT NULL CHECK (capacity_kg > 0),
  current_kg  REAL    NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE pickups (
  id          INTEGER PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  weight_kg   REAL    NOT NULL,
  emptied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE deposits (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  item_name   TEXT    NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  weight_kg   REAL    NOT NULL DEFAULT 0,
  points      INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL CHECK (status IN ('diterima', 'ditolak')),
  reason      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE vouchers (
  id          INTEGER PRIMARY KEY,
  retailer    TEXT    NOT NULL CHECK (retailer IN ('Indomaret', 'Alfamart')),
  name        TEXT    NOT NULL,
  nominal     INTEGER NOT NULL CHECK (nominal > 0),
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active      INTEGER NOT NULL DEFAULT 1
);

-- status 'aktif' yang lewat expires_at ditampilkan sebagai kedaluwarsa
CREATE TABLE redemptions (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  voucher_id   INTEGER NOT NULL REFERENCES vouchers(id),
  code         TEXT    NOT NULL UNIQUE,
  points_spent INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'dipakai')),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT    NOT NULL,
  used_at      TEXT
);

CREATE INDEX idx_deposits_user     ON deposits (user_id, created_at);
CREATE INDEX idx_deposits_location ON deposits (location_id);
CREATE INDEX idx_redemptions_user  ON redemptions (user_id, created_at);
