// backend/server.js - COMPLETE FIXED VERSION
const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const cors = require("cors");
const mongoose = require("mongoose");
require('dotenv').config();

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI);

mongoose.connection.on('connected', () => console.log('✅ MongoDB Connected'));
mongoose.connection.on('error', (err) => console.error('❌ MongoDB Error:', err));

// User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: String,
  otp: String,
  otpExpires: Date,
  otpVerified: Boolean,
  usageData: [{
    appId: String,
    appName: String,
    minutes: Number,
    timestamp: { type: Date, default: Date.now },
    emergencyAccess: { type: Boolean, default: false }
  }],
  focusSessions: [{
    startTime: Date,
    endTime: Date,
    duration: Number,
    broken: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
  }],
  activeFocusSession: {
    startTime: Date,
    endTime: Date,
    duration: Number,
    broken: Boolean
  },
  emergencyAccess: [{
    appId: String,
    granted: Date,
    expires: Date,
    duration: Number,
    reason: String,
    used: { type: Boolean, default: false }
  }],
  accessRequests: [{
    appId: String,
    appName: String,
    reason: String,
    timestamp: { type: Date, default: Date.now },
    granted: Boolean,
    score: Number,
    categories: [String],
    duration: Number
  }],
  chatHistory: [{
    role: { type: String, enum: ['user', 'assistant'] },
    message: String,
    timestamp: { type: Date, default: Date.now }
  }],
  emergencyAccessCount: { type: Number, default: 0 },
  lastEmergencyAccessDay: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// App Setup
const app = express();
const PORT = 3001;

app.set('trust proxy', 1);

// CORS - Allow credentials
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.includes('localhost')) return callback(null, true);
    callback(null, true);
  },
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Session Configuration
app.use(session({ 
  secret: process.env.SESSION_SECRET || "your-secret-key-change-this", 
  resave: false, 
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    secure: false,
    sameSite: 'lax',
    httpOnly: true
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport Google Setup
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ email: profile.emails[0].value });
    
    if (!user) {
      user = new User({
        username: profile.displayName,
        email: profile.emails[0].value,
        password: null,
        usageData: [],
        focusSessions: [],
        emergencyAccess: [],
        accessRequests: [],
        chatHistory: []
      });
      await user.save();
      console.log('New Google user created:', user.email);
    }
    
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Authentication Middleware - Fixed to check userId consistently
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
    } else {
      res.redirect('/index.html');
    }
  }
};

// App Configuration
const APP_LIMITS = {
  instagram: { dailyLimit: 30, name: 'Instagram' },
  tiktok: { dailyLimit: 20, name: 'TikTok' },
  facebook: { dailyLimit: 45, name: 'Facebook' },
  twitter: { dailyLimit: 30, name: 'Twitter' },
  youtube: { dailyLimit: 2, name: 'YouTube' },
  netflix: { dailyLimit: 120, name: 'Netflix' },
  reddit: { dailyLimit: 45, name: 'Reddit' }
};

// Utility Functions
function getTodayUsage(usageData, appId = null) {
  const today = new Date().toISOString().split('T')[0];
  const todayUsage = usageData.filter(u => {
    const entryDate = new Date(u.timestamp).toISOString().split('T')[0];
    return entryDate === today;
  });
  
  if (appId) {
    return todayUsage
      .filter(u => u.appId === appId)
      .reduce((sum, u) => sum + u.minutes, 0);
  }
  
  return todayUsage;
}

function hasActiveEmergencyAccess(emergencyAccess, appId) {
  const access = emergencyAccess.find(a => a.appId === appId && !a.used);
  if (!access) return false;
  
  const now = Date.now();
  if (now > new Date(access.expires).getTime()) {
    return false;
  }
  
  return true;
}

function evaluateEmergencyRequest(reason, appId) {
  const keywords = {
    work: ['work', 'job', 'meeting', 'boss', 'colleague', 'client', 'project'],
    emergency: ['emergency', 'urgent', 'important', 'critical', 'asap'],
    family: ['family', 'mom', 'dad', 'parent', 'child', 'relative'],
    health: ['health', 'medical', 'doctor', 'hospital', 'sick'],
    education: ['school', 'homework', 'assignment', 'deadline', 'class', 'study', 'learning', 'education', 'research']  // ADD THIS LINE
  };
  
  const reasonLower = reason.toLowerCase();
  let score = 0;
  let categories = [];
  
  for (let [category, words] of Object.entries(keywords)) {
    if (words.some(word => reasonLower.includes(word))) {
      score += 10;
      categories.push(category);
    }
  }
  
  if (reason.length > 50) score += 5;
  if (reasonLower.includes('need to')) score += 3;
  
  if (score >= 13) {
    return {
      granted: true,
      duration: 15,
      score,
      categories,
      message: `Access approved! Categories: ${categories.join(', ')}`
    };
  } else {
    return {
      granted: false,
      score,
      message: `Request denied. Not enough justification. (Score: ${score}/13)`
    };
  }
}

function generateChatbotResponse(message, userData) {
  const messageLower = message.toLowerCase();
  const todayUsage = getTodayUsage(userData.usageData);
  const dailyTotal = todayUsage.reduce((sum, u) => sum + u.minutes, 0);
  
  if (messageLower.match(/^(hi|hello|hey|greetings)/)) {
    return `Hello! I'm your Digital Detox Assistant. I can help you track your screen time, set goals, and stay focused. How can I help you today?`;
  }
  
  if (messageLower.includes('screen time') || messageLower.includes('usage today')) {
    if (dailyTotal === 0) {
      return `You haven't logged any screen time today. Great job staying offline!`;
    }
    return `You've spent ${dailyTotal} minutes on apps today. ${dailyTotal > 120 ? 'That\'s quite a lot! Consider taking a break.' : 'You\'re doing well managing your time!'}`;
  }
  
  if (messageLower.includes('most used') || messageLower.includes('which app')) {
    const usageMap = {};
    todayUsage.forEach(u => {
      usageMap[u.appName] = (usageMap[u.appName] || 0) + u.minutes;
    });
    const mostUsed = Object.entries(usageMap).sort((a, b) => b[1] - a[1])[0];
    if (!mostUsed) {
      return `You haven't used any apps today!`;
    }
    return `Your most used app today is ${mostUsed[0]} with ${mostUsed[1]} minutes of screen time.`;
  }
  
  if (messageLower.includes('tip') || messageLower.includes('advice') || messageLower.includes('help me')) {
    const tips = [
      'Try the Pomodoro Technique: 25 minutes of focused work, then a 5-minute break.',
      'Set specific times for checking social media instead of browsing randomly.',
      'Use the Focus Mode feature to block distracting apps during work hours.',
      'Keep your phone in another room while working or studying.',
      'Replace scrolling time with a hobby like reading, exercise, or meditation.'
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }
  
  return `I'm here to help you manage your digital wellness. You can ask me about your screen time, get tips for staying focused, or request motivation. What would you like to know?`;
}

// ============== AUTH ROUTES ==============

app.get("/", (req, res) => {
  if (req.session.userId) return res.redirect("/dashboard.html");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/dashboard.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback", 
  passport.authenticate("google", { failureRedirect: "/index.html" }),
  (req, res) => { 
    req.session.userId = req.user._id;
    req.session.user = { username: req.user.username, email: req.user.email };
    res.redirect("/dashboard.html"); 
  }
);

app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.json({ success: false, message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      usageData: [],
      focusSessions: [],
      emergencyAccess: [],
      accessRequests: [],
      chatHistory: []
    });

    await newUser.save();
    
    req.session.userId = newUser._id;
    req.session.user = { username, email };
    
    console.log('New user registered:', email);
    res.json({ 
      success: true, 
      redirect: "/dashboard.html",
      userId: newUser._id.toString(),
      email: email
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.json({ success: false, message: "Registration failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', email);
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }
    
    if (!user.password) {
      return res.json({ success: false, message: "Use Google Sign-In" });
    }
    
    const match = bcrypt.compareSync(password, user.password);
    
    if (!match) {
      return res.json({ success: false, message: "Wrong password" });
    }

    const today = new Date().toISOString().split('T')[0];
    if (!user.lastEmergencyAccessDay || user.lastEmergencyAccessDay !== today) {
      user.emergencyAccessCount = 0;
      user.lastEmergencyAccessDay = today;
      user.emergencyAccess = user.emergencyAccess.filter(a => 
        new Date(a.granted).toISOString().split('T')[0] === today && !a.used
      );
      await user.save();
    }

    req.session.userId = user._id;
    req.session.user = { username: user.username, email: user.email };
    console.log('Login successful for:', email, '- userId:', user._id);

    res.json({ 
      success: true, 
      redirect: "/dashboard.html",
      userId: user._id.toString(),
      email: user.email
    });
  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, message: "Login failed" });
  }
});

// Email Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post("/forgot", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.json({ success: false, message: "Email not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      html: `
        <h2>Password Reset Request</h2>
        <p>Your OTP for password reset is:</p>
        <h1 style="color: #4CAF50; font-size: 32px;">${otp}</h1>
        <p>This OTP will expire in 10 minutes.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}`);
    res.json({ success: true, message: `OTP sent to ${email}` });
  } catch (error) {
    console.error("Email sending failed:", error);
    res.json({ success: false, message: "Failed to send email" });
  }
});

app.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    
    if (!user || !user.otp) {
      return res.json({ success: false, message: "Invalid request" });
    }
    
    if (user.otp != otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }
    
    if (Date.now() > user.otpExpires) {
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();
      return res.json({ success: false, message: "OTP expired" });
    }

    user.otpVerified = true;
    await user.save();
    res.json({ success: true, message: "OTP verified" });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.json({ success: false, message: "Verification failed" });
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user || !user.otpVerified) {
      return res.json({ success: false, message: "Please verify OTP first" });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    user.password = hashedPassword;
    user.otp = undefined;
    user.otpExpires = undefined;
    user.otpVerified = undefined;
    await user.save();

    console.log(`Password reset for ${email}`);
    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Password reset error:", error);
    res.json({ success: false, message: "Reset failed" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/index.html");
  });
});

// ============== DASHBOARD API ROUTES ==============

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ 
      authenticated: true, 
      user: req.session.user,
      userId: req.session.userId.toString()
    });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const todayUsage = getTodayUsage(user.usageData);
    const dailyTotal = todayUsage.reduce((sum, u) => sum + u.minutes, 0);
    
    const usageMap = {};
    todayUsage.forEach(u => {
      if (!usageMap[u.appId]) {
        usageMap[u.appId] = { minutes: 0, name: u.appName };
      }
      usageMap[u.appId].minutes += u.minutes;
    });
    
    let mostUsed = { app: 'None', minutes: 0 };
    for (let key in usageMap) {
      if (usageMap[key].minutes > mostUsed.minutes) {
        mostUsed = { app: usageMap[key].name, minutes: usageMap[key].minutes };
      }
    }
    
    const focusTime = user.focusSessions
      .filter(s => !s.broken)
      .reduce((sum, s) => sum + s.duration, 0);
    
    const rankings = Object.entries(usageMap).map(([appId, app]) => {
      const limit = APP_LIMITS[appId]?.dailyLimit || 60;
      const score = (app.minutes / limit) * 100;
      
      let level = 'Low';
      if (score > 150) level = 'Critical';
      else if (score > 100) level = 'High';
      else if (score > 50) level = 'Medium';
      
      return {
        appId: appId,
        name: app.name,
        minutes: app.minutes,
        sessions: todayUsage.filter(u => u.appId === appId).length,
        score: Math.round(score),
        level,
        percentage: Math.min(100, Math.round((app.minutes / limit) * 100))
      };
    }).sort((a, b) => b.score - a.score);
    
    console.log(`[${user.email}] Stats fetched - Total: ${dailyTotal}min`);
    
    res.json({ 
      success: true, 
      data: {
        dailyTotal,
        mostUsed,
        detoxStreak: 0,
        focusTime,
        addictionRanking: rankings,
        recentActivity: todayUsage.slice(-10).reverse(),
        activeFocusSession: user.activeFocusSession && 
          new Date(user.activeFocusSession.endTime) > new Date() ? {
          remaining: Math.ceil((new Date(user.activeFocusSession.endTime) - Date.now()) / 60000),
          duration: user.activeFocusSession.duration
        } : null
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/log-usage', requireAuth, async (req, res) => {
  try {
    const { app, minutes } = req.body;
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!app || !minutes || minutes <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }
    
    const appId = app.toLowerCase();
    const appName = APP_LIMITS[appId]?.name || app;
    
    const entry = {
      appId,
      appName,
      minutes: parseInt(minutes),
      timestamp: new Date(),
      emergencyAccess: false
    };
    
    user.usageData.push(entry);
    await user.save();
    
    console.log(`[${user.email}] Logged: ${appName} - ${minutes}min`);
    
    res.json({ success: true, message: `Logged ${minutes} minutes on ${appName}` });
  } catch (error) {
    console.error('Log usage error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/focus-mode', requireAuth, async (req, res) => {
  try {
    const { duration } = req.body;
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!duration || duration <= 0 || duration > 120) {
      return res.status(400).json({ success: false, error: 'Invalid duration (1-120 minutes)' });
    }
    
    const endTime = new Date(Date.now() + duration * 60 * 1000);
    user.activeFocusSession = {
      startTime: new Date(),
      endTime,
      duration: parseInt(duration),
      broken: false
    };
    
    await user.save();
    console.log(`[${user.email}] Focus mode started: ${duration}min`);
    res.json({ success: true, message: `Focus mode started for ${duration} minutes` });
  } catch (error) {
    console.error('Focus mode error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/emergency-access', requireAuth, async (req, res) => {
  try {
    const { app, reason } = req.body;
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!app || !reason || reason.length < 20) {
      return res.status(400).json({ 
        success: false, 
        error: 'App and detailed reason (min 20 characters) required' 
      });
    }
    
    const appId = app.toLowerCase();
    const evaluation = evaluateEmergencyRequest(reason, appId);
    
    const request = {
      appId,
      appName: APP_LIMITS[appId]?.name || app,
      reason,
      timestamp: new Date(),
      granted: evaluation.granted,
      score: evaluation.score,
      categories: evaluation.categories || [],
      duration: evaluation.duration || 0
    };
    
    user.accessRequests.push(request);
    
    if (evaluation.granted) {
      const expires = new Date(Date.now() + evaluation.duration * 60 * 1000);
      user.emergencyAccess.push({
        appId,
        granted: new Date(),
        expires,
        duration: evaluation.duration,
        reason,
        used: false
      });
      
      await user.save();
      
      console.log(`[${user.email}] Emergency access GRANTED for ${appId}: ${evaluation.duration}min`);
      
      res.json({
        success: true,
        approved: true,
        duration: evaluation.duration,
        message: evaluation.message,
        expiresAt: expires.toISOString()
      });
    } else {
      await user.save();
      
      console.log(`[${user.email}] Emergency access DENIED for ${appId}`);
      
      res.json({
        success: true,
        approved: false,
        message: evaluation.message
      });
    }
  } catch (error) {
    console.error('Emergency access error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!message || message.trim() === '') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    
    user.chatHistory.push({
      role: 'user',
      message: message.trim(),
      timestamp: new Date()
    });
    
    const botResponse = generateChatbotResponse(message, user);
    
    user.chatHistory.push({
      role: 'assistant',
      message: botResponse,
      timestamp: new Date()
    });
    
    await user.save();
    
    res.json({ 
      success: true, 
      reply: botResponse
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== CHROME EXTENSION API ROUTES ==============

app.get('/api/extension/config', async (req, res) => {
  try {
    // Support both session auth and userId query param
    let userId = req.session?.userId || req.query.userId;
    
    if (!userId) {
      console.log('Extension config: No userId provided');
      return res.status(401).json({ 
        success: false, 
        message: 'User ID required' 
      });
    }

    console.log('Extension config request for userId:', userId);

    const user = await User.findById(userId);
    
    if (!user) {
      console.log('Extension config: User not found:', userId);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const formattedLimits = {};
    Object.entries(APP_LIMITS).forEach(([appId, config]) => {
      formattedLimits[appId] = {
        dailyLimit: config.dailyLimit
      };
    });

    console.log(`[${user.email}] Extension config sent`);

    res.json({
      success: true,
      limits: formattedLimits
    });
  } catch (error) {
    console.error('Extension config error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.post('/api/track-time-extension', async (req, res) => {
  try {
    const { userId, usage } = req.body;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User ID required' 
      });
    }
    
    if (!usage || typeof usage !== 'object') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid usage data' 
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    // Update usage for each app
    for (const [appId, totalSeconds] of Object.entries(usage)) {
      if (totalSeconds > 0) {
        const minutes = Math.floor(totalSeconds / 60);
        
        if (minutes > 0) {
          // Find existing entry for today
          const existingEntryIndex = user.usageData.findIndex(entry => {
            const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
            return entry.appId === appId && entryDate === today;
          });
          
          const hasEmergency = hasActiveEmergencyAccess(user.emergencyAccess, appId);
          
          if (existingEntryIndex >= 0) {
            // Update existing entry
            user.usageData[existingEntryIndex].minutes = minutes;
            user.usageData[existingEntryIndex].timestamp = new Date();
          } else {
            // Create new entry for today
            user.usageData.push({
              appId,
              appName: APP_LIMITS[appId]?.name || appId,
              minutes: minutes,
              timestamp: new Date(),
              emergencyAccess: hasEmergency
            });
          }
        }
      }
    }
    
    await user.save();
    
    console.log(`[${user.email}] Extension synced: ${Object.keys(usage).join(', ')}`);
    
    res.json({ 
      success: true, 
      message: 'Time tracked successfully' 
    });
  } catch (error) {
    console.error('Track time extension error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to track time' 
    });
  }
});

app.post('/api/check-blocked', async (req, res) => {
  try {
    const { url, userId } = req.body;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User ID required' 
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    let domain;
    try {
      domain = new URL(url).hostname.replace('www.', '');
    } catch (e) {
      domain = url;
    }

    let appId;
    if (domain.includes('youtube')) appId = 'youtube';
    else if (domain.includes('instagram')) appId = 'instagram';
    else if (domain.includes('tiktok')) appId = 'tiktok';
    else if (domain.includes('facebook')) appId = 'facebook';
    else if (domain.includes('twitter') || domain.includes('x.com')) appId = 'twitter';
    else if (domain.includes('netflix')) appId = 'netflix';
    else if (domain.includes('reddit')) appId = 'reddit';

    if (!appId || !APP_LIMITS[appId]) {
      return res.json({ 
        success: true, 
        blocked: false,
        reason: 'Not a monitored site'
      });
    }

    const usage = getTodayUsage(user.usageData, appId);
    const limit = APP_LIMITS[appId].dailyLimit;
    const hasEmergency = hasActiveEmergencyAccess(user.emergencyAccess, appId);

    const isBlocked = usage >= limit && !hasEmergency;

    res.json({
      success: true,
      blocked: isBlocked,
      appId: appId,
      usage: usage,
      limit: limit,
      remaining: Math.max(0, limit - usage),
      hasEmergencyAccess: hasEmergency
    });

  } catch (error) {
    console.error('Check blocked error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check block status' 
    });
  }
});

app.get('/api/usage/today', async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User ID required' 
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const todayUsage = getTodayUsage(user.usageData);
    const summary = {};

    Object.keys(APP_LIMITS).forEach(appId => {
      const minutes = getTodayUsage(user.usageData, appId);
      const limit = APP_LIMITS[appId].dailyLimit;
      
      summary[appId] = {
        name: APP_LIMITS[appId].name,
        used: minutes,
        limit: limit,
        remaining: Math.max(0, limit - minutes),
        blocked: minutes >= limit && !hasActiveEmergencyAccess(user.emergencyAccess, appId),
        percentage: Math.round((minutes / limit) * 100)
      };
    });

    res.json({
      success: true,
      summary: summary,
      totalMinutes: todayUsage.reduce((sum, u) => sum + u.minutes, 0)
    });

  } catch (error) {
    console.error('Usage summary error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get usage data' 
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Digital Detox Backend Server         ║
║   MongoDB + User-Specific Data         ║
║   Running at http://localhost:${PORT}   ║
╚════════════════════════════════════════╝

✅ Session-based authentication enabled
✅ Extension API routes loaded
✅ Auto-sync every 2 minutes supported
✅ User-specific data isolation active
  `);
});

console.log('All routes loaded successfully');