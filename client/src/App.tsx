import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Calendar,
  Clock,
  MapPin,
  CalendarDays,
  CheckCircle,
  X,
  AlertCircle,
  LogOut,
  Shield,
  FileText,
  DollarSign,
  Settings,
  Users,
  BarChart3,
  CreditCard,
  Search,
  ArrowRight,
  Smartphone,
  Info
} from 'lucide-react';

// Interfaces
interface Resource {
  id: string;
  name: string;
  type: string;
  description: string;
  price_per_hour?: number;
}

interface Booking {
  id?: number;
  resource_id: string;
  date: string;
  slot_time: string;
  user_name?: string;
  user_phone?: string;
  resource_name?: string;
  status?: string;
  total_price?: number;
  discount_applied?: number;
  created_at?: string;
}

interface UserMetadata {
  name: string;
  phone: string;
  phoneCode: string;
  dob: string;
  gender: string;
  role?: string;
}

interface BookingSuccess {
  message: string;
  user: { id: number; name: string; phone: string; role: string };
  bookings: Booking[];
}

interface AdminStats {
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
  facilities: (Resource & { booking_count: number })[];
  users: { id: number; name: string; phone: string; dob: string; gender: string; role: string }[];
}

interface AdminSettings {
  globalDiscountPercent: number;
  promoCode: string;
  promoDiscountPercent: number;
  adminPasscode?: string;
  bookingStartDate: string;
  bookingDaysToShow: number;
  slotStartTime: string;
  slotEndTime: string;
  slotIntervalMinutes: number;
}

interface Review {
  reviewer: string;
  rating: number;
  comment: string;
  date: string;
}

interface FacilityDetails {
  clubName: string;
  rating: number;
  reviewsCount: number;
  facilities: string[];
  address: string;
  openingHours: string;
  reviews: Review[];
}

const FACILITY_EXTRAS: Record<string, FacilityDetails> = {
  soccer_field: {
    clubName: "Greenwood Turf Association",
    rating: 4.8,
    reviewsCount: 142,
    facilities: ["Locker Room", "Floodlights", "Free Parking", "Showers", "Water Station"],
    address: "128 Sports Complex Road, Sector 5",
    openingHours: "06:00 AM - 11:00 PM",
    reviews: [
      { reviewer: "Arjun Mehta", rating: 5, comment: "Top class turf! Grass is well maintained and night floodlights are excellent.", date: "2026-06-15" },
      { reviewer: "Sarah Jacob", rating: 4, comment: "Locker rooms are clean. Parking is free but gets full in evenings.", date: "2026-06-10" }
    ]
  },
  tennis_court: {
    clubName: "Royal Tennis & Racket Club",
    rating: 4.6,
    reviewsCount: 88,
    facilities: ["Clay Court Equipment", "Restrooms", "Spectator Stands", "Pro Shop", "Cafe"],
    address: "45 Court Avenue, Sector 2",
    openingHours: "07:00 AM - 10:00 PM",
    reviews: [
      { reviewer: "David Miller", rating: 5, comment: "Authentic blue clay court! The spectator seats are comfortable.", date: "2026-06-18" },
      { reviewer: "Rahul Sharma", rating: 4, comment: "Coaching staff is very friendly. Cafe prices are a bit premium.", date: "2026-06-05" }
    ]
  },
  basketball_court: {
    clubName: "Apex Indoor Arena",
    rating: 4.9,
    reviewsCount: 210,
    facilities: ["A/C Cooling", "Polished Hardwood", "Scoreboards", "Locker Room", "Drinking Fountains"],
    address: "7-B Championship Boulevard, Sector 11",
    openingHours: "08:00 AM - 10:00 PM",
    reviews: [
      { reviewer: "Neha Sen", rating: 5, comment: "Amazing indoor AC! The hardwood flooring has great grip.", date: "2026-06-20" },
      { reviewer: "Chris Evans", rating: 5, comment: "Best court in the city. The digital scoreboard works perfectly.", date: "2026-06-12" }
    ]
  }
};

const API_BASE = 'http://localhost:5000/api';

const todayIso = () => new Date().toISOString().split('T')[0];

const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  globalDiscountPercent: 0,
  promoCode: 'WELCOME10',
  promoDiscountPercent: 10,
  adminPasscode: 'Nive@123',
  bookingStartDate: todayIso(),
  bookingDaysToShow: 7,
  slotStartTime: '08:00',
  slotEndTime: '22:00',
  slotIntervalMinutes: 60
};

const getIsAdminRoute = () => window.location.pathname.replace(/\/$/, '').endsWith('/admin') || window.location.hash === '#/admin';

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60) + minutes;
};

const minutesToTime = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const generateTimeSlots = (settings: AdminSettings) => {
  const start = timeToMinutes(settings.slotStartTime || DEFAULT_ADMIN_SETTINGS.slotStartTime);
  const end = timeToMinutes(settings.slotEndTime || DEFAULT_ADMIN_SETTINGS.slotEndTime);
  const interval = Math.max(15, Number(settings.slotIntervalMinutes) || DEFAULT_ADMIN_SETTINGS.slotIntervalMinutes);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];

  const slots: string[] = [];
  for (let current = start; current <= end; current += interval) {
    slots.push(minutesToTime(current));
  }
  return slots;
};

const generateBookingDays = (settings: AdminSettings) => {
  const tempDays = [];
  const startDate = new Date(`${settings.bookingStartDate || todayIso()}T00:00:00`);
  const daysToShow = Math.max(1, Math.min(31, Number(settings.bookingDaysToShow) || 7));

  for (let i = 0; i < daysToShow; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = d.getDate();
    tempDays.push({ dateStr, dayName, dayNum });
  }
  return tempDays;
};

const PHONE_CODES = [
  { code: '+91', country: 'IN', label: '🇮🇳 India (+91)' },
  { code: '+1', country: 'US/CA', label: '🇺🇸 US/CA (+1)' },
  { code: '+44', country: 'UK', label: '🇬🇧 UK (+44)' },
  { code: '+61', country: 'AU', label: '🇦🇺 Australia (+61)' },
  { code: '+971', country: 'AE', label: '🇦🇪 UAE (+971)' }
];

export default function App() {
  // --- Core States ---
  const [resources, setResources] = useState<Resource[]>([]);
  const [activeResource, setActiveResource] = useState<string>('');
  const [activeDate, setActiveDate] = useState<string>(todayIso());
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [userMetadata, setUserMetadata] = useState<UserMetadata | null>(() => {
    const saved = localStorage.getItem('user_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return null;
  });
  const [bookings, setBookings] = useState<Booking[]>([]);

  // --- Hash Routing State ---
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(getIsAdminRoute());
  const [activeTab, setActiveTab] = useState<'book' | 'mybookings'>('book');

  // --- Guest Customer States ---
  const [guestName, setGuestName] = useState<string>(() => {
    const saved = localStorage.getItem('user_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.role !== 'Admin') return parsed.name || '';
      } catch (e) {
        console.error(e);
      }
    }
    return '';
  });
  const [guestPhone, setGuestPhone] = useState<string>(() => {
    const saved = localStorage.getItem('user_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.role !== 'Admin') return parsed.phone || '';
      } catch (e) {
        console.error(e);
      }
    }
    return '';
  });
  const [guestPhoneCode, setGuestPhoneCode] = useState<string>(() => {
    const saved = localStorage.getItem('user_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.role !== 'Admin') return parsed.phoneCode || '+91';
      } catch (e) {
        console.error(e);
      }
    }
    return '+91';
  });
  const [guestErrors, setGuestErrors] = useState<Record<string, string>>({});

  // --- Facility Details Modal States ---
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedDetailsResource, setSelectedDetailsResource] = useState<Resource | null>(null);

  const openDetailsModal = (resource: Resource) => {
    setSelectedDetailsResource(resource);
    setIsDetailsModalOpen(true);
  };

  // --- Booking/Checkout Step Flow ---
  // 0: Cart list, 1: Guest Information, 2: Ticket Statement & Payment screen
  const [bookingStep, setBookingStep] = useState<'facility' | 'timings' | 'payment'>('facility');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterPrice, setFilterPrice] = useState<number>(120);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [darkTheme, setDarkTheme] = useState<boolean>(() => {
    const saved = localStorage.getItem('dark_theme');
    return saved === 'true';
  });

  useEffect(() => {
    if (darkTheme) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
    localStorage.setItem('dark_theme', String(darkTheme));
  }, [darkTheme]);

  const filteredResources = resources.filter(resource => {
    const matchesType = filterType === 'All' || resource.type === filterType;
    const matchesPrice = (resource.price_per_hour || 50.0) <= filterPrice;
    return matchesType && matchesPrice;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<BookingSuccess | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Simulated Payment Details ---
  const [paymentType, setPaymentType] = useState<'card' | 'wallet' | 'cash'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({});

  // --- Customer Booking Search History States ---
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResultBookings, setSearchResultBookings] = useState<Booking[]>([]);
  const [isSearchingBookings, setIsSearchingBookings] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // --- Admin Portal States ---
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminBookings, setAdminBookings] = useState<Booking[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({
    ...DEFAULT_ADMIN_SETTINGS
  });
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [adminActiveTab, setAdminActiveTab] = useState<'dashboard' | 'facilities' | 'bookings' | 'settings'>('dashboard');
  const [editingFacility, setEditingFacility] = useState<Resource | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [activeSettings, setActiveSettings] = useState<AdminSettings>({
    ...DEFAULT_ADMIN_SETTINGS
  });
  const daysOfWeek = useMemo(() => generateBookingDays(activeSettings), [activeSettings]);
  const timeSlots = useMemo(() => generateTimeSlots(activeSettings), [activeSettings]);

  // Hash listener effect
  useEffect(() => {
    const handleRouteChange = () => {
      setIsAdminRoute(getIsAdminRoute());
      // Reset steps if switching views
      setBookingStep('facility');
      setBookingSuccess(null);
    };
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  useEffect(() => {
    // Load active settings on startup
    fetch(`${API_BASE}/admin/settings`)
      .then(res => res.json())
      .then(data => setActiveSettings({ ...DEFAULT_ADMIN_SETTINGS, ...data }))
      .catch(err => console.error("Error loading settings", err));
  }, []);

  useEffect(() => {
    if (daysOfWeek.length === 0) return;
    if (!daysOfWeek.some(day => day.dateStr === activeDate)) {
      setActiveDate(daysOfWeek[0].dateStr);
      setSelectedSlots([]);
    }
  }, [activeSettings, activeDate, daysOfWeek]);

  // Fetch facilities/resources
  useEffect(() => {
    fetch(`${API_BASE}/resources`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch facilities');
        return res.json();
      })
      .then((data: Resource[]) => {
        setResources(data);
        if (data.length > 0) {
          setActiveResource(data[0].id);
        }
      })
      .catch(err => {
        console.error(err);
        setFetchError('Could not load facilities. Please ensure API server is running.');
      });
  }, []);

  // Fetch bookings for active resource and date
  useEffect(() => {
    if (!activeResource || !activeDate) return;

    fetch(`${API_BASE}/bookings?resource_id=${activeResource}&start_date=${activeDate}&end_date=${activeDate}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch bookings');
        return res.json();
      })
      .then((data: Booking[]) => {
        setBookings(data);
      })
      .catch(err => {
        console.error('Error fetching bookings:', err);
      });
  }, [activeResource, activeDate, bookingSuccess]);

  // Fetch Admin Data
  const isAdminView = isAdminRoute && userMetadata?.role === 'Admin';
  useEffect(() => {
    if (!isAdminView) return;

    fetch(`${API_BASE}/admin/stats`)
      .then(res => res.json())
      .then(data => setAdminStats(data))
      .catch(err => console.error("Error loading stats", err));

    fetch(`${API_BASE}/admin/bookings`)
      .then(res => res.json())
      .then(data => setAdminBookings(data))
      .catch(err => console.error("Error loading admin bookings", err));

    fetch(`${API_BASE}/admin/settings`)
      .then(res => res.json())
      .then(data => setAdminSettings({ ...DEFAULT_ADMIN_SETTINGS, ...data }))
      .catch(err => console.error("Error loading admin settings", err));
  }, [isAdminView]);

  const refreshAdminData = () => {
    fetch(`${API_BASE}/admin/stats`)
      .then(res => res.json())
      .then(data => setAdminStats(data))
      .catch(err => console.error("Error loading stats", err));

    fetch(`${API_BASE}/admin/bookings`)
      .then(res => res.json())
      .then(data => setAdminBookings(data))
      .catch(err => console.error("Error loading admin bookings", err));
  };

  // Toggle slot selection
  const handleSlotClick = (slot: string) => {
    const isOccupied = bookings.some(b => b.slot_time === slot);
    if (isOccupied) return;

    if (selectedSlots.includes(slot)) {
      setSelectedSlots(prev => prev.filter(s => s !== slot));
    } else {
      setSelectedSlots(prev => [...prev, slot]);
    }
  };

  // Guest details form validation
  const validateGuestDetails = (): boolean => {
    const errors: Record<string, string> = {};
    if (!guestName.trim()) {
      errors.name = 'Full Name is required';
    } else if (guestName.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    if (!guestPhone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!/^[0-9\s\-()]{7,15}$/.test(guestPhone.trim())) {
      errors.phone = 'Invalid phone format (7-15 digits)';
    }

    setGuestErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Card validation
  const validatePaymentDetails = (): boolean => {
    if (paymentType !== 'card') return true;

    const errors: Record<string, string> = {};
    const cleanNum = cardNumber.replace(/\s?/g, '');

    if (cleanNum.length !== 16 || !/^\d+$/.test(cleanNum)) {
      errors.cardNumber = 'Card number must be exactly 16 digits';
    }
    if (!cardHolder.trim()) {
      errors.cardHolder = 'Cardholder name is required';
    }
    if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
      errors.cardExpiry = 'Expiry must be formatted as MM/YY';
    }
    if (cardCvv.length !== 3 || !/^\d+$/.test(cardCvv)) {
      errors.cardCvv = 'CVV must be 3 digits';
    }

    setPaymentErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Trigger guest transaction checkout
  const handleConfirmBooking = async () => {
    if (!validatePaymentDetails()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    // Save profile metadata locally for guest convenience
    const profile = {
      name: guestName.trim(),
      phone: guestPhone.trim(),
      phoneCode: guestPhoneCode,
      dob: '2000-01-01',
      gender: 'Other',
      role: 'User'
    };
    localStorage.setItem('user_profile', JSON.stringify(profile));
    setUserMetadata(profile);

    const payload = {
      user: {
        name: guestName.trim(),
        phone: `${guestPhoneCode} ${guestPhone.trim()}`,
        dob: '2000-01-01',
        gender: 'Other'
      },
      bookings: selectedSlots.map(slot => ({
        resource_id: activeResource,
        date: activeDate,
        slot_time: slot
      })),
      promoCode: promoCodeInput.trim()
    };

    try {
      const response = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Booking transaction failed');
      }

      setBookingSuccess(result);
      setSelectedSlots([]);

      // Reset card details
      setCardNumber('');
      setCardHolder('');
      setCardExpiry('');
    } catch (err) {
      console.error(err);
      const errorMsg = err instanceof Error ? err.message : 'An error occurred during booking. Please try again.';
      setErrorMessage(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guest lookup search
  const handleSearchBookings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchPhone.trim()) {
      setSearchError('Please enter a phone number to search.');
      return;
    }

    setIsSearchingBookings(true);
    setSearchError(null);
    setSearchResultBookings([]);

    try {
      const response = await fetch(`${API_BASE}/bookings/by-phone?phone=${encodeURIComponent(searchPhone.trim())}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve bookings.');
      }
      setSearchResultBookings(data);
      if (data.length === 0) {
        setSearchError('No active or past bookings found for this phone number.');
      }
    } catch (err) {
      console.error(err);
      const errorMsg = err instanceof Error ? err.message : 'An error occurred while fetching bookings history.';
      setSearchError(errorMsg);
    } finally {
      setIsSearchingBookings(false);
    }
  };

  // Guest booking cancellation (client-direct request)
  const handleCustomerCancelBooking = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/bookings/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' })
      });
      if (res.ok) {
        alert('Booking cancelled successfully.');
        // Re-run search
        const response = await fetch(`${API_BASE}/bookings/by-phone?phone=${encodeURIComponent(searchPhone.trim())}`);
        const data = await response.json();
        setSearchResultBookings(data);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to cancel booking');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Simple customer login (required before booking)
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const verifyCustomerOnServer = async (name: string, phone: string) => {
    try {
      const res = await fetch(`${API_BASE}/verify-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data?.verified);
    } catch (err) {
      return false;
    }
  };

  const handleCustomerLogin = async (e?: React.FormEvent, forceGuest = false) => {
    if (e) e.preventDefault();
    setVerificationError(null);

    if (forceGuest) {
      const profile: UserMetadata = {
        name: guestName && guestName.trim() ? guestName.trim() : 'Guest User',
        phone: guestPhone.trim() || '',
        phoneCode: guestPhoneCode,
        dob: '2000-01-01',
        gender: 'Other',
        role: 'User'
      };
      localStorage.setItem('user_profile', JSON.stringify(profile));
      setUserMetadata(profile);
      return;
    }

    const errors: Record<string, string> = {};
    if (!guestName.trim() || guestName.trim().length < 2) {
      errors.name = 'Please enter your full name (min 2 chars)';
    }
    if (!guestPhone.trim() || !/^[0-9\s\-()]{7,15}$/.test(guestPhone.trim())) {
      errors.phone = 'Please enter a valid phone number';
    }
    setGuestErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Try optional server-side verification; fall back to local acceptance
    setIsVerifying(true);
    const fullPhone = `${guestPhoneCode} ${guestPhone.trim()}`;
    const verified = await verifyCustomerOnServer(guestName.trim(), fullPhone);
    setIsVerifying(false);

    if (!verified) {
      // fallback: accept locally but show a soft warning
      setVerificationError('Could not verify via server; proceeding as local guest.');
    }

    const profile: UserMetadata = {
      name: guestName.trim(),
      phone: guestPhone.trim(),
      phoneCode: guestPhoneCode,
      dob: '2000-01-01',
      gender: 'Other',
      role: 'User'
    };
    localStorage.setItem('user_profile', JSON.stringify(profile));
    setUserMetadata(profile);
  };

  // Disconnect guest details
  const handleLogout = () => {
    localStorage.removeItem('user_profile');
    setUserMetadata(null);
    setGuestName('');
    setGuestPhone('');
    setGuestPhoneCode('+91');
    setBookingStep('facility');
    setBookingSuccess(null);
    // If Admin, clear hash
    if (userMetadata?.role === 'Admin') {
      goHome();
    }
  };

  // Admin access validation
  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeError('');
    try {
      const res = await fetch(`${API_BASE}/admin/verify-passcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      });
      if (res.ok) {
        const adminProfile: UserMetadata = {
          name: 'Admin System',
          phone: '999-9999',
          phoneCode: '+1',
          dob: '1985-01-01',
          gender: 'Other',
          role: 'Admin'
        };
        setUserMetadata(adminProfile);
        localStorage.setItem('user_profile', JSON.stringify(adminProfile));
        setPasscode('');
      } else {
        const err = await res.json();
        setPasscodeError(err.error || 'Invalid passcode. Authorization denied.');
      }
    } catch (err) {
      console.error(err);
      setPasscodeError('Error connecting to the verification server.');
    }
  };

  const handleCancelBooking = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/admin/bookings/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' })
      });
      if (res.ok) {
        refreshAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to cancel booking');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmBookingStatus = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/admin/bookings/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Confirmed' })
      });
      if (res.ok) {
        refreshAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to confirm booking');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFacilityUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFacility) return;
    try {
      const res = await fetch(`${API_BASE}/admin/resources/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingFacility)
      });
      if (res.ok) {
        setEditingFacility(null);
        refreshAdminData();
        fetch(`${API_BASE}/resources`)
          .then(r => r.json())
          .then(data => setResources(data));
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update facility');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminSettings)
      });
      if (res.ok) {
        const result = await res.json();
        if (result.settings) {
          const mergedSettings = { ...DEFAULT_ADMIN_SETTINGS, ...result.settings };
          setAdminSettings(mergedSettings);
          setActiveSettings(mergedSettings);
        }
        alert('Settings saved successfully!');
        refreshAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Card input mask helper (ex: 4111 2222 3333 4444)
  const handleCardNumberChange = (val: string) => {
    const clean = val.replace(/\D/g, '').substring(0, 16);
    const matches = clean.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      setCardNumber(parts.join(' '));
    } else {
      setCardNumber(clean);
    }
  };

  // Card Expiry mask helper (ex: 12/28)
  const handleExpiryChange = (val: string) => {
    const clean = val.replace(/\D/g, '').substring(0, 4);
    if (clean.length > 2) {
      setCardExpiry(`${clean.substring(0, 2)}/${clean.substring(2, 4)}`);
    } else {
      setCardExpiry(clean);
    }
  };

  const goHome = () => {
    window.history.pushState({}, '', '/');
    window.location.hash = '';
    setIsAdminRoute(false);
    setActiveTab('book');
    setBookingSuccess(null);
  };

  const activeResourceDetails = resources.find(r => r.id === activeResource);
  const hourlyPrice = activeResourceDetails?.price_per_hour || 50.0;
  const isPromoApplied = promoCodeInput.trim().toUpperCase() === activeSettings.promoCode;
  const currentDiscountPercent = isPromoApplied ? activeSettings.promoDiscountPercent : activeSettings.globalDiscountPercent;
  const subtotal = hourlyPrice * selectedSlots.length;
  const discountAmount = subtotal * (currentDiscountPercent / 100);
  const totalAmount = subtotal - discountAmount;

  return (
    <div className="app-container">
      {/* LEFT SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="sidebar-brand" onClick={goHome}>
          <Activity size={26} color="var(--accent-mint)" />
          <span>GreenPlay Arena</span>
        </div>

        <nav className="sidebar-menu">
          <button
            className={`sidebar-link ${activeTab === 'book' && !isAdminRoute ? 'active' : ''}`}
            onClick={() => {
              goHome();
            }}
          >
            <Calendar size={18} />
            <span>Book Turf Slots</span>
          </button>

          <button
            className={`sidebar-link ${activeTab === 'mybookings' && !isAdminRoute ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('mybookings');
              window.history.pushState({}, '', '/');
              window.location.hash = '';
              setIsAdminRoute(false);
              setBookingSuccess(null);
            }}
          >
            <FileText size={18} />
            <span>My Bookings</span>
          </button>

          <button
            className={`sidebar-link ${isSettingsOpen ? 'active' : ''}`}
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings size={18} />
            <span>App Settings</span>
          </button>
        </nav>

        {/* Sidebar Filters */}
        {activeTab === 'book' && bookingStep === 'facility' && !isAdminRoute && (
          <div className="sidebar-filters" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <span className="section-label" style={{ margin: 0 }}>Filter Options</span>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Facility Category</label>
              <select
                className="form-control"
                style={{ fontSize: '0.85rem', padding: '0.5rem' }}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="All">All Categories</option>
                <option value="Sport Field">Soccer Fields</option>
                <option value="Racquet Court">Tennis Courts</option>
                <option value="Indoor Court">Basketball Courts</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 0 }}>Max Hourly Rate</label>
                <strong style={{ fontSize: '0.8rem', color: 'var(--accent-mint)' }}>${filterPrice}/hr</strong>
              </div>
              <input
                type="range"
                min="35"
                max="120"
                step="5"
                className="form-control"
                style={{ padding: 0, height: 'auto', cursor: 'pointer' }}
                value={filterPrice}
                onChange={(e) => setFilterPrice(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          {userMetadata && userMetadata.role !== 'Admin' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--accent-mint)' }}></div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{userMetadata.name}</span>
              </div>
              <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', width: '100%' }} onClick={handleLogout}>
                <LogOut size={12} /> Disconnect
              </button>
            </div>
          ) : (
            <div className="sidebar-status">
              <div className="status-dot"></div>
              <span>Guest Scheduler Mode</span>
            </div>
          )}
        </div>
      </aside>

      {/* MOBILE HEADER (Only displays on mobile) */}
      <header className="navbar">
        <div className="nav-brand" onClick={goHome}>
          <Activity size={24} color="var(--accent-mint)" />
          <span>GreenPlay</span>
        </div>
        <div className="nav-actions">
          {userMetadata && userMetadata.role !== 'Admin' && (
            <button className="user-badge" onClick={handleLogout}>
              <LogOut size={12} />
              <span>Exit</span>
            </button>
          )}
        </div>
      </header>

      {/* MAIN WRAPPER */}
      <div className="content-wrapper">
        <main className="main-content">
          {!isAdminRoute && (
            <div className="ticker-wrap">
              <span className="ticker-title">Sports Feed</span>
              <div className="ticker-content">
                <span className="ticker-text">
                  "You miss 100% of the shots you don't take." — Wayne Gretzky &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  "It’s not whether you get knocked down; it’s whether you get up." — Vince Lombardi &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  "Gold medals aren't really made of gold. They're made of sweat, determination, and a hard-to-find alloy called guts." — Dan Gable &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  "Champions keep playing until they get it right." — Billie Jean King &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  "The only way to prove that you’re a good sport is to lose." — Ernie Banks &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  "I've failed over and over and over again in my life. And that is why I succeed." — Michael Jordan
                </span>
              </div>
            </div>
          )}

          {fetchError && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#FCA5A5',
              padding: '1rem',
              borderRadius: '10px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <AlertCircle size={20} />
              <span>{fetchError}</span>
            </div>
          )}

          {/* CUSTOMER LOGIN OVERLAY (requires login before booking) */}
          {!isAdminRoute && !userMetadata && (
            <div className="login-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000 }}>
              <div className="card login-card" style={{ width: 'min(540px, 94%)', padding: '1.5rem', borderRadius: '12px' }}>
                <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Welcome — Please Sign In</h2>
                <p style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-secondary)' }}>Enter your name and phone to continue booking slots.</p>

                <form onSubmit={handleCustomerLogin} style={{ display: 'grid', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Full name</label>
                    <input className="form-control" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g., Priya Kumar" />
                    {guestErrors.name && <div style={{ color: 'var(--state-error)', fontSize: '0.85rem' }}>{guestErrors.name}</div>}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ minWidth: '120px' }}>
                      <label className="form-label">Code</label>
                      <select className="form-control" value={guestPhoneCode} onChange={(e) => setGuestPhoneCode(e.target.value)}>
                        {PHONE_CODES.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="form-label">Phone</label>
                      <input className="form-control" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="9876543210" />
                      {guestErrors.phone && <div style={{ color: 'var(--state-error)', fontSize: '0.85rem' }}>{guestErrors.phone}</div>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', alignItems: 'center' }}>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isVerifying}>{isVerifying ? 'Verifying…' : 'Continue to Booking'}</button>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setGuestName('Guest User'); setGuestPhone(''); handleCustomerLogin(undefined, true); }}>Skip / Quick Guest</button>
                  </div>
                  {verificationError && <div style={{ color: 'var(--state-warning)', marginTop: '0.5rem' }}>{verificationError}</div>}
                </form>
              </div>
            </div>
          )}

          {/* ADMIN PORTAL FLOW */}
          {isAdminRoute ? (
            userMetadata?.role === 'Admin' ? (
              // ADMIN CONTROL CENTER
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="card" style={{ padding: '1.25rem 1.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Shield size={24} color="var(--accent-gold)" />
                        <span>Administrative Control Center</span>
                      </h2>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Authorized session active.</p>
                    </div>

                    <div className="segmented-control" style={{ maxWidth: '480px', width: '100%' }}>
                      {(['dashboard', 'facilities', 'bookings', 'settings'] as const).map((tab) => (
                        <div key={tab} className="segmented-option">
                          <input
                            type="radio"
                            name="admin-tab"
                            id={`admin-tab-${tab}`}
                            checked={adminActiveTab === tab}
                            onChange={() => setAdminActiveTab(tab)}
                          />
                          <label htmlFor={`admin-tab-${tab}`} className="segmented-label" style={{ textTransform: 'capitalize', fontSize: '0.85rem' }}>
                            {tab}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* TAB 1: OVERVIEW DASHBOARD */}
                {adminActiveTab === 'dashboard' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Stats Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--border-color-glow)', padding: '1rem', borderRadius: '12px', color: 'var(--accent-mint)' }}>
                          <BarChart3 size={28} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>TOTAL RESERVATIONS</div>
                          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem' }}>{adminStats?.totalBookings || 0}</div>
                        </div>
                      </div>

                      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: '12px', color: 'var(--accent-gold)' }}>
                          <DollarSign size={28} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>TOTAL REVENUE</div>
                          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem' }}>
                            ${(adminStats?.totalRevenue || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--border-color-glow)', padding: '1rem', borderRadius: '12px', color: 'var(--accent-mint)' }}>
                          <Users size={28} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>REGISTERED USERS</div>
                          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem' }}>{adminStats?.totalUsers || 0}</div>
                        </div>
                      </div>
                    </div>

                    {/* Users list */}
                    <div className="card">
                      <div className="card-title">
                        <Users size={20} color="var(--accent-mint)" />
                        <span>Registered Customers & Guests</span>
                      </div>
                      <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                        <table>
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Name</th>
                              <th>Phone Number</th>
                              <th>Gender</th>
                              <th>Access Level</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminStats?.users?.map((usr) => (
                              <tr key={usr.id}>
                                <td style={{ color: 'var(--text-muted)' }}>{usr.id}</td>
                                <td style={{ fontWeight: 700 }}>{usr.name}</td>
                                <td>{usr.phone}</td>
                                <td>{usr.gender}</td>
                                <td>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    backgroundColor: usr.role === 'Admin' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.05)',
                                    color: usr.role === 'Admin' ? 'var(--accent-gold)' : 'var(--text-secondary)'
                                  }}>
                                    {usr.role}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: FACILITIES EDITOR */}
                {adminActiveTab === 'facilities' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                    <div className="card">
                      <div className="card-title">
                        <MapPin size={20} color="var(--accent-mint)" />
                        <span>Manage Pricing Rates & Descriptions</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.25rem' }}>
                        {resources.map((facility) => (
                          <div
                            key={facility.id}
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.01)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '12px',
                              padding: '1.25rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '1rem'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div>
                                <strong style={{ fontSize: '1.1rem', color: 'white' }}>{facility.name}</strong>
                                <span style={{ fontSize: '0.75rem', color: 'var(--accent-mint)', marginLeft: '0.5rem', textTransform: 'uppercase', fontWeight: 700 }}>{facility.type}</span>
                              </div>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                                onClick={() => setEditingFacility(facility)}
                              >
                                Edit Facility Parameters
                              </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              <div>{facility.description}</div>
                              <div style={{ textAlign: 'right' }}>
                                Hourly Rate: <strong style={{ color: 'white', fontSize: '1.1rem' }}>${(facility.price_per_hour || 50.0).toFixed(2)} / hr</strong>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Facility editing modal */}
                    {editingFacility && (
                      <div className="modal-overlay">
                        <div className="modal-content" style={{ maxWidth: '460px' }}>
                          <button className="modal-close" onClick={() => setEditingFacility(null)}>
                            <X size={20} />
                          </button>
                          <h3 className="modal-title">Edit Facility</h3>
                          <p className="modal-subtitle">Modify parameters for {editingFacility.name}.</p>

                          <form onSubmit={handleFacilityUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div className="form-group">
                              <label className="form-label">Facility Name</label>
                              <input
                                type="text"
                                className="form-control"
                                value={editingFacility.name}
                                onChange={(e) => setEditingFacility({ ...editingFacility, name: e.target.value })}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Hourly Booking Rate ($)</label>
                              <input
                                type="number"
                                step="0.01"
                                className="form-control"
                                value={editingFacility.price_per_hour || ''}
                                onChange={(e) => setEditingFacility({ ...editingFacility, price_per_hour: parseFloat(e.target.value) || 0 })}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Description</label>
                              <textarea
                                rows={3}
                                className="form-control"
                                style={{ resize: 'vertical', fontFamily: 'var(--font-sans)' }}
                                value={editingFacility.description}
                                onChange={(e) => setEditingFacility({ ...editingFacility, description: e.target.value })}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingFacility(null)}>Cancel</button>
                              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Changes</button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: BOOKINGS MANAGER */}
                {adminActiveTab === 'bookings' && (
                  <div className="card">
                    <div className="card-title">
                      <Clock size={20} color="var(--accent-mint)" />
                      <span>Real-time Bookings Ledger</span>
                    </div>

                    <div style={{ overflowX: 'auto', marginTop: '1.25rem' }}>
                      <table style={{ fontSize: '0.8rem' }}>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Customer</th>
                            <th>Phone</th>
                            <th>Facility</th>
                            <th>Schedule Slot</th>
                            <th>Total Fee</th>
                            <th>Discount</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'center' }}>Admin Operations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminBookings.map((bk) => (
                            <tr key={bk.id} style={{ opacity: bk.status === 'Cancelled' ? 0.6 : 1 }}>
                              <td style={{ color: 'var(--text-muted)' }}>{bk.id}</td>
                              <td style={{ fontWeight: 700 }}>{bk.user_name}</td>
                              <td>{bk.user_phone}</td>
                              <td>{bk.resource_name}</td>
                              <td style={{ fontWeight: 600 }}>
                                <span style={{ color: 'var(--accent-mint)' }}>{bk.date}</span> @ <span style={{ color: 'white' }}>{bk.slot_time}</span>
                              </td>
                              <td style={{ fontWeight: 700, color: 'white' }}>${(bk.total_price || 0.0).toFixed(2)}</td>
                              <td style={{ color: 'var(--state-warning)' }}>-${(bk.discount_applied || 0.0).toFixed(2)}</td>
                              <td>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '0.15rem 0.4rem',
                                  borderRadius: '4px',
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  backgroundColor: bk.status === 'Confirmed' || bk.status === 'Admin Confirmed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: bk.status === 'Confirmed' || bk.status === 'Admin Confirmed' ? 'var(--state-success)' : 'var(--state-danger)'
                                }}>
                                  {bk.status}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                  {bk.status === 'Cancelled' ? (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderColor: 'var(--state-success)', color: 'var(--state-success)' }}
                                      onClick={() => handleConfirmBookingStatus(bk.id!)}
                                    >
                                      Re-Confirm
                                    </button>
                                  ) : (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderColor: 'var(--state-danger)', color: 'var(--state-danger)' }}
                                      onClick={() => handleCancelBooking(bk.id!)}
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB 4: PROMO & SETTINGS */}
                {adminActiveTab === 'settings' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                    <div className="card" style={{ maxWidth: '600px', width: '100%', margin: '0 auto' }}>
                      <div className="card-title">
                        <Settings size={20} color="var(--accent-mint)" />
                        <span>Configure Pricing Reductions & Discounts</span>
                      </div>

                      <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.25rem' }}>
                        <div className="form-group">
                          <label className="form-label">Global Base Price Discount (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="form-control"
                            placeholder="e.g. 15"
                            value={adminSettings.globalDiscountPercent || 0}
                            onChange={(e) => setAdminSettings({ ...adminSettings, globalDiscountPercent: parseFloat(e.target.value) || 0 })}
                          />
                          <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                            Automatically applied to all bookings.
                          </small>
                        </div>

                        <hr style={{ border: 'none', borderBottom: '1px solid var(--border-color)' }} />

                        <div className="form-group">
                          <label className="form-label">Active Promo Code</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. WELCOME10"
                            style={{ textTransform: 'uppercase' }}
                            value={adminSettings.promoCode || ''}
                            onChange={(e) => setAdminSettings({ ...adminSettings, promoCode: e.target.value.toUpperCase() })}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Promo Discount (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="form-control"
                            placeholder="e.g. 20"
                            value={adminSettings.promoDiscountPercent || 0}
                            onChange={(e) => setAdminSettings({ ...adminSettings, promoDiscountPercent: parseFloat(e.target.value) || 0 })}
                          />
                        </div>

                        <hr style={{ border: 'none', borderBottom: '1px solid var(--border-color)' }} />

                        <div>
                          <div className="card-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>
                            <Clock size={18} color="var(--accent-mint)" />
                            <span>Dynamic Booking Timings</span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                            <div className="form-group">
                              <label className="form-label">Booking Start Date</label>
                              <input
                                type="date"
                                className="form-control"
                                value={adminSettings.bookingStartDate || todayIso()}
                                onChange={(e) => setAdminSettings({ ...adminSettings, bookingStartDate: e.target.value })}
                              />
                            </div>

                            <div className="form-group">
                              <label className="form-label">Visible Days</label>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                className="form-control"
                                value={adminSettings.bookingDaysToShow || 7}
                                onChange={(e) => setAdminSettings({ ...adminSettings, bookingDaysToShow: parseInt(e.target.value, 10) || 7 })}
                              />
                            </div>

                            <div className="form-group">
                              <label className="form-label">First Slot Time</label>
                              <input
                                type="time"
                                className="form-control"
                                value={adminSettings.slotStartTime || '08:00'}
                                onChange={(e) => setAdminSettings({ ...adminSettings, slotStartTime: e.target.value })}
                              />
                            </div>

                            <div className="form-group">
                              <label className="form-label">Last Slot Time</label>
                              <input
                                type="time"
                                className="form-control"
                                value={adminSettings.slotEndTime || '22:00'}
                                onChange={(e) => setAdminSettings({ ...adminSettings, slotEndTime: e.target.value })}
                              />
                            </div>

                            <div className="form-group">
                              <label className="form-label">Slot Interval (minutes)</label>
                              <input
                                type="number"
                                min="15"
                                max="240"
                                step="15"
                                className="form-control"
                                value={adminSettings.slotIntervalMinutes || 60}
                                onChange={(e) => setAdminSettings({ ...adminSettings, slotIntervalMinutes: parseInt(e.target.value, 10) || 60 })}
                              />
                            </div>
                          </div>

                          <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>
                            These values control which booking dates and time slots customers can choose.
                          </small>
                        </div>

                        <hr style={{ border: 'none', borderBottom: '1px solid var(--border-color)' }} />

                        <div className="form-group">
                          <label className="form-label">Change Admin Passcode</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Enter new passcode"
                            value={adminSettings.adminPasscode || ''}
                            onChange={(e) => setAdminSettings({ ...adminSettings, adminPasscode: e.target.value })}
                          />
                          <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                            The passcode required to authorize administrative control sessions.
                          </small>
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem', width: '100%', marginTop: '1rem' }}>
                          Apply Configurations
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // ADMIN CREDENTIALS LOGIN PAGE (ISOLATED)
              <div className="card" style={{ maxWidth: '400px', width: '100%', margin: '4rem auto' }}>
                <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <Shield size={24} color="var(--accent-gold)" />
                  <span>Admin Credentials Login</span>
                </h3>
                <p className="modal-subtitle" style={{ textAlign: 'center' }}>
                  Enter the administrative authorization passcode to configure turf facilities.
                </p>

                {passcodeError && (
                  <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#FCA5A5',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    gap: '0.5rem'
                  }}>
                    <AlertCircle size={16} />
                    <span>{passcodeError}</span>
                  </div>
                )}

                <form onSubmit={handlePasscodeSubmit}>
                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="form-label">Authorization Passcode</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Enter admin passcode"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      onClick={goHome}
                    >
                      Exit to App
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                    >
                      Authorize
                    </button>
                  </div>
                </form>
              </div>
            )
          ) : (
            // CUSTOMER INTERFACES
            activeTab === 'mybookings' ? (
              // GUEST BOOKINGS LOG SEARCH VIEW
              <div style={{ maxWidth: '750px', width: '100%', margin: '0 auto' }}>
                <div className="card">
                  <div className="card-title">
                    <Search size={22} color="var(--accent-mint)" />
                    <span>Retrieve Booking Logs</span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    Enter the phone number used during checkout to list all your booking tickets.
                  </p>

                  <form onSubmit={handleSearchBookings} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="Enter phone number (e.g. 555-0199)"
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" disabled={isSearchingBookings}>
                      {isSearchingBookings ? 'Searching...' : 'Search'}
                    </button>
                  </form>

                  {searchError && (
                    <div style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.05)',
                      border: '1px solid rgba(245, 158, 11, 0.15)',
                      color: '#FCD34D',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '1.5rem'
                    }}>
                      <Info size={16} />
                      <span>{searchError}</span>
                    </div>
                  )}

                  {searchResultBookings.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
                      <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#FFFFFF', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                        Found {searchResultBookings.length} booking records:
                      </h4>
                      {searchResultBookings.map((bk) => (
                        <div
                          key={bk.id}
                          className="booking-statement-ticket"
                          style={{ opacity: bk.status === 'Cancelled' ? 0.6 : 1 }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--accent-mint)', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.08em' }}>OFFICIAL TICKET</span>
                              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', marginTop: '0.15rem' }}>{bk.resource_name}</h3>
                            </div>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              backgroundColor: bk.status === 'Confirmed' || bk.status === 'Admin Confirmed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: bk.status === 'Confirmed' || bk.status === 'Admin Confirmed' ? 'var(--state-success)' : 'var(--state-danger)'
                            }}>
                              {bk.status}
                            </span>
                          </div>

                          <div className="perforated-line"></div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                            <div>
                              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>BOOKED DATE</span>
                              <strong style={{ color: 'white' }}>{bk.date}</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>SCHEDULE TIME</span>
                              <strong style={{ color: 'white' }}>{bk.slot_time}</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>TOTAL CHARGED</span>
                              <strong style={{ color: 'white' }}>${(bk.total_price || 0).toFixed(2)}</strong>
                            </div>
                            {bk.status !== 'Cancelled' && (
                              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderColor: 'var(--state-danger)', color: 'var(--state-danger)' }}
                                  onClick={() => handleCustomerCancelBooking(bk.id!)}
                                >
                                  Cancel Booking
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // MAIN SCHEDULER BOOKING VIEW
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Stepper Header (Only when not showing success screen) */}
                {!bookingSuccess && (
                  <div className="booking-stepper">
                    <div className={`stepper-step ${bookingStep === 'facility' ? 'active' : ''} ${bookingStep === 'timings' || bookingStep === 'payment' ? 'completed' : ''}`}>
                      <div className="step-number">1</div>
                      <span>Choose Facility</span>
                    </div>
                    <div className="stepper-divider"></div>
                    <div className={`stepper-step ${bookingStep === 'timings' ? 'active' : ''} ${bookingStep === 'payment' ? 'completed' : ''}`}>
                      <div className="step-number">2</div>
                      <span>Select Date & Time</span>
                    </div>
                    <div className="stepper-divider"></div>
                    <div className={`stepper-step ${bookingStep === 'payment' ? 'active' : ''}`}>
                      <div className="step-number">3</div>
                      <span>Checkout & Confirm</span>
                    </div>
                  </div>
                )}

                {/* bookingSuccess screen shown at any step if present */}
                {bookingSuccess ? (
                  // SUCCESS SCREEN (full width!)
                  <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                    <div className="success-screen">
                      <div className="success-icon-wrapper" style={{ margin: '0 auto 1.5rem', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--state-success-glow)', color: 'var(--state-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle size={36} />
                      </div>
                      <h3 className="success-title" style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--accent-mint)' }}>Booking Confirmed!</h3>
                      <p className="success-msg" style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '2rem' }}>
                        Your slots have been locked and confirmed in the turf schedule database.
                      </p>

                      {/* Ticket statement layout */}
                      <div className="booking-statement-ticket" style={{ marginBottom: '2rem', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-mint)', textTransform: 'uppercase' }}>
                          <span>GREENPLAY TICKET</span>
                          <span>CONFIRMED</span>
                        </div>
                        <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem', marginBottom: '0.5rem' }}>
                          {activeResourceDetails?.name}
                        </h4>

                        <div className="perforated-line" style={{ margin: '1rem 0', borderTop: '1px dashed var(--border-color)' }}></div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Customer</span>
                            <strong style={{ color: 'var(--text-primary)' }}>{bookingSuccess.user?.name}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Contact</span>
                            <strong style={{ color: 'var(--text-primary)' }}>{bookingSuccess.user?.phone}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Date</span>
                            <strong style={{ color: 'var(--text-primary)' }}>{bookingSuccess.bookings[0]?.date}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Time Slots</span>
                            <strong style={{ color: 'var(--text-primary)' }}>
                              {bookingSuccess.bookings.map(b => b.slot_time).join(', ')}
                            </strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '0.6rem', marginTop: '0.25rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Total Fee Charged</span>
                            <strong style={{ color: 'var(--accent-mint)', fontSize: '1.1rem' }}>
                              ${bookingSuccess.bookings.reduce((sum: number, b) => sum + (b.total_price || 0.0), 0.0).toFixed(2)}
                            </strong>
                          </div>
                        </div>

                        <div className="barcode" style={{ marginTop: '1.5rem', height: '40px', background: 'repeating-linear-gradient(90deg, #333, #333 2px, transparent 2px, transparent 6px, #333 6px, #333 7px, transparent 7px, transparent 9px)' }}></div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.5rem', letterSpacing: '0.1em', textAlign: 'center' }}>
                          TXN-{bookingSuccess.bookings[0]?.id || 100}{bookingSuccess.user?.id}
                        </div>
                      </div>

                      <button
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '0.8rem' }}
                        onClick={() => {
                          setBookingSuccess(null);
                          setPromoCodeInput('');
                          setSelectedSlots([]);
                          setBookingStep('facility');
                        }}
                      >
                        Book Another Session
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* STEP 1: Select Facility Grid */}
                    {bookingStep === 'facility' && (
                      <div className="facilities-grid">
                        {filteredResources.length > 0 ? (
                          filteredResources.map((resource) => (
                            <div key={resource.id} className="facility-card">
                              <div>
                                <div className="facility-header">
                                  <span className="facility-tag">{resource.type}</span>
                                  <span className="facility-rating">★ {FACILITY_EXTRAS[resource.id]?.rating || '4.5'}</span>
                                </div>
                                <h3 className="facility-title">{resource.name}</h3>
                                <p className="facility-description">{resource.description}</p>
                                <div className="facility-amenities">
                                  {(FACILITY_EXTRAS[resource.id]?.facilities || []).map((f) => (
                                    <span key={f} className="amenity-tag">{f}</span>
                                  ))}
                                </div>
                              </div>
                              <div className="facility-footer">
                                <div className="facility-price">
                                  <span className="price-label">Hourly Rate</span>
                                  <span className="price-value">${(resource.price_per_hour || 50.0).toFixed(2)}/hr</span>
                                </div>
                                <div className="facility-actions">
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                                    onClick={() => openDetailsModal(resource)}
                                  >
                                    Details
                                  </button>
                                  <button
                                    className="btn btn-primary"
                                    style={{ padding: '0.4rem 1.1rem', fontSize: '0.85rem' }}
                                    onClick={() => {
                                      setActiveResource(resource.id);
                                      setSelectedSlots([]);
                                      setBookingStep('timings');
                                    }}
                                  >
                                    Book Turf
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-secondary)' }}>
                            <Info size={36} style={{ margin: '0 auto 1rem', opacity: 0.4, color: 'var(--accent-mint)' }} />
                            <h4 style={{ fontWeight: 700, color: 'var(--text-primary)' }}>No matching facilities found</h4>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Try adjusting your filters in the sidebar to view other facilities.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* STEP 2: Timings & Dates Selection */}
                    {bookingStep === 'timings' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Selected Facility Summary Banner */}
                        <div className="selected-facility-summary">
                          <div className="summary-details">
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent-mint)', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selected Turf</span>
                            <h4>{activeResourceDetails?.name}</h4>
                            <p>{activeResourceDetails?.description}</p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Hourly Rate</span>
                              <strong style={{ fontSize: '1.15rem', color: 'var(--accent-mint)' }}>${hourlyPrice.toFixed(2)}/hr</strong>
                            </div>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                              onClick={() => setBookingStep('facility')}
                            >
                              Change Turf
                            </button>
                          </div>
                        </div>

                        <div className="timings-selection-layout">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Date scroll card */}
                            <div className="card">
                              <div className="date-selector-container" style={{ marginBottom: 0 }}>
                                <div className="section-label">
                                  <CalendarDays size={16} color="var(--accent-mint)" />
                                  <span>Select Date</span>
                                </div>
                                <div className="date-scroll">
                                  {daysOfWeek.map((day) => (
                                    <button
                                      key={day.dateStr}
                                      className={`date-card ${activeDate === day.dateStr ? 'active' : ''}`}
                                      onClick={() => {
                                        setActiveDate(day.dateStr);
                                        setSelectedSlots([]);
                                      }}
                                    >
                                      <div className="date-day">{day.dayName}</div>
                                      <div className="date-num">{day.dayNum}</div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Slot grid card */}
                            <div className="card">
                              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <Clock size={20} color="var(--accent-mint)" />
                                  <span>Available Booking Hours</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  Selected Date: <strong style={{ color: 'var(--text-primary)' }}>{activeDate}</strong>
                                </div>
                              </div>

                              <div className="slot-grid">
                                {timeSlots.map((slot) => {
                                  const isOccupied = bookings.some(b => b.slot_time === slot && b.status !== 'Cancelled');
                                  const isSelected = selectedSlots.includes(slot);

                                  let slotStateClass = 'unoccupied';
                                  let slotStateText = 'Available';

                                  if (isOccupied) {
                                    slotStateClass = 'occupied';
                                    slotStateText = 'Booked';
                                  } else if (isSelected) {
                                    slotStateClass = 'selected';
                                    slotStateText = 'Selected';
                                  }

                                  return (
                                    <div
                                      key={slot}
                                      className={`slot-item ${slotStateClass}`}
                                      onClick={() => handleSlotClick(slot)}
                                    >
                                      <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{slot}</span>
                                      <span className="slot-status-label">{slotStateText}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {timeSlots.length === 0 && (
                                <p style={{ color: 'var(--state-danger)', fontSize: '0.85rem', marginTop: '1rem' }}>
                                  No slots are available with the current admin schedule settings.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Timings summary checkout preview sidebar */}
                          <div className="card" style={{ height: 'fit-content' }}>
                            {selectedSlots.length === 0 ? (
                              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
                                <Calendar size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.3, color: 'var(--accent-mint)' }} />
                                <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>No time slots selected.</p>
                                <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--text-muted)' }}>Select dates and active hours on the schedule.</p>
                              </div>
                            ) : (
                              <div className="checkout-panel">
                                <h3 className="card-title" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontSize: '1.05rem' }}>
                                  Selected Booking Slots
                                </h3>

                                <div className="selected-slots-list" style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                                  {selectedSlots.sort().map((slot) => (
                                    <div key={slot} className="selected-slot-pill" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', backgroundColor: '#FCFAF6', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                      <div style={{ fontSize: '0.85rem' }}>
                                        <span style={{ color: 'var(--text-secondary)', marginRight: '0.5rem' }}>{activeDate}</span>
                                        <strong style={{ color: 'var(--accent-mint)' }}>{slot}</strong>
                                      </div>
                                      <button className="pill-remove" style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => handleSlotClick(slot)}>
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ))}
                                </div>

                                {/* Promo code wrapper */}
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Promo Code</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="WELCOME10"
                                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', textTransform: 'uppercase' }}
                                    value={promoCodeInput}
                                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                                  />
                                  {isPromoApplied && (
                                    <small style={{ color: 'var(--state-success)', fontSize: '0.7rem', marginTop: '0.15rem', display: 'block', fontWeight: 700 }}>
                                      Promo Applied! {activeSettings.promoDiscountPercent}% off.
                                    </small>
                                  )}
                                </div>

                                {/* Pricing breakdown */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Hourly Rate</span>
                                    <span>${hourlyPrice.toFixed(2)} / hr</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Subtotal ({selectedSlots.length} hrs)</span>
                                    <span>${subtotal.toFixed(2)}</span>
                                  </div>
                                  {currentDiscountPercent > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--state-warning)' }}>
                                      <span>Discount ({currentDiscountPercent}%)</span>
                                      <span>-${discountAmount.toFixed(2)}</span>
                                    </div>
                                  )}
                                  <div className="checkout-summary-row" style={{ border: 'none', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '0.5rem' }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total Amount</span>
                                    <strong style={{ color: 'var(--accent-mint)', fontSize: '1.05rem' }}>${totalAmount.toFixed(2)}</strong>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                    onClick={() => setBookingStep('facility')}
                                  >
                                    Back
                                  </button>
                                  <button
                                    className="btn btn-primary"
                                    style={{ flex: 2 }}
                                    onClick={() => {
                                      setCardHolder(guestName.toUpperCase());
                                      setBookingStep('payment');
                                    }}
                                  >
                                    <span>Confirm & Pay</span>
                                    <ArrowRight size={16} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STEP 3: Details & Payment Confirmation */}
                    {bookingStep === 'payment' && (
                      <div className="timings-selection-layout">
                        {/* Guest details form on the left/main card */}
                        <div className="card">
                          <h3 className="card-title" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontSize: '1.15rem' }}>
                            Guest Contact Details
                          </h3>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '-0.25rem 0 1.25rem' }}>
                            Simply enter your name and phone number to finalize your booking slot. No password required.
                          </p>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="form-group">
                              <label className="form-label">Full Name</label>
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Enter your name"
                                value={guestName}
                                onChange={(e) => {
                                  setGuestName(e.target.value);
                                  setCardHolder(e.target.value.toUpperCase());
                                }}
                              />
                              {guestErrors.name && (
                                <span className="form-error"><AlertCircle size={12} /> {guestErrors.name}</span>
                              )}
                            </div>

                            <div className="form-group">
                              <label className="form-label">Phone Number</label>
                              <div className="phone-input-wrapper" style={{ display: 'flex', gap: '0.5rem' }}>
                                <select
                                  className="phone-select form-control"
                                  value={guestPhoneCode}
                                  onChange={(e) => setGuestPhoneCode(e.target.value)}
                                  style={{ flex: '0 0 110px' }}
                                >
                                  {PHONE_CODES.map((item) => (
                                    <option key={item.code} value={item.code}>
                                      {item.code} ({item.country})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="tel"
                                  className="form-control"
                                  placeholder="e.g. 9876543210"
                                  value={guestPhone}
                                  onChange={(e) => setGuestPhone(e.target.value)}
                                />
                              </div>
                              {guestErrors.phone && (
                                <span className="form-error"><AlertCircle size={12} /> {guestErrors.phone}</span>
                              )}
                            </div>
                          </div>

                          {/* PAYMENT SELECTION MAPPED HERE */}
                          <div style={{ marginTop: '1.75rem' }}>
                            <h4 style={{ fontSize: '1rem', fontWeight: 750, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Select Payment Method</h4>
                            <div className="payment-tab-group" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                              <button
                                className={`payment-tab btn ${paymentType === 'card' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', borderRadius: '8px' }}
                                onClick={() => setPaymentType('card')}
                              >
                                Credit Card
                              </button>
                              <button
                                className={`payment-tab btn ${paymentType === 'wallet' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', borderRadius: '8px' }}
                                onClick={() => setPaymentType('wallet')}
                              >
                                Mobile Pay
                              </button>
                              <button
                                className={`payment-tab btn ${paymentType === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', borderRadius: '8px' }}
                                onClick={() => setPaymentType('cash')}
                              >
                                Venue Cash
                              </button>
                            </div>

                            {paymentType === 'card' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Virtual Card Graphic */}
                                <div className="virtual-card" style={{ background: 'linear-gradient(135deg, var(--accent-mint) 0%, #2E7D32 100%)', color: '#FFFFFF', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 4px 15px var(--accent-mint-glow)', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', overflow: 'hidden', height: '160px', width: '100%', maxWidth: '320px', margin: '0 auto 1.5rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="virtual-card-chip" style={{ width: '36px', height: '26px', backgroundColor: '#EAE6DC', borderRadius: '4px' }}></div>
                                    <CreditCard size={24} style={{ opacity: 0.8 }} />
                                  </div>
                                  <div className="virtual-card-number" style={{ fontSize: '1.25rem', letterSpacing: '0.15em', fontWeight: 700, fontFamily: 'monospace', textAlign: 'center' }}>
                                    {cardNumber || '•••• •••• •••• ••••'}
                                  </div>
                                  <div className="virtual-card-details" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                    <div>
                                      <div style={{ fontSize: '0.55rem', opacity: 0.6, textTransform: 'uppercase' }}>Cardholder</div>
                                      <div className="virtual-card-holder" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{cardHolder || 'GUEST CUSTOMER'}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: '0.55rem', opacity: 0.6, textTransform: 'uppercase' }}>Expires</div>
                                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{cardExpiry || 'MM/YY'}</div>
                                    </div>
                                  </div>
                                </div>

                                {/* Inputs */}
                                <div className="form-group">
                                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Cardholder Name</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="GUEST CUSTOMER"
                                    value={cardHolder}
                                    onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                                  />
                                  {paymentErrors.cardHolder && (
                                    <span className="form-error"><AlertCircle size={10} /> {paymentErrors.cardHolder}</span>
                                  )}
                                </div>

                                <div className="form-group">
                                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Card Number</label>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="4111 2222 3333 4444"
                                    value={cardNumber}
                                    onChange={(e) => handleCardNumberChange(e.target.value)}
                                  />
                                  {paymentErrors.cardNumber && (
                                    <span className="form-error"><AlertCircle size={10} /> {paymentErrors.cardNumber}</span>
                                  )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                  <div className="form-group">
                                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Expiry Date</label>
                                    <input
                                      type="text"
                                      className="form-control"
                                      placeholder="MM/YY"
                                      value={cardExpiry}
                                      onChange={(e) => handleExpiryChange(e.target.value)}
                                    />
                                    {paymentErrors.cardExpiry && (
                                      <span className="form-error"><AlertCircle size={10} /> {paymentErrors.cardExpiry}</span>
                                    )}
                                  </div>
                                  <div className="form-group">
                                    <label className="form-label" style={{ fontSize: '0.75rem' }}>CVV</label>
                                    <input
                                      type="password"
                                      className="form-control"
                                      placeholder="123"
                                      maxLength={3}
                                      value={cardCvv}
                                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                                    />
                                    {paymentErrors.cardCvv && (
                                      <span className="form-error"><AlertCircle size={10} /> {paymentErrors.cardCvv}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {paymentType === 'wallet' && (
                              <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: '#FCFAF6', border: '1px solid var(--border-color)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                                <Smartphone size={32} style={{ color: 'var(--accent-mint)' }} />
                                <h5 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Scan QR to Pay</h5>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '280px', margin: '0 auto' }}>
                                  Scan the QR with GPay, PhonePe, Paytm, or Apple Pay. The payment status will be verified instantly upon confirmation.
                                </p>
                                <div style={{ width: 120, height: 120, backgroundColor: 'white', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '0.5rem' }}>
                                  {/* Mock QR grid pattern */}
                                  <div style={{ width: '100%', height: '100%', background: 'repeating-conic-gradient(from 45deg, #000 0% 25%, #fff 0% 50%) 50% / 12px 12px' }}></div>
                                </div>
                              </div>
                            )}

                            {paymentType === 'cash' && (
                              <div style={{ padding: '1.25rem', backgroundColor: '#FCFAF6', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold)', fontWeight: 700 }}>
                                  <Info size={18} />
                                  <span>Pay at Reception Desk</span>
                                </div>
                                <p style={{ lineHeight: 1.4 }}>
                                  Your slot reservation will be held in <strong>Pending</strong> status. Please complete the cash or card payment at the arena main reception at least 10 minutes prior to your scheduled play session.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Statement summary ticket & Confirmation on the right */}
                        <div className="card" style={{ height: 'fit-content' }}>
                          <h3 className="card-title" style={{ fontSize: '1.05rem', margin: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                            Booking Verification
                          </h3>

                          {/* PENDING TICKET STATEMENT */}
                          <div className="booking-statement-ticket" style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 750, color: 'var(--accent-mint)', letterSpacing: '0.06em' }}>
                              <span>SLOTS STATEMENT</span>
                              <span style={{ color: 'var(--accent-gold)' }}>PENDING</span>
                            </div>
                            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem', marginBottom: '0.4rem' }}>
                              {activeResourceDetails?.name}
                            </h4>

                            <div className="perforated-line" style={{ margin: '0.5rem 0', borderTop: '1px dashed var(--border-color)' }}></div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Guest Customer:</span>
                                <strong style={{ color: 'var(--text-primary)' }}>{guestName || 'Not Entered'}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Date:</span>
                                <strong style={{ color: 'var(--text-primary)' }}>{activeDate}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Hours:</span>
                                <strong style={{ color: 'var(--text-primary)' }}>{selectedSlots.join(', ')}</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Amount Due:</span>
                                <strong style={{ color: 'var(--accent-mint)' }}>${totalAmount.toFixed(2)}</strong>
                              </div>
                            </div>
                          </div>

                          {errorMessage && (
                            <div style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#C62828',
                              padding: '0.75rem',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              display: 'flex',
                              gap: '0.5rem',
                              marginBottom: '1.25rem'
                            }}>
                              <AlertCircle size={16} style={{ flexShrink: 0 }} />
                              <span>{errorMessage}</span>
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button
                              className="btn btn-primary"
                              style={{ width: '100%', padding: '0.7rem' }}
                              disabled={isSubmitting}
                              onClick={async () => {
                                if (validateGuestDetails()) {
                                  await handleConfirmBooking();
                                }
                              }}
                            >
                              {isSubmitting ? 'Processing booking...' : 'Pay & Confirm Booking'}
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ width: '100%', padding: '0.7rem' }}
                              disabled={isSubmitting}
                              onClick={() => setBookingStep('timings')}
                            >
                              Back to Timings
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          )}
        </main>

        {/* Global Footer (only in Customer view) */}
        {!isAdminRoute && (
          <footer className="footer">
            <div className="footer-content">
              <div className="footer-brand">
                <div className="footer-brand-title">GreenPlay Turf Arena</div>
                <div className="footer-brand-desc">
                  Next-generation athletic turf booking app. High performance artificial grass fields, AC championship halls, and clay courts at your convenience.
                </div>
              </div>

              <div className="footer-links-col">
                <div className="footer-links-title">Support</div>
                <a href="#rules" className="footer-link">Facility Rules</a>
                <a href="#rates" className="footer-link">Booking Rates</a>
                <a href="#help" className="footer-link">Help Center</a>
              </div>

              <div className="footer-links-col">
                <div className="footer-links-title">Legal</div>
                <a href="#terms" className="footer-link">Terms of Service</a>
                <a href="#privacy" className="footer-link">Privacy Policy</a>
              </div>
            </div>

            <div className="footer-bottom">
              <div>© {new Date().getFullYear()} GreenPlay Arena. All rights reserved.</div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Shield size={12} /> Secure 256-bit Checkout
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <FileText size={12} /> GDPR Compliant
                </span>
              </div>
            </div>
          </footer>
        )}
      </div>

      {/* Detailed Modal Popup for Turf facilities, ratings and reviews */}
      {isDetailsModalOpen && selectedDetailsResource && (
        <div className="modal-overlay" id="details-modal">
          <div className="modal-content" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="modal-close" onClick={() => setIsDetailsModalOpen(false)} aria-label="Close modal">
              <X size={20} />
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-mint)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {selectedDetailsResource.type}
                </span>
                <h3 className="modal-title" style={{ marginTop: '0.2rem' }}>{selectedDetailsResource.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Managed by: <strong>{FACILITY_EXTRAS[selectedDetailsResource.id]?.clubName || 'Apex Arena Group'}</strong>
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  backgroundColor: 'rgba(184, 134, 11, 0.08)',
                  color: 'var(--accent-gold)'
                }}>
                  ★ {FACILITY_EXTRAS[selectedDetailsResource.id]?.rating || '4.5'}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  ({FACILITY_EXTRAS[selectedDetailsResource.id]?.reviewsCount || '100'} reviews)
                </span>
              </div>
            </div>

            <div className="perforated-line" style={{ margin: '1rem 0' }}></div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Description
                </span>
                <p style={{ marginTop: '0.25rem', lineHeight: '1.5' }}>{selectedDetailsResource.description}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Address
                  </span>
                  <strong style={{ display: 'block', marginTop: '0.15rem', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    {FACILITY_EXTRAS[selectedDetailsResource.id]?.address || '123 Stadium Way, Arena District'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Opening Hours
                  </span>
                  <strong style={{ display: 'block', marginTop: '0.15rem', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    {FACILITY_EXTRAS[selectedDetailsResource.id]?.openingHours || '08:00 AM - 10:00 PM'}
                  </strong>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Core Facilities & Amenities
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
                  {(FACILITY_EXTRAS[selectedDetailsResource.id]?.facilities || ['Locker Room', 'Water Station', 'First Aid']).map((f) => (
                    <span key={f} style={{
                      padding: '0.25rem 0.6rem',
                      borderRadius: '50px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      border: '1px solid var(--border-color)',
                      backgroundColor: '#FCFAF6',
                      color: 'var(--accent-mint)'
                    }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                  Recent Customer Reviews
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {(FACILITY_EXTRAS[selectedDetailsResource.id]?.reviews || [
                    { reviewer: "Anonymous Guest", rating: 5, comment: "Excellent facility and clean environment.", date: "2026-06-01" }
                  ]).map((rev, index) => (
                    <div key={index} style={{ borderBottom: '1px solid rgba(0,0,0,0.02)', paddingBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700 }}>
                        <span style={{ color: 'var(--text-primary)' }}>{rev.reviewer}</span>
                        <span style={{ color: 'var(--accent-gold)' }}>{'★'.repeat(rev.rating)}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '0.15rem' }}>
                        "{rev.comment}"
                      </p>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textAlign: 'right' }}>
                        {rev.date}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsDetailsModalOpen(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1.5 }}
                onClick={() => {
                  setIsDetailsModalOpen(false);
                  setActiveResource(selectedDetailsResource.id);
                  setSelectedSlots([]);
                  setBookingStep('timings');
                  setBookingSuccess(null);
                }}
              >
                Book Turf Now
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <button className="modal-close" onClick={() => setIsSettingsOpen(false)}>
              <X size={20} />
            </button>
            <h3 className="modal-title">App Settings</h3>
            <p className="modal-subtitle">Customize your GreenPlay booking experience.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
              {/* Theme Settings */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Theme Preference</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {darkTheme ? 'Dark Mode' : 'Light Mode'}
                  </span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className={`btn ${!darkTheme ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
                    onClick={() => setDarkTheme(false)}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    className={`btn ${darkTheme ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem' }}
                    onClick={() => setDarkTheme(true)}
                  >
                    Dark
                  </button>
                </div>
              </div>

              {/* Prefill Profile Settings */}
              <div>
                <span className="section-label" style={{ fontSize: '0.75rem', marginBottom: '0.5rem', display: 'block' }}>Default Booking Profile</span>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="E.g. Jane Doe"
                    value={guestName}
                    onChange={(e) => {
                      setGuestName(e.target.value);
                      const currentProfile = JSON.parse(localStorage.getItem('user_profile') || '{}');
                      localStorage.setItem('user_profile', JSON.stringify({
                        ...currentProfile,
                        name: e.target.value,
                        role: 'User'
                      }));
                    }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Phone Number</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      className="form-control"
                      value={guestPhoneCode}
                      onChange={(e) => {
                        setGuestPhoneCode(e.target.value);
                        const currentProfile = JSON.parse(localStorage.getItem('user_profile') || '{}');
                        localStorage.setItem('user_profile', JSON.stringify({
                          ...currentProfile,
                          phoneCode: e.target.value
                        }));
                      }}
                      style={{ flex: '0 0 90px', padding: '0.5rem' }}
                    >
                      {PHONE_CODES.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="9876543210"
                      value={guestPhone}
                      onChange={(e) => {
                        setGuestPhone(e.target.value);
                        const currentProfile = JSON.parse(localStorage.getItem('user_profile') || '{}');
                        localStorage.setItem('user_profile', JSON.stringify({
                          ...currentProfile,
                          phone: e.target.value
                        }));
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '2rem', padding: '0.65rem' }}
              onClick={() => setIsSettingsOpen(false)}
            >
              Save Preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
