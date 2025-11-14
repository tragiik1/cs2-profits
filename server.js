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
    // Identifier format: "https://steamcommunity.com/openid/id/76561198012345678"
    let steamId = identifier.split('/').pop();
    
    // Ensure it's a valid Steam ID64 (17 digits starting with 7656)
    if (!/^7656\d{13}$/.test(steamId)) {
      console.error('Invalid Steam ID format:', steamId);
      return done(new Error('Invalid Steam ID format'), null);
    }
    
    console.log('Authenticated Steam ID:', steamId);
    
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

// Helper function to validate and format Steam ID
function validateSteamId(steamId) {
  if (!steamId) return null;
  
  // Remove any URL parts if present
  let id = steamId.toString().trim();
  if (id.includes('/')) {
    id = id.split('/').pop();
  }
  
  // Steam ID64 should be 17 digits and start with 7656
  if (/^7656\d{13}$/.test(id)) {
    return id;
  }
  
  // If it's a shorter ID, it might need conversion, but for now just return as-is
  // The Steam API should handle it
  return id;
}

// CS2 Inventory endpoint
app.get('/api/inventory', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let steamId = req.user.steamId;
    
    // Validate and format Steam ID
    steamId = validateSteamId(steamId);
    if (!steamId) {
      return res.status(400).json({ 
        error: 'Invalid Steam ID', 
        message: 'Could not extract valid Steam ID from user session.' 
      });
    }
    
    console.log(`Fetching inventory for Steam ID: ${steamId}`);
    
    // CS2 App ID: 730
    // Try context ID 2 first (standard CS2 inventory), then 6 if that fails
    let url = `https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=5000`;
    console.log(`Fetching from: ${url}`);
    
    let response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': `https://steamcommunity.com/profiles/${steamId}/inventory/`,
        'Origin': 'https://steamcommunity.com'
      }
    });
    
    let responseText = await response.text();
    console.log(`Steam API response status: ${response.status}`);
    console.log(`Response text length: ${responseText.length}`);
    console.log(`Response text (raw): ${JSON.stringify(responseText.substring(0, 200))}`);
    
    // If 400 error with context 2, try other context IDs
    const contextIds = [6, 1, 7]; // Try other common context IDs
    let contextIndex = 0;
    
    while (response.status === 400 && contextIndex < contextIds.length) {
      const contextId = contextIds[contextIndex];
      console.log(`Context ID 2 failed, trying context ID ${contextId}...`);
      url = `https://steamcommunity.com/inventory/${steamId}/730/${contextId}?l=english&count=5000`;
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `https://steamcommunity.com/profiles/${steamId}/inventory/`,
          'Origin': 'https://steamcommunity.com'
        }
      });
      responseText = await response.text();
      console.log(`Steam API response status (context ${contextId}): ${response.status}`);
      console.log(`Response text length: ${responseText.length}`);
      console.log(`Response text (raw): ${JSON.stringify(responseText.substring(0, 200))}`);
      
      if (response.ok) {
        console.log(`Success with context ID ${contextId}!`);
        break;
      }
      
      contextIndex++;
    }
    
    // Handle null or empty responses (Steam returns null for empty inventories)
    // Check for literal "null" string or actual null
    const trimmedResponse = responseText.trim();
    if (trimmedResponse === 'null' || trimmedResponse === '' || trimmedResponse === '{}' || trimmedResponse === '[]') {
      console.log('Steam returned null/empty response for all context IDs');
      console.log('This usually means:');
      console.log('1. Inventory is actually empty for CS2');
      console.log('2. Inventory privacy settings are blocking access');
      console.log('3. Items are in a different game (not CS2)');
      console.log(`Check inventory directly: https://steamcommunity.com/profiles/${steamId}/inventory/730/2/`);
      return res.json({ 
        items: [], 
        total: 0, 
        message: 'No CS2 items found in inventory. Steam returned null for all context IDs.',
        help: `Check your inventory: https://steamcommunity.com/profiles/${steamId}/inventory/730/2/`
      });
    }
    
    // If status is 400 but we got some response text, try to parse it anyway
    // Sometimes Steam returns 400 with valid JSON for empty inventories
    if (response.status === 400 && trimmedResponse !== 'null') {
      try {
        const testData = JSON.parse(responseText);
        // If it's valid JSON with empty assets, return empty
        if (testData && (!testData.assets || testData.assets.length === 0)) {
          console.log('Parsed 400 response - empty inventory');
          return res.json({ items: [], total: 0, message: 'No CS2 items found in inventory' });
        }
        // If it has assets, use it!
        if (testData.assets && testData.assets.length > 0) {
          console.log('Found items in 400 response, processing...');
          data = testData;
          response.ok = true; // Override to continue processing
        }
      } catch (e) {
        // Not JSON, continue with error handling below
        console.log('400 response is not valid JSON');
      }
    }
    
    if (!response.ok) {
      // Try to parse error message
      let errorMessage = `Steam API error: ${response.status}`;
      let errorDetails = '';
      
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.error) {
          errorMessage = errorData.error;
        }
        errorDetails = JSON.stringify(errorData);
      } catch (e) {
        // Not JSON, show first 200 chars of response
        errorDetails = responseText.substring(0, 200);
      }
      
      console.error('Steam API error details:', errorDetails);
      
      if (response.status === 400) {
        // Check if it's actually an empty inventory (Steam sometimes returns 400 for empty)
        try {
          const testData = JSON.parse(responseText);
          if (!testData.assets || testData.assets.length === 0) {
            return res.json({ items: [], total: 0, message: 'No CS2 items found in inventory' });
          }
        } catch (e) {
          // If response is "null" as a string, treat as empty
          if (responseText === 'null' || responseText.trim() === '') {
            return res.json({ items: [], total: 0, message: 'No CS2 items found in inventory. Your inventory appears to be empty.' });
          }
        }
        
        return res.status(400).json({ 
          error: 'Bad request to Steam API', 
          message: 'Steam returned a 400 error. This usually means: 1) Your inventory is empty, 2) You don\'t have CS2 items, or 3) Your inventory privacy settings are blocking access.',
          steamId: steamId,
          details: 'Try setting your Steam inventory to public and make sure you have CS2 items. Check your inventory at: https://steamcommunity.com/profiles/' + steamId + '/inventory/'
        });
      }
      if (response.status === 403) {
        return res.status(403).json({ 
          error: 'Inventory is private', 
          message: 'Your Steam inventory privacy settings are set to private. Please set your inventory to public in Steam settings.' 
        });
      }
      if (response.status === 404) {
        return res.status(404).json({ 
          error: 'Inventory not found', 
          message: 'Could not find CS2 inventory. Make sure you have CS2 items in your inventory.' 
        });
      }
      throw new Error(errorMessage);
    }
    
    // Parse the response (only if we haven't already parsed it above)
    let data;
    if (!data) {
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse Steam API response:', responseText.substring(0, 200));
        console.error('Parse error:', e.message);
        throw new Error('Invalid response from Steam API: ' + e.message);
      }
    }
    
    console.log(`Received inventory data. Assets: ${data.assets?.length || 0}, Descriptions: ${data.descriptions?.length || 0}`);
    
    // Handle empty inventory
    if (!data.assets || data.assets.length === 0) {
      return res.json({ items: [], total: 0, message: 'No items found in inventory' });
    }
    
    // Process inventory items
    const items = [];
    if (data.assets && data.descriptions) {
      const descriptionsMap = {};
      data.descriptions.forEach(desc => {
        descriptionsMap[desc.classid] = desc;
      });

      data.assets.forEach(asset => {
        const description = descriptionsMap[asset.classid];
        if (description) {
          // Include all items, not just marketable ones (user can filter if needed)
          items.push({
            assetid: asset.assetid,
            classid: asset.classid,
            instanceid: asset.instanceid,
            name: description.market_name || description.name,
            iconUrl: `https://steamcommunity-a.akamaihd.net/economy/image/${description.icon_url}`,
            tradable: description.tradable === 1,
            marketable: description.marketable === 1,
            type: description.type,
            marketHashName: description.market_hash_name
          });
        }
      });
    }

    console.log(`Processed ${items.length} items from inventory`);
    res.json({ items, total: items.length });
  } catch (err) {
    console.error('Inventory fetch error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch inventory', 
      message: err.message,
      details: 'Check server console for more information'
    });
  }
});

// Steam Market Price endpoint
app.get('/api/price/:marketHashName', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const marketHashName = encodeURIComponent(req.params.marketHashName);
    const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${marketHashName}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Steam Market API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Extract price from string like "$12.34" or "$1,234.56"
      const priceStr = data.lowest_price || data.median_price || '0';
      const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
      
      res.json({
        success: true,
        lowestPrice: price,
        lowestPriceFormatted: data.lowest_price,
        medianPrice: parseFloat((data.median_price || '0').replace(/[^0-9.]/g, '')) || 0,
        volume: data.volume || '0'
      });
    } else {
      res.json({ success: false, error: 'Price not available' });
    }
  } catch (err) {
    console.error('Price fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch price', message: err.message });
  }
});

// Batch price fetch endpoint (to reduce API calls)
app.post('/api/prices', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { marketHashNames } = req.body;
    if (!Array.isArray(marketHashNames) || marketHashNames.length === 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Limit to 50 items at a time to avoid rate limiting
    const limitedNames = marketHashNames.slice(0, 50);
    const prices = {};

    // Fetch prices with delays to respect rate limits
    for (let i = 0; i < limitedNames.length; i++) {
      const marketHashName = limitedNames[i];
      const encoded = encodeURIComponent(marketHashName);
      const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${encoded}`;
      
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const price = parseFloat((data.lowest_price || '0').replace(/[^0-9.]/g, '')) || 0;
            prices[marketHashName] = {
              success: true,
              price,
              formatted: data.lowest_price || '$0.00'
            };
          } else {
            prices[marketHashName] = { success: false, price: 0 };
          }
        } else {
          prices[marketHashName] = { success: false, price: 0 };
        }
      } catch (err) {
        prices[marketHashName] = { success: false, price: 0, error: err.message };
      }

      // Add delay between requests to avoid rate limiting (100ms between requests)
      if (i < limitedNames.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    res.json({ prices });
  } catch (err) {
    console.error('Batch price fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch prices', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Steam authentication configured`);
  if (!STEAM_API_KEY) {
    console.warn('WARNING: STEAM_API_KEY not set. Get one from https://steamcommunity.com/dev/apikey');
  }
});
