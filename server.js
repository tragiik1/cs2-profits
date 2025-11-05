import express from 'express';
import session from 'express-session';
import passport from 'passport';
import SteamStrategy from 'passport-steam';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const STEAM_API_KEY = process.env.STEAM_API_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production';

// Steam OpenID realm and return URL
// For production, set STEAM_REALM and STEAM_RETURN_URL to your deployed URL
const realm = process.env.STEAM_REALM || `http://localhost:${PORT}`;
const returnURL = process.env.STEAM_RETURN_URL || `${realm}/auth/steam/return`;

// Log configuration on startup for debugging
console.log('Steam Configuration:');
console.log(`  Realm: ${realm}`);
console.log(`  Return URL: ${returnURL}`);

// Configure session
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// CORS configuration - allow requests from any origin in production
const allowedOrigins = process.env.FRONTEND_URL 
  ? [process.env.FRONTEND_URL] 
  : (process.env.NODE_ENV === 'production' ? true : 'http://localhost:3000');

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(bodyParser.json());
app.use(express.static(__dirname));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// User data storage (in production, use a proper database)
const USERS_FILE = join(__dirname, 'users.json');

function readUsers() {
  if (!existsSync(USERS_FILE)) {
    writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
    return {};
  }
  try {
    const data = readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

function writeUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getUserBySteamId(steamId) {
  const users = readUsers();
  return users[steamId] || null;
}

function saveUser(steamId, userData) {
  const users = readUsers();
  users[steamId] = {
    ...userData,
    steamId,
    updatedAt: new Date().toISOString()
  };
  writeUsers(users);
  return users[steamId];
}

// Configure Steam Strategy
passport.use(new SteamStrategy({
  returnURL: returnURL,
  realm: realm,
  apiKey: STEAM_API_KEY
}, async (identifier, profile, done) => {
  try {
    // Extract Steam ID from identifier
    const steamId = identifier.split('/').pop();
    
    // Get user info from Steam API
    let user = getUserBySteamId(steamId);
    
    if (!user) {
      // Create new user
      user = {
        steamId,
        username: profile.displayName || profile.username || `User_${steamId}`,
        avatar: profile.photos?.[2]?.value || '',
        baseCurrency: 'USD',
        displayCurrency: 'USD',
        rates: { USD: 1, AUD: 1, EUR: 1 },
        transactions: [],
        createdAt: new Date().toISOString()
      };
    } else {
      // Update existing user profile
      user.username = profile.displayName || profile.username || user.username;
      user.avatar = profile.photos?.[2]?.value || user.avatar;
    }
    
    user = saveUser(steamId, user);
    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.steamId);
});

passport.deserializeUser((steamId, done) => {
  const user = getUserBySteamId(steamId);
  done(null, user);
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Auth routes
app.get('/auth/steam', 
  passport.authenticate('steam', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/steam/return',
  passport.authenticate('steam', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    // Don't send sensitive data
    const { transactions, ...safeUser } = req.user;
    res.json({ user: safeUser, authenticated: true });
  } else {
    res.json({ user: null, authenticated: false });
  }
});

// API routes
app.get('/api/user/data', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const user = getUserBySteamId(req.user.steamId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({ user });
});

app.post('/api/user/data', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { userData } = req.body;
  
  const user = getUserBySteamId(req.user.steamId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Update user data (preserve steamId)
  const updatedUser = {
    ...user,
    ...userData,
    steamId: req.user.steamId,
    updatedAt: new Date().toISOString()
  };
  
  saveUser(req.user.steamId, updatedUser);
  res.json({ user: updatedUser, success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Steam authentication configured`);
  if (!STEAM_API_KEY) {
    console.warn('WARNING: STEAM_API_KEY not set. Get one from https://steamcommunity.com/dev/apikey');
  }
});
