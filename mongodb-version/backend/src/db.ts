import mongoose, { Schema, Document } from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Force DNS servers to resolve MongoDB Atlas SRV records correctly on Windows
try {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
} catch (e) {
  console.warn('Failed to set custom DNS servers, using system default:', e);
}

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/turfbooking';

// --- INTERFACES ---

export interface IUser {
  name: string;
  phone: string;
  dob: string;
  gender: string;
  role: string;
  created_at: Date;
}

export interface IResource {
  _id: string; // e.g., 'soccer_field'
  name: string;
  type: string;
  description?: string;
  price_per_hour: number;
}

export interface IBooking {
  resource_id: string;
  user_id: mongoose.Types.ObjectId | IUser;
  date: string;
  slot_time: string;
  status: string;
  total_price: number;
  discount_applied: number;
  created_at: Date;
}

export interface IAppSetting {
  key: string;
  value: string;
}

// --- SCHEMAS & MODELS ---

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  dob: { type: String, required: true },
  gender: { type: String, required: true },
  role: { type: String, default: 'User' },
  created_at: { type: Date, default: Date.now }
});

export const User = mongoose.model<IUser>('User', UserSchema);

const ResourceSchema = new Schema<IResource>({
  _id: { type: String, required: true }, // e.g., 'soccer_field'
  name: { type: String, required: true },
  type: { type: String, required: true },
  description: { type: String },
  price_per_hour: { type: Number, default: 50.0 }
}, { _id: false }); // Disable automatic ObjectId generation since we specify our own string _id

export const Resource = mongoose.model<IResource>('Resource', ResourceSchema);

const BookingSchema = new Schema<IBooking>({
  resource_id: { type: String, required: true, ref: 'Resource' },
  user_id: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  date: { type: String, required: true },
  slot_time: { type: String, required: true },
  status: { type: String, default: 'Confirmed' },
  total_price: { type: Number, default: 0.0 },
  discount_applied: { type: Number, default: 0.0 },
  created_at: { type: Date, default: Date.now }
});

// Ensure unique slot per resource per date and slot time
BookingSchema.index({ resource_id: 1, date: 1, slot_time: 1 }, { unique: true });

export const Booking = mongoose.model<IBooking>('Booking', BookingSchema);

const AppSettingSchema = new Schema<IAppSetting>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
});

export const AppSetting = mongoose.model<IAppSetting>('AppSetting', AppSettingSchema);

// --- SEED DATABASE ---

const defaultAdminSettings = {
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

async function seedDatabase() {
  try {
    // 1. Seed Resources
    const countRes = await Resource.countDocuments();
    if (countRes === 0) {
      await Resource.insertMany([
        { _id: 'soccer_field', name: 'Pro Soccer Arena', type: 'Sport Field', description: 'Professional 11v11 grass turf with night floodlights', price_per_hour: 75.0 },
        { _id: 'tennis_court', name: 'Grand Slam Tennis Court', type: 'Racquet Court', description: 'Premium outdoor blue clay court with wind screens', price_per_hour: 40.0 },
        { _id: 'basketball_court', name: 'Championship Indoor Court', type: 'Indoor Court', description: 'AC-cooled polished hardwood court with digital scoreboards', price_per_hour: 60.0 }
      ]);
      console.log('[Seed] Resources successfully seeded.');
    } else {
      // Ensure prices are updated to match requirements
      await Resource.findByIdAndUpdate('soccer_field', { price_per_hour: 75.0 });
      await Resource.findByIdAndUpdate('tennis_court', { price_per_hour: 40.0 });
      await Resource.findByIdAndUpdate('basketball_court', { price_per_hour: 60.0 });
    }

    // 2. Seed Default Settings
    const defaultSettingsKeys = Object.keys(defaultAdminSettings);
    for (const key of defaultSettingsKeys) {
      const exists = await AppSetting.findOne({ key });
      if (!exists) {
        await new AppSetting({ key, value: String(defaultAdminSettings[key as keyof typeof defaultAdminSettings]) }).save();
      }
    }
    console.log('[Seed] AppSettings successfully checked/seeded.');

    // 3. Seed Admin User
    const adminExists = await User.findOne({ phone: '+1 999-9999' });
    if (!adminExists) {
      await new User({
        name: 'Admin System',
        phone: '+1 999-9999',
        dob: '1985-01-01',
        gender: 'Other',
        role: 'Admin'
      }).save();
      console.log('[Seed] Admin User seeded.');
    }

    // 4. Seed Standard User
    let mockUserId: mongoose.Types.ObjectId | null = null;
    const userExists = await User.findOne({ phone: '+1 555-0199' });
    if (!userExists) {
      const newUser = await new User({
        name: 'Jane Smith',
        phone: '+1 555-0199',
        dob: '1995-08-22',
        gender: 'Female',
        role: 'User'
      }).save();
      mockUserId = newUser._id as mongoose.Types.ObjectId;
      console.log('[Seed] Mock Standard User seeded.');
    } else {
      mockUserId = userExists._id as mongoose.Types.ObjectId;
    }

    // 5. Seed Mock Bookings
    const bookingCount = await Booking.countDocuments();
    if (bookingCount <= 2 && mockUserId) {
      const todayStr = new Date().toISOString().split('T')[0];

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);
      const dayAfterStr = dayAfter.toISOString().split('T')[0];

      const mockBookings = [
        { resource_id: 'soccer_field', user_id: mockUserId, date: todayStr, slot_time: '10:00', total_price: 75.0 },
        { resource_id: 'soccer_field', user_id: mockUserId, date: todayStr, slot_time: '18:00', total_price: 75.0 },
        { resource_id: 'tennis_court', user_id: mockUserId, date: todayStr, slot_time: '14:00', total_price: 40.0 },
        { resource_id: 'tennis_court', user_id: mockUserId, date: tomorrowStr, slot_time: '09:00', total_price: 40.0 },
        { resource_id: 'basketball_court', user_id: mockUserId, date: tomorrowStr, slot_time: '19:00', total_price: 60.0 },
        { resource_id: 'basketball_court', user_id: mockUserId, date: dayAfterStr, slot_time: '15:00', total_price: 60.0 }
      ];

      for (const mb of mockBookings) {
        try {
          await new Booking(mb).save();
        } catch (e) {
          // ignore index collisions
        }
      }
      console.log('[Seed] Mock bookings seeded.');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

let mongoServer: MongoMemoryServer | null = null;

// --- DATABASE CONNECTION & STARTUP ---
export async function initDb(): Promise<void> {
  try {
    let connectionUri = MONGODB_URI;

    if (process.env.USE_MEMORY_DB === 'true') {
      console.log('Spinning up temporary In-Memory MongoDB server...');
      mongoServer = await MongoMemoryServer.create();
      connectionUri = mongoServer.getUri();
      console.log(`In-Memory MongoDB server started at: ${connectionUri}`);
    } else {
      console.log('Connecting to MongoDB...');
    }

    await mongoose.connect(connectionUri);
    console.log('MongoDB successfully connected.');

    // Seed database
    await seedDatabase();
  } catch (err) {
    console.error('MongoDB database connection failure:', err);
    throw err;
  }
}

// Graceful cleanup on shutdown
process.on('SIGINT', async () => {
  if (mongoServer) {
    console.log('Stopping In-Memory MongoDB server...');
    await mongoServer.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (mongoServer) {
    console.log('Stopping In-Memory MongoDB server...');
    await mongoServer.stop();
  }
  process.exit(0);
});
