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
    // Try different URL formats and context IDs
    const contextIds = [2, 6, 1, 7]; // Try context ID 2 first (standard CS2), then others
    const urlVariants = [
      (cid) => `https://steamcommunity.com/inventory/${steamId}/730/${cid}?l=english&count=5000`,
      (cid) => `https://steamcommunity.com/inventory/${steamId}/730/${cid}?l=english`,
      (cid) => `https://steamcommunity.com/inventory/${steamId}/730/${cid}?l=english&count=5000&start_assetid=0`
    ];
    
    let response = null;
    let responseText = '';
    let success = false;
    
    // Try each context ID with different URL variants
    for (const contextId of contextIds) {
      if (success) break;
      
      for (const urlBuilder of urlVariants) {
        const url = urlBuilder(contextId);
        console.log(`Trying: ${url}`);
        
        try {
          // Add small delay between requests to avoid rate limiting
          if (response) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Referer': `https://steamcommunity.com/profiles/${steamId}/inventory/`,
              'Origin': 'https://steamcommunity.com',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin'
            }
          });
          
          responseText = await response.text();
          console.log(`Response status: ${response.status}, length: ${responseText.length}`);
          
          // Check if we got a valid response (not "null")
          const trimmed = responseText.trim();
          if (trimmed === 'null' || trimmed === '') {
            console.log(`Got null/empty response for context ${contextId}, trying next...`);
            continue;
          }
          
          // Try to parse as JSON
          try {
            const testData = JSON.parse(responseText);
            // If it has the expected structure with assets or descriptions, we're good
            // Even if status is 400, if we have valid data structure, use it
            if (testData && (testData.assets !== undefined || testData.descriptions !== undefined)) {
              // Even if assets is empty, if we have the structure, it's a valid response
              console.log(`Success with context ID ${contextId}! Found ${testData.assets?.length || 0} assets (status: ${response.status})`);
              success = true;
              break;
            }
            // Check for error responses
            if (testData.error || testData.success === false) {
              console.log(`Steam returned error: ${testData.error || 'Unknown error'}`);
              continue;
            }
          } catch (e) {
            // Not valid JSON, continue
            console.log(`Invalid JSON response, trying next...`);
            continue;
          }
          
          // If status is OK (200), we're done
          if (response.ok && response.status === 200) {
            success = true;
            break;
          }
          
          // Sometimes Steam returns 400 but with valid JSON data - check if we already handled it above
          // If we get here and status is 400, it means the JSON didn't have the expected structure
          if (response.status === 400) {
            console.log(`400 status but no valid data structure, trying next...`);
            continue;
          }
        } catch (err) {
          console.log(`Error fetching context ${contextId}: ${err.message}`);
          continue;
        }
      }
    }
    
    // If we didn't get a successful response, use the last response for error handling
    if (!success && !response) {
      return res.status(500).json({ 
        error: 'Failed to fetch inventory', 
        message: 'Could not connect to Steam API',
        steamId: steamId
      });
    }
    
    // Handle the response
    if (!success) {
      // All attempts failed - return helpful error message
      const trimmedResponse = responseText.trim();
      console.log('All inventory fetch attempts failed');
      console.log(`Final response status: ${response?.status || 'N/A'}`);
      console.log(`Final response text: ${trimmedResponse.substring(0, 200)}`);
      
      // If we got "null" responses, it likely means empty inventory or privacy issue
      if (trimmedResponse === 'null' || trimmedResponse === '') {
        return res.json({ 
          items: [], 
          total: 0, 
          message: 'No CS2 items found in inventory. Steam returned null for all context IDs.',
          steamId: steamId,
          help: `Check your inventory: https://steamcommunity.com/profiles/${steamId}/inventory/730/2/`
        });
      }
      
      // Try to parse the last response to see if there's useful error info
      if (responseText) {
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.error || errorData.message) {
            return res.status(response?.status || 400).json({ 
              error: errorData.error || 'Steam API error',
              message: errorData.message || 'Failed to fetch inventory',
              steamId: steamId
            });
          }
        } catch (e) {
          // Not JSON, continue
        }
      }
      
      return res.status(response?.status || 400).json({ 
        error: 'Failed to fetch inventory', 
        message: 'Steam API returned an error for all context IDs. This could mean: 1) Your inventory is empty, 2) Inventory privacy settings are blocking access, or 3) You don\'t have CS2 items.',
        steamId: steamId,
        details: `Check your inventory: https://steamcommunity.com/profiles/${steamId}/inventory/730/2/`
      });
    }
    
    // Parse the successful response
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Steam API response:', responseText.substring(0, 200));
      console.error('Parse error:', e.message);
      return res.status(500).json({ 
        error: 'Invalid response from Steam API', 
        message: 'Steam returned data but it could not be parsed.',
        steamId: steamId
      });
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
