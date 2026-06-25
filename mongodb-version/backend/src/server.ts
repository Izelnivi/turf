import express, { Request, Response } from 'express';
import cors from 'cors';
import { initDb, User, Resource, Booking, AppSetting } from './db';

const app = express();
const PORT = process.env.PORT || 5001;

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

function toNumber(value: any, fallback: number): number {
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

async function getAdminSettings(): Promise<AdminSettings> {
  const rows = await AppSetting.find({});
  const values = rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  return {
    globalDiscountPercent: toNumber(values.globalDiscountPercent, defaultAdminSettings.globalDiscountPercent),
    promoCode: values.promoCode || defaultAdminSettings.promoCode,
    promoDiscountPercent: toNumber(values.promoDiscountPercent, defaultAdminSettings.promoDiscountPercent),
    adminPasscode: values.adminPasscode || defaultAdminSettings.adminPasscode,
    bookingStartDate: values.bookingStartDate || defaultAdminSettings.bookingStartDate,
    bookingDaysToShow: Math.max(1, Math.min(31, Math.round(toNumber(values.bookingDaysToShow, defaultAdminSettings.bookingDaysToShow)))),
    slotStartTime: values.slotStartTime || defaultAdminSettings.slotStartTime,
    slotEndTime: values.slotEndTime || defaultAdminSettings.slotEndTime,
    slotIntervalMinutes: Math.max(15, Math.min(240, Math.round(toNumber(values.slotIntervalMinutes, defaultAdminSettings.slotIntervalMinutes))))
  };
}

async function saveAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
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
    await AppSetting.findOneAndUpdate(
      { key },
      { value },
      { upsert: true, new: true }
    );
  }

  return await getAdminSettings();
}

// --- API ENDPOINTS ---

// Endpoint: Get all resources (facilities)
app.get('/api/resources', async (req: Request, res: Response) => {
  try {
    const resources = await Resource.find({});
    const formatted = resources.map(r => ({
      id: r._id,
      name: r.name,
      type: r.type,
      description: r.description,
      price_per_hour: r.price_per_hour
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching resources:', error);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// Endpoint: Get bookings for a resource and date range
app.get('/api/bookings', async (req: Request, res: Response) => {
  const { resource_id, start_date, end_date } = req.query;

  if (!resource_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'Missing query parameters: resource_id, start_date, end_date are required' });
  }

  try {
    const bookings = await Booking.find({
      resource_id: String(resource_id),
      date: { $gte: String(start_date), $lte: String(end_date) }
    }).populate('user_id', 'name');

    const formatted = bookings.map(b => ({
      id: b._id,
      resource_id: b.resource_id,
      date: b.date,
      slot_time: b.slot_time,
      status: b.status,
      user_name: b.user_id ? (b.user_id as any).name : 'Unknown'
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Endpoint: Get bookings for a customer by phone number
app.get('/api/bookings/by-phone', async (req: Request, res: Response) => {
  const { phone } = req.query;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const cleanPhone = String(phone).trim();
  const searchPhones = [cleanPhone, `+91 ${cleanPhone}`];

  try {
    const users = await User.find({ phone: { $in: searchPhones } });
    if (users.length === 0) {
      return res.json([]);
    }

    const userIds = users.map(u => u._id);
    const bookings = await Booking.find({ user_id: { $in: userIds } })
      .populate('resource_id')
      .sort({ date: -1, slot_time: -1 });

    const formatted = bookings.map(b => ({
      id: b._id,
      resource_id: b.resource_id,
      resource_name: (b.resource_id as any) ? (b.resource_id as any).name : 'Unknown Facility',
      date: b.date,
      slot_time: b.slot_time,
      status: b.status,
      total_price: b.total_price,
      discount_applied: b.discount_applied
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching bookings by phone:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Endpoint: User Login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const cleanPhone = String(phone).trim();
  try {
    const user = await User.findOne({ phone: cleanPhone });

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
app.post('/api/auth/signup', async (req: Request, res: Response) => {
  const { name, phone, dob, gender } = req.body;

  if (!name || !phone || !dob || !gender) {
    return res.status(400).json({ error: 'All signup fields (name, phone, dob, gender) are required' });
  }

  const cleanPhone = String(phone).trim();
  const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
  if (!phoneRegex.test(cleanPhone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const cleanName = String(name).trim();
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
    const existingUser = await User.findOne({ phone: cleanPhone });

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this phone number already exists. Please log in.' });
    }

    const newUser = new User({
      name: cleanName,
      phone: cleanPhone,
      dob,
      gender
    });
    await newUser.save();

    res.status(201).json({ message: 'Signup successful!', user: newUser });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

// Endpoint: Verify Customer (Helper check)
app.post('/api/verify-customer', async (req: Request, res: Response) => {
  const { name, phone } = req.body;
  if (!phone) {
    return res.status(400).json({ verified: false, error: 'Phone number is required' });
  }
  try {
    const user = await User.findOne({
      phone: String(phone).trim()
    });
    if (user) {
      return res.json({ verified: true, role: user.role });
    }
    return res.json({ verified: false });
  } catch (err) {
    return res.status(500).json({ verified: false, error: 'Server error verifying customer' });
  }
});

// Endpoint: Unified Booking and User Registration Transaction
app.post('/api/bookings', async (req: Request, res: Response) => {
  const { user, bookings, promoCode } = req.body;

  // Basic Validation
  if (!user || !user.name || !user.phone || !user.dob || !user.gender) {
    return res.status(400).json({ error: 'Missing required user profile information' });
  }

  if (!bookings || !Array.isArray(bookings) || bookings.length === 0) {
    return res.status(400).json({ error: 'No bookings specified' });
  }

  const cleanPhone = String(user.phone).trim();
  const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
  if (!phoneRegex.test(cleanPhone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const cleanName = String(user.name).trim();
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
  const settingsForValidation = await getAdminSettings();
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

  try {
    // 1. Get or create user
    let dbUser = await User.findOne({ phone: cleanPhone });

    if (dbUser) {
      dbUser.name = cleanName;
      dbUser.dob = user.dob;
      dbUser.gender = user.gender;
      await dbUser.save();
    } else {
      dbUser = new User({
        name: cleanName,
        phone: cleanPhone,
        dob: user.dob,
        gender: user.gender
      });
      await dbUser.save();
    }

    const userId = dbUser._id;
    const isAdmin = dbUser.role === 'Admin';
    const bookingStatus = isAdmin ? 'Admin Confirmed' : 'Confirmed';

    // 2. Check collision in DB before saving
    for (const b of bookings) {
      const conflict = await Booking.findOne({
        resource_id: b.resource_id,
        date: b.date,
        slot_time: b.slot_time,
        status: { $ne: 'Cancelled' }
      });

      if (conflict) {
        return res.status(409).json({ error: `Time slot ${b.slot_time} on ${b.date} is already booked for facility: ${b.resource_id}` });
      }
    }

    // 3. Create bookings
    const createdBookings = [];
    for (const b of bookings) {
      const resInfo = await Resource.findById(b.resource_id);
      const hourlyPrice = resInfo ? resInfo.price_per_hour : 50.0;

      const submittedPromo = String(promoCode || '').trim().toUpperCase();
      const isPromoApplied = submittedPromo !== '' && submittedPromo === settingsForValidation.promoCode;
      const discountPercent = isPromoApplied ? settingsForValidation.promoDiscountPercent : settingsForValidation.globalDiscountPercent;
      const discountAmount = hourlyPrice * (discountPercent / 100);
      const finalPrice = hourlyPrice - discountAmount;

      const newBooking = new Booking({
        resource_id: b.resource_id,
        user_id: userId,
        date: b.date,
        slot_time: b.slot_time,
        total_price: finalPrice,
        discount_applied: discountAmount,
        status: bookingStatus
      });

      await newBooking.save();
      createdBookings.push({
        id: newBooking._id,
        resource_id: b.resource_id,
        date: b.date,
        slot_time: b.slot_time,
        total_price: finalPrice,
        discount_applied: discountAmount,
        status: bookingStatus
      });
    }

    res.status(201).json({
      message: 'Booking completed successfully!',
      user: { id: userId, name: cleanName, phone: cleanPhone, role: dbUser.role },
      bookings: createdBookings
    });
  } catch (error: any) {
    console.error('Booking error:', error);
    // Handle unique index collision explicitly
    if (error.code === 11000) {
      return res.status(409).json({ error: 'One or more of selected time slots are already booked. Please try different slots.' });
    }
    res.status(500).json({ error: 'Internal server error while processing booking transaction' });
  }
});

// --- ADMIN PORTAL ENDPOINTS ---

// GET /api/admin/settings: retrieve discount and schedule config
app.get('/api/admin/settings', async (req: Request, res: Response) => {
  try {
    const settings = await getAdminSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

// POST /api/admin/settings: modify discount and schedule config
app.post('/api/admin/settings', async (req: Request, res: Response) => {
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
app.post('/api/admin/verify-passcode', async (req: Request, res: Response) => {
  const { passcode } = req.body;
  const settings = await getAdminSettings();
  if (passcode === settings.adminPasscode) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid passcode. Authorization denied.' });
  }
});

// GET /api/admin/stats: retrieve KPIs and resources
app.get('/api/admin/stats', async (req: Request, res: Response) => {
  try {
    // Total users (excluding admins)
    const totalUsers = await User.countDocuments({ role: { $ne: 'Admin' } });

    // Total active bookings (not Cancelled)
    const totalBookings = await Booking.countDocuments({ status: { $ne: 'Cancelled' } });

    // Total revenue
    const revenueRes = await Booking.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, sum: { $sum: '$total_price' } } }
    ]);
    const totalRevenue = revenueRes.length > 0 ? revenueRes[0].sum : 0.0;

    // List of facilities with current booking counts
    const facilitiesList = await Resource.find({});
    const bookingCounts = await Booking.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: '$resource_id', count: { $sum: 1 } } }
    ]);
    const bookingCountsMap = bookingCounts.reduce<Record<string, number>>((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const facilities = facilitiesList.map(r => ({
      id: r._id,
      name: r.name,
      type: r.type,
      description: r.description,
      price_per_hour: r.price_per_hour,
      booking_count: bookingCountsMap[r._id] || 0
    }));

    // List of registered users
    const dbUsers = await User.find({}).sort({ created_at: -1 });
    const users = dbUsers.map(u => ({
      id: u._id,
      name: u.name,
      phone: u.phone,
      dob: u.dob,
      gender: u.gender,
      role: u.role,
      created_at: u.created_at
    }));

    res.json({
      totalUsers,
      totalBookings,
      totalRevenue,
      facilities,
      users
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin statistics' });
  }
});

// GET /api/admin/bookings: retrieve all bookings in the system
app.get('/api/admin/bookings', async (req: Request, res: Response) => {
  try {
    const allBookings = await Booking.find({})
      .populate('user_id')
      .populate('resource_id')
      .sort({ date: -1, slot_time: -1 });

    const formatted = allBookings.map(b => ({
      id: b._id,
      resource_id: b.resource_id ? b.resource_id : 'unknown',
      resource_name: (b.resource_id as any) ? (b.resource_id as any).name : 'Unknown Facility',
      date: b.date,
      slot_time: b.slot_time,
      status: b.status,
      total_price: b.total_price,
      discount_applied: b.discount_applied,
      created_at: b.created_at,
      user_name: b.user_id ? (b.user_id as any).name : 'Guest',
      user_phone: b.user_id ? (b.user_id as any).phone : 'N/A',
      user_role: b.user_id ? (b.user_id as any).role : 'User'
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings log' });
  }
});

// POST /api/admin/bookings/:id/status: cancel/confirm bookings
app.post('/api/admin/bookings/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updatedBooking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ message: 'Booking status updated successfully', booking: updatedBooking });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

// POST /api/admin/resources/update: edit facility description & price_per_hour
app.post('/api/admin/resources/update', async (req: Request, res: Response) => {
  const { id, name, description, price_per_hour } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Facility ID (id) is required' });
  }

  try {
    const updatedResource = await Resource.findByIdAndUpdate(
      id,
      {
        name,
        description,
        price_per_hour
      },
      { new: true }
    );

    if (!updatedResource) {
      return res.status(404).json({ error: 'Facility not found' });
    }

    res.json({ message: 'Facility updated successfully', resource: updatedResource });
  } catch (error) {
    console.error('Error updating resource:', error);
    res.status(500).json({ error: 'Failed to update facility' });
  }
});

async function startServer() {
  try {
    // Connect to database and run seeds
    await initDb();

    app.listen(PORT, () => {
      console.log(`MongoDB backend running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start MongoDB server:', err);
    process.exit(1);
  }
}

startServer();
