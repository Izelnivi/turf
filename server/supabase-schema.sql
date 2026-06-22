-- Supabase/Postgres schema extracted from server/src/db.ts

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  dob TEXT NOT NULL,
  gender TEXT NOT NULL,
  role TEXT DEFAULT 'User',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  price_per_hour REAL DEFAULT 50.0
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  resource_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  slot_time TEXT NOT NULL,
  status TEXT DEFAULT 'Confirmed',
  total_price REAL DEFAULT 0.0,
  discount_applied REAL DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(resource_id, date, slot_time)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_settings (key, value) VALUES ('globalDiscountPercent', '0') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('promoCode', 'WELCOME10') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('promoDiscountPercent', '10') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('adminPasscode', 'Nive@123') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('bookingStartDate', CURRENT_DATE::text) ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('bookingDaysToShow', '7') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('slotStartTime', '08:00') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('slotEndTime', '22:00') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('slotIntervalMinutes', '60') ON CONFLICT (key) DO NOTHING;

INSERT INTO resources (id, name, type, description, price_per_hour) VALUES
  ('soccer_field', 'Pro Soccer Arena', 'Sport Field', 'Professional 11v11 grass turf with night floodlights', 75.0),
  ('tennis_court', 'Grand Slam Tennis Court', 'Racquet Court', 'Premium outdoor blue clay court with wind screens', 40.0),
  ('basketball_court', 'Championship Indoor Court', 'Indoor Court', 'AC-cooled polished hardwood court with digital scoreboards', 60.0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (name, phone, dob, gender, role) VALUES
  ('Admin System', '+1 999-9999', '1985-01-01', 'Other', 'Admin')
ON CONFLICT (phone) DO NOTHING;

INSERT INTO users (name, phone, dob, gender, role) VALUES
  ('Jane Smith', '+1 555-0199', '1995-08-22', 'Female', 'User')
ON CONFLICT (phone) DO NOTHING;
