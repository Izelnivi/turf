import sqlite3 from 'sqlite3';
import { open, Database as SqliteDatabase } from 'sqlite';
import { Pool, PoolClient } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const usePostgres = !!process.env.DATABASE_URL;

let pgPool: Pool | null = null;
if (usePostgres) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Supabase in many environments
    }
  });
  console.log('Database Mode: Supabase PostgreSQL connected via connection pool.');
} else {
  console.log('Database Mode: Local SQLite database active.');
}

export interface Database {
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  run(sql: string, params?: any[]): Promise<{ lastID?: number; changes?: number }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

// Convert SQLite query syntax to PostgreSQL syntax dynamically
function convertSql(sql: string): string {
  if (!usePostgres) return sql;

  let newSql = sql;
  
  // Convert SQLite ? parameters to PostgreSQL $1, $2 parameters
  let index = 1;
  newSql = newSql.replace(/\?/g, () => `$${index++}`);
  
  // Convert AUTOINCREMENT to Postgres SERIAL
  newSql = newSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  
  // Convert DATETIME to TIMESTAMP
  newSql = newSql.replace(/DATETIME/gi, 'TIMESTAMP');
  
  // Convert TRANSACTION syntax
  if (newSql.trim().toUpperCase() === 'BEGIN TRANSACTION') {
    newSql = 'BEGIN';
  }

  // Append RETURNING id to INSERT statements to fetch generated primary keys
  if (newSql.trim().toUpperCase().startsWith('INSERT INTO') && !newSql.toUpperCase().includes('RETURNING')) {
    newSql += ' RETURNING id';
  }

  return newSql;
}

class SqliteDbConnection implements Database {
  private db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.db.all<T[]>(sql, params);
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.db.get<T>(sql, params);
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    const res = await this.db.run(sql, params);
    return {
      lastID: res.lastID,
      changes: res.changes
    };
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

class PostgresDbConnection implements Database {
  private client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const postgresSql = convertSql(sql);
    const res = await this.client.query(postgresSql, params);
    return res.rows;
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const postgresSql = convertSql(sql);
    const res = await this.client.query(postgresSql, params);
    return res.rows[0];
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    const postgresSql = convertSql(sql);
    const res = await this.client.query(postgresSql, params);
    let lastID: number | undefined;
    if (res.rows && res.rows.length > 0 && res.rows[0].id !== undefined) {
      lastID = Number(res.rows[0].id);
    }
    return {
      lastID,
      changes: res.rowCount || 0
    };
  }

  async exec(sql: string): Promise<void> {
    // Split combined statements and execute sequentially
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const stmt of statements) {
      const postgresSql = convertSql(stmt);
      await this.client.query(postgresSql);
    }
  }

  async close(): Promise<void> {
    if (this.client && typeof this.client.release === 'function') {
      this.client.release();
    }
  }
}

export async function getDb(): Promise<Database> {
  if (usePostgres && pgPool) {
    const client = await pgPool.connect();
    return new PostgresDbConnection(client);
  } else {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    await db.run('PRAGMA foreign_keys = ON');
    return new SqliteDbConnection(db);
  }
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  
  // Create tables with expanded columns
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL,
      role TEXT DEFAULT 'User',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      price_per_hour REAL DEFAULT 50.0
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      status TEXT DEFAULT 'Confirmed',
      total_price REAL DEFAULT 0.0,
      discount_applied REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(resource_id, date, slot_time)
    );
  `);

  // --- Run Safe migrations on existing tables ---
  try {
    await db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'User'");
    console.log("Migration: Added role to users table");
  } catch (e) {}

  try {
    await db.run("ALTER TABLE resources ADD COLUMN price_per_hour REAL DEFAULT 50.0");
    console.log("Migration: Added price_per_hour to resources table");
  } catch (e) {}

  try {
    await db.run("ALTER TABLE bookings ADD COLUMN status TEXT DEFAULT 'Confirmed'");
    console.log("Migration: Added status to bookings table");
  } catch (e) {}

  try {
    await db.run("ALTER TABLE bookings ADD COLUMN total_price REAL DEFAULT 0.0");
    console.log("Migration: Added total_price to bookings table");
  } catch (e) {}

  try {
    await db.run("ALTER TABLE bookings ADD COLUMN discount_applied REAL DEFAULT 0.0");
    console.log("Migration: Added discount_applied to bookings table");
  } catch (e) {}

  // Seed default resources if empty
  const resourcesCount = await db.get<{ count: number }>('SELECT count(*) as count FROM resources');
  if (resourcesCount && Number(resourcesCount.count) === 0) {
    await db.run(
      `INSERT INTO resources (id, name, type, description, price_per_hour) VALUES 
       ('soccer_field', 'Pro Soccer Arena', 'Sport Field', 'Professional 11v11 grass turf with night floodlights', 75.0),
       ('tennis_court', 'Grand Slam Tennis Court', 'Racquet Court', 'Premium outdoor blue clay court with wind screens', 40.0),
       ('basketball_court', 'Championship Indoor Court', 'Indoor Court', 'AC-cooled polished hardwood court with digital scoreboards', 60.0)`
    );
    console.log('Seeded resources.');
  } else {
    // Explicitly update rates of existing seeded facilities
    await db.run("UPDATE resources SET price_per_hour = 75.0 WHERE id = 'soccer_field' AND (price_per_hour IS NULL OR price_per_hour = 50.0)");
    await db.run("UPDATE resources SET price_per_hour = 40.0 WHERE id = 'tennis_court' AND (price_per_hour IS NULL OR price_per_hour = 50.0)");
    await db.run("UPDATE resources SET price_per_hour = 60.0 WHERE id = 'basketball_court' AND (price_per_hour IS NULL OR price_per_hour = 50.0)");
  }

  // Seed default administrator user
  const adminExists = await db.get("SELECT id FROM users WHERE phone = '+1 999-9999'");
  if (!adminExists) {
    await db.run(
      `INSERT INTO users (name, phone, dob, gender, role) VALUES 
       ('Admin System', '+1 999-9999', '1985-01-01', 'Other', 'Admin')`
    );
    console.log("Seeded admin user.");
  }

  // Seed a default user for mock bookings
  const usersCount = await db.get<{ count: number }>('SELECT count(*) as count FROM users');
  let mockUserId = 1;
  const standardUser = await db.get<{ id: number }>("SELECT id FROM users WHERE phone = '+1 555-0199'");
  if (standardUser) {
    mockUserId = standardUser.id;
  } else {
    const result = await db.run(
      `INSERT INTO users (name, phone, dob, gender, role) VALUES 
       ('Jane Smith', '+1 555-0199', '1995-08-22', 'Female', 'User')`
    );
    mockUserId = result.lastID || 1;
    console.log('Seeded default mock user.');
  }

  // Seed some default bookings to demonstrate occupied/disabled states
  const bookingsCount = await db.get<{ count: number }>('SELECT count(*) as count FROM bookings');
  if (bookingsCount && Number(bookingsCount.count) <= 2) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date();
    const tomorrowStr = new Date(tomorrow.setDate(tomorrow.getDate() + 1)).toISOString().split('T')[0];

    const dayAfter = new Date();
    const dayAfterStr = new Date(dayAfter.setDate(dayAfter.getDate() + 2)).toISOString().split('T')[0];

    // Seed bookings
    const mockBookings = [
      { resource_id: 'soccer_field', user_id: mockUserId, date: todayStr, slot_time: '10:00', price: 75.0 },
      { resource_id: 'soccer_field', user_id: mockUserId, date: todayStr, slot_time: '18:00', price: 75.0 },
      { resource_id: 'tennis_court', user_id: mockUserId, date: todayStr, slot_time: '14:00', price: 40.0 },
      { resource_id: 'tennis_court', user_id: mockUserId, date: tomorrowStr, slot_time: '09:00', price: 40.0 },
      { resource_id: 'basketball_court', user_id: mockUserId, date: tomorrowStr, slot_time: '19:00', price: 60.0 },
      { resource_id: 'basketball_court', user_id: mockUserId, date: dayAfterStr, slot_time: '15:00', price: 60.0 }
    ];

    for (const booking of mockBookings) {
      try {
        await db.run(
          `INSERT INTO bookings (resource_id, user_id, date, slot_time, total_price, discount_applied) VALUES (?, ?, ?, ?, ?, 0.0)`,
          [booking.resource_id, booking.user_id, booking.date, booking.slot_time, booking.price]
        );
      } catch (err) {
        // Ignore unique constraint issues if any
      }
    }
    console.log('Seeded mock bookings.');
  }

  await db.close();
}
