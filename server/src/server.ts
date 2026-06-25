import express from 'express';
import cors from 'cors';
import { Database, getDb, initDb } from './db';

const app = express();
const PORT = process.env.PORT || 5000;

interface AdminSettings {
  globalDiscountPercent: number;
  promoCode: string;
  promoDiscountPercent: number;
  adminPasscode: string;
  bookingStartDate: string;
  bookingDaysToShow: number;
  slotStartTime: string;
  slotEndTime: string;
  slotIntervalMinutes: number;
}

const defaultAdminSettings: AdminSettings = {
  globalDiscountPercent: 0,
  promoCode: 'WELCOME10',
  promoDiscountPercent: 10,
  adminPasscode: 'Nive@123',
  bookingStartDate: new Date().toISOString().split('T')[0],
  bookingDaysToShow: 7,
  slotStartTime: '08:00',
  slotEndTime: '22:00',
  slotIntervalMinutes: 60
};

app.use(cors());
app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60) + minutes;
}

function isDateWithinBookingWindow(date: string, settings: AdminSettings): boolean {
  const requested = new Date(`${date}T00:00:00`).getTime();
  const start = new Date(`${settings.bookingStartDate}T00:00:00`).getTime();
  const end = start + ((settings.bookingDaysToShow - 1) * 24 * 60 * 60 * 1000);
  return requested >= start && requested <= end;
}

function isSlotAllowed(slotTime: string, settings: AdminSettings): boolean {
  const slot = timeToMinutes(slotTime);
  const start = timeToMinutes(settings.slotStartTime);
  const end = timeToMinutes(settings.slotEndTime);
  return slot >= start && slot <= end && ((slot - start) % settings.slotIntervalMinutes === 0);
}

async function getAdminSettings(db?: Database): Promise<{ settings: AdminSettings; shouldClose: boolean }> {
  const shouldClose = !db;
  const activeDb = db || await getDb();
  const rows = await activeDb.all<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  if (shouldClose) {
    await activeDb.close();
  }
  const values = rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  return {
    shouldClose,
    settings: {
      globalDiscountPercent: toNumber(values.globalDiscountPercent, defaultAdminSettings.globalDiscountPercent),
      promoCode: values.promoCode || defaultAdminSettings.promoCode,
      promoDiscountPercent: toNumber(values.promoDiscountPercent, defaultAdminSettings.promoDiscountPercent),
      adminPasscode: values.adminPasscode || defaultAdminSettings.adminPasscode,
      bookingStartDate: values.bookingStartDate || defaultAdminSettings.bookingStartDate,
      bookingDaysToShow: Math.max(1, Math.min(31, Math.round(toNumber(values.bookingDaysToShow, defaultAdminSettings.bookingDaysToShow)))),
      slotStartTime: values.slotStartTime || defaultAdminSettings.slotStartTime,
      slotEndTime: values.slotEndTime || defaultAdminSettings.slotEndTime,
      slotIntervalMinutes: Math.max(15, Math.min(240, Math.round(toNumber(values.slotIntervalMinutes, defaultAdminSettings.slotIntervalMinutes))))
    }
  };
}

async function saveAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
  const db = await getDb();
  try {
    const normalized: Partial<Record<keyof AdminSettings, string>> = {};

    if (settings.globalDiscountPercent !== undefined) normalized.globalDiscountPercent = String(toNumber(settings.globalDiscountPercent, 0));
    if (settings.promoCode !== undefined) normalized.promoCode = String(settings.promoCode).trim().toUpperCase();
    if (settings.promoDiscountPercent !== undefined) normalized.promoDiscountPercent = String(toNumber(settings.promoDiscountPercent, 0));
    if (settings.adminPasscode !== undefined && String(settings.adminPasscode).trim() !== '') normalized.adminPasscode = String(settings.adminPasscode).trim();
    if (settings.bookingStartDate !== undefined) normalized.bookingStartDate = String(settings.bookingStartDate);
    if (settings.bookingDaysToShow !== undefined) normalized.bookingDaysToShow = String(Math.max(1, Math.min(31, Math.round(toNumber(settings.bookingDaysToShow, 7)))));
    if (settings.slotStartTime !== undefined) normalized.slotStartTime = String(settings.slotStartTime);
    if (settings.slotEndTime !== undefined) normalized.slotEndTime = String(settings.slotEndTime);
    if (settings.slotIntervalMinutes !== undefined) normalized.slotIntervalMinutes = String(Math.max(15, Math.min(240, Math.round(toNumber(settings.slotIntervalMinutes, 60)))));

    for (const [key, value] of Object.entries(normalized)) {
      await db.run(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value]
      );
    }

    const { settings: updated } = await getAdminSettings(db);
    return updated;
  } finally {
    await db.close();
  }
}

// Endpoint: Get all resources (facilities)
app.get('/api/resources', async (req, res) => {
  try {
    const db = await getDb();
    const resources = await db.all('SELECT * FROM resources');
    await db.close();
    res.json(resources);
  } catch (error: any) {
    console.error('Error fetching resources:', error);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// Endpoint: Get bookings for a resource and date range
app.get('/api/bookings', async (req, res) => {
  const { resource_id, start_date, end_date } = req.query;

  if (!resource_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'Missing query parameters: resource_id, start_date, end_date are required' });
  }

  try {
    const db = await getDb();
    const bookings = await db.all(
      `SELECT b.id, b.resource_id, b.date, b.slot_time, b.status, u.name as user_name 
       FROM bookings b 
       JOIN users u ON b.user_id = u.id 
       WHERE b.resource_id = ? AND b.date >= ? AND b.date <= ?`,
      [resource_id, start_date, end_date]
    );
    await db.close();
    res.json(bookings);
  } catch (error: any) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Endpoint: Get bookings for a customer by phone number
app.get('/api/bookings/by-phone', async (req, res) => {
  const { phone } = req.query;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    const db = await getDb();
    const bookings = await db.all(
      `SELECT b.id, b.resource_id, b.date, b.slot_time, b.status, b.total_price, b.discount_applied, r.name as resource_name 
       FROM bookings b 
       JOIN users u ON b.user_id = u.id 
       JOIN resources r ON b.resource_id = r.id
       WHERE u.phone = ? OR u.phone = ?
       ORDER BY b.date DESC, b.slot_time DESC`,
      [String(phone).trim(), `+91 ${String(phone).trim()}`] // Handle both local and with standard code
    );
    await db.close();
    res.json(bookings);
  } catch (error: any) {
    console.error('Error fetching bookings by phone:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Endpoint: User Login
app.post('/api/auth/login', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const cleanPhone = phone.trim();
  try {
    const db = await getDb();
    const user = await db.get(
      'SELECT id, name, phone, dob, gender, role FROM users WHERE phone = ?',
      [cleanPhone]
    );
    await db.close();

    if (user) {
      res.json({ message: 'Login successful!', user });
    } else {
      res.status(404).json({ error: 'No account found with this phone number. Please sign up.' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Endpoint: User Signup
app.post('/api/auth/signup', async (req, res) => {
  const { name, phone, dob, gender } = req.body;

  if (!name || !phone || !dob || !gender) {
    return res.status(400).json({ error: 'All signup fields (name, phone, dob, gender) are required' });
  }

  const cleanPhone = phone.trim();
  const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
  if (!phoneRegex.test(cleanPhone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const cleanName = name.trim();
  if (cleanName.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters long' });
  }

  const dobDate = new Date(dob);
  if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
    return res.status(400).json({ error: 'Invalid Date of Birth' });
  }

  const validGenders = ['Male', 'Female', 'Other'];
  if (!validGenders.includes(gender)) {
    return res.status(400).json({ error: 'Invalid gender value' });
  }

  try {
    const db = await getDb();
    const existingUser = await db.get(
      'SELECT id FROM users WHERE phone = ?',
      [cleanPhone]
    );

    if (existingUser) {
      await db.close();
      return res.status(409).json({ error: 'An account with this phone number already exists. Please log in.' });
    }

    const result = await db.run(
      'INSERT INTO users (name, phone, dob, gender) VALUES (?, ?, ?, ?)',
      [cleanName, cleanPhone, dob, gender]
    );
    
    const newUser = await db.get(
      'SELECT id, name, phone, dob, gender, role FROM users WHERE id = ?',
      [result.lastID]
    );
    await db.close();

    res.status(201).json({ message: 'Signup successful!', user: newUser });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

// Endpoint: Unified Booking and User Registration Transaction
app.post('/api/bookings', async (req, res) => {
  const { user, bookings } = req.body;

  // Basic Validation
  if (!user || !user.name || !user.phone || !user.dob || !user.gender) {
    return res.status(400).json({ error: 'Missing required user profile information' });
  }

  if (!bookings || !Array.isArray(bookings) || bookings.length === 0) {
    return res.status(400).json({ error: 'No bookings specified' });
  }

  // Formatting and syntax checks
  const cleanPhone = user.phone.trim();
  const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
  if (!phoneRegex.test(cleanPhone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const cleanName = user.name.trim();
  if (cleanName.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters long' });
  }

  const dobDate = new Date(user.dob);
  if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
    return res.status(400).json({ error: 'Invalid Date of Birth' });
  }

  const validGenders = ['Male', 'Female', 'Other'];
  if (!validGenders.includes(user.gender)) {
    return res.status(400).json({ error: 'Invalid gender value' });
  }

  // Validate bookings formats
  const settingsForValidation = (await getAdminSettings()).settings;
  for (const b of bookings) {
    if (!b.resource_id || !b.date || !b.slot_time) {
      return res.status(400).json({ error: 'Each booking must specify resource_id, date, and slot_time' });
    }
    const bDate = new Date(b.date);
    if (isNaN(bDate.getTime())) {
      return res.status(400).json({ error: `Invalid date format in booking: ${b.date}` });
    }
    const slotRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!slotRegex.test(b.slot_time)) {
      return res.status(400).json({ error: `Invalid slot_time format in booking: ${b.slot_time}` });
    }
    if (!isDateWithinBookingWindow(b.date, settingsForValidation)) {
      return res.status(400).json({ error: `Booking date ${b.date} is outside the active booking window` });
    }
    if (!isSlotAllowed(b.slot_time, settingsForValidation)) {
      return res.status(400).json({ error: `Slot ${b.slot_time} is outside the active booking hours` });
    }
  }

  let db;
  try {
    db = await getDb();
    
    // Begin transaction
    await db.run('BEGIN TRANSACTION');

    // 1. Get or create user
    let userId: number;
    const existingUser = await db.get<{ id: number }>(
      'SELECT id FROM users WHERE phone = ?',
      [cleanPhone]
    );

    if (existingUser) {
      userId = existingUser.id;
      // Optionally update other details if modified
      await db.run(
        'UPDATE users SET name = ?, dob = ?, gender = ? WHERE id = ?',
        [cleanName, user.dob, user.gender, userId]
      );
    } else {
      const result = await db.run(
        'INSERT INTO users (name, phone, dob, gender) VALUES (?, ?, ?, ?)',
        [cleanName, cleanPhone, user.dob, user.gender]
      );
      userId = result.lastID!;
    }

    // 2. Double-check slot availability (to avoid race conditions)
    for (const b of bookings) {
      const conflict = await db.get(
        'SELECT id FROM bookings WHERE resource_id = ? AND date = ? AND slot_time = ?',
        [b.resource_id, b.date, b.slot_time]
      );
      if (conflict) {
        await db.run('ROLLBACK');
        await db.close();
        return res.status(409).json({ 
          error: `Time slot ${b.slot_time} on ${b.date} is already booked for facility: ${b.resource_id}` 
        });
      }
    }

    // Fetch user details for admin check
    const userInfo = await db.get<{ role: string }>(
      'SELECT role FROM users WHERE id = ?',
      [userId]
    );
    const isAdmin = userInfo?.role === 'Admin';
    const bookingStatus = isAdmin ? 'Admin Confirmed' : 'Confirmed';

    // 3. Insert bookings with dynamic price calculations
    const createdBookings = [];
    for (const b of bookings) {
      const resInfo = await db.get<{ price_per_hour: number }>(
        'SELECT price_per_hour FROM resources WHERE id = ?',
        [b.resource_id]
      );
      const hourlyPrice = resInfo ? resInfo.price_per_hour : 50.0;

      const submittedPromo = String(req.body.promoCode || '').trim().toUpperCase();
      const isPromoApplied = submittedPromo !== '' && submittedPromo === settingsForValidation.promoCode;
      const discountPercent = isPromoApplied ? settingsForValidation.promoDiscountPercent : settingsForValidation.globalDiscountPercent;
      const discountAmount = hourlyPrice * (discountPercent / 100);
      const finalPrice = hourlyPrice - discountAmount;

      const result = await db.run(
        'INSERT INTO bookings (resource_id, user_id, date, slot_time, total_price, discount_applied, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [b.resource_id, userId, b.date, b.slot_time, finalPrice, discountAmount, bookingStatus]
      );
      
      createdBookings.push({
        id: result.lastID,
        resource_id: b.resource_id,
        date: b.date,
        slot_time: b.slot_time,
        total_price: finalPrice,
        discount_applied: discountAmount,
        status: bookingStatus
      });
    }

    // Commit transaction
    await db.run('COMMIT');
    await db.close();

    res.status(201).json({
      message: 'Booking completed successfully!',
      user: { id: userId, name: cleanName, phone: cleanPhone, role: userInfo?.role || 'User' },
      bookings: createdBookings
    });

  } catch (error: any) {
    console.error('Transaction error:', error);
    if (db) {
      try {
        await db.run('ROLLBACK');
        await db.close();
      } catch (rollbackErr) {
        console.error('Error rolling back transaction:', rollbackErr);
      }
    }
    res.status(500).json({ error: 'Internal server error while processing booking transaction' });
  }
});

// --- ADMIN API ENDPOINTS ---

// GET /api/admin/settings: retrieve discount and schedule config
app.get('/api/admin/settings', async (req, res) => {
  const { settings } = await getAdminSettings();
  res.json(settings);
});

// POST /api/admin/settings: modify discount and schedule config
app.post('/api/admin/settings', async (req, res) => {
  try {
    const settings = await saveAdminSettings(req.body);
    res.json({
      message: 'Admin settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error saving admin settings:', error);
    res.status(500).json({ error: 'Failed to save admin settings' });
  }
});

// POST /api/admin/verify-passcode: verify authorization passcode
app.post('/api/admin/verify-passcode', async (req, res) => {
  const { passcode } = req.body;
  const { settings } = await getAdminSettings();
  if (passcode === settings.adminPasscode) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid passcode. Authorization denied.' });
  }
});

// GET /api/admin/stats: retrieve KPIs and resources
app.get('/api/admin/stats', async (req, res) => {
  try {
    const db = await getDb();
    
    // Total users (excluding admins)
    const usersCount = await db.get<{ count: number }>('SELECT count(*) as count FROM users WHERE role != "Admin"');
    
    // Total active bookings (not Cancelled)
    const activeBookingsCount = await db.get<{ count: number }>('SELECT count(*) as count FROM bookings WHERE status != "Cancelled"');
    
    // Total revenue (sum of active bookings)
    const revenueSum = await db.get<{ sum: number }>('SELECT sum(total_price) as sum FROM bookings WHERE status != "Cancelled"');

    // List of facilities with current booking counts and prices
    const facilities = await db.all(
      `SELECT r.*, count(b.id) as booking_count 
       FROM resources r 
       LEFT JOIN bookings b ON r.id = b.resource_id AND b.status != "Cancelled"
       GROUP BY r.id`
    );

    // List of registered users
    const usersList = await db.all(
      `SELECT id, name, phone, dob, gender, role, created_at FROM users ORDER BY id DESC`
    );

    await db.close();

    res.json({
      totalUsers: usersCount?.count || 0,
      totalBookings: activeBookingsCount?.count || 0,
      totalRevenue: revenueSum?.sum || 0.0,
      facilities,
      users: usersList
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin statistics' });
  }
});

// GET /api/admin/bookings: retrieve all bookings in the system
app.get('/api/admin/bookings', async (req, res) => {
  try {
    const db = await getDb();
    const allBookings = await db.all(
      `SELECT b.id, b.resource_id, b.date, b.slot_time, b.status, b.total_price, b.discount_applied, b.created_at,
              u.name as user_name, u.phone as user_phone, u.role as user_role, r.name as resource_name
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN resources r ON b.resource_id = r.id
       ORDER BY b.date DESC, b.slot_time DESC`
    );
    await db.close();
    res.json(allBookings);
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings log' });
  }
});

// POST /api/admin/bookings/:id/status: cancel/confirm bookings
app.post('/api/admin/bookings/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const db = await getDb();
    const booking = await db.get('SELECT id FROM bookings WHERE id = ?', [id]);
    if (!booking) {
      await db.close();
      return res.status(404).json({ error: 'Booking not found' });
    }

    await db.run('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
    
    // Retrieve updated booking row
    const updated = await db.get('SELECT * FROM bookings WHERE id = ?', [id]);
    await db.close();

    res.json({ message: 'Booking status updated successfully', booking: updated });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

// POST /api/admin/resources/update: edit facility description & price_per_hour
app.post('/api/admin/resources/update', async (req, res) => {
  const { id, name, description, price_per_hour } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Facility ID (id) is required' });
  }

  try {
    const db = await getDb();
    const resource = await db.get('SELECT id FROM resources WHERE id = ?', [id]);
    if (!resource) {
      await db.close();
      return res.status(404).json({ error: 'Facility not found' });
    }

    await db.run(
      'UPDATE resources SET name = COALESCE(?, name), description = COALESCE(?, description), price_per_hour = COALESCE(?, price_per_hour) WHERE id = ?',
      [name, description, price_per_hour, id]
    );

    const updated = await db.get('SELECT * FROM resources WHERE id = ?', [id]);
    await db.close();

    res.json({ message: 'Facility updated successfully', resource: updated });
  } catch (error) {
    console.error('Error updating resource:', error);
    res.status(500).json({ error: 'Failed to update facility' });
  }
});

// Start server
async function start() {
  try {
    console.log('Initializing database...');
    await initDb();
    
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
