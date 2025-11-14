import express from 'express';
import session from 'express-session';
import passport from 'passport';
import SteamStrategy from 'passport-steam';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, writeFile } from 'fs';
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
          // Include ALL items, including trade-locked ones
          // Note: description.tradable indicates if the item TYPE is tradable
          // Individual items can still be trade-locked even if type is tradable
          const isTradable = description.tradable === 1;
          const isMarketable = description.marketable === 1;
          
          const itemName = description.market_name || description.name;
          
          // Log if we find a Bloodsport or other valuable items for debugging
          if (itemName.toLowerCase().includes('bloodsport') || itemName.toLowerCase().includes('ak-47')) {
            console.log(`Found item: ${itemName}, tradable: ${isTradable}, marketable: ${isMarketable}, asset:`, asset);
          }
          
          items.push({
            assetid: asset.assetid,
            classid: asset.classid,
            instanceid: asset.instanceid,
            name: itemName,
            iconUrl: `https://steamcommunity-a.akamaihd.net/economy/image/${description.icon_url}`,
            tradable: isTradable,
            marketable: isMarketable,
            type: description.type,
            marketHashName: description.market_hash_name,
            // Include any trade restriction info if available
            tradeRestriction: asset.trade_restriction || null,
            // Include raw asset data for debugging
            rawAsset: asset
          });
        } else {
          // Log items without descriptions for debugging
          console.log('Asset without description:', asset);
        }
      });
      
      // Log trade-locked items count for debugging
      const tradeLockedCount = items.filter(item => !item.tradable).length;
      console.log(`Processed ${items.length} items. Trade-locked: ${tradeLockedCount}, Tradable: ${items.length - tradeLockedCount}`);
      
      // Log all item names for debugging
      console.log('Item names:', items.map(i => i.name).join(', '));
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

// CS2 Item Search endpoint - searches Steam market for CS2 items
app.get('/api/search-items', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const query = req.query.q || '';
    const start = parseInt(req.query.start) || 0;
    const count = Math.min(parseInt(req.query.count) || 20, 50); // Limit to 50 results

    if (!query || query.trim().length < 2) {
      return res.json({ items: [], total: 0 });
    }
    
    // TEMPORARY: Test mode - return sample items to verify frontend works
    // Set TEST_SEARCH=true in .env to enable test mode
    // Remove this after debugging
    const testMode = process.env.TEST_SEARCH === 'true';
    if (testMode) {
      console.log('TEST MODE: Returning sample items');
      const sampleItems = [
        { marketHashName: 'AK-47 | Redline (Field-Tested)', name: 'AK-47 | Redline (Field-Tested)', iconUrl: 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FBRh3szJemkV09-5gZKKkuXLPr7Vn35cppwl2r3A8I3z31Hn8kE5Y2-gdYKWcFFqN1nYrgG8xr2-hJ-47J7OnCBl7CIj-z-Dy1Hp0Q', price: 12.50, priceFormatted: '$12.50' },
        { marketHashName: 'AWP | Dragon Lore (Factory New)', name: 'AWP | Dragon Lore (Factory New)', iconUrl: 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FBRh3szJemkV09-5gZKKkuXLPr7Vn35cppwl2r3A8I3z31Hn8kE5Y2-gdYKWcFFqN1nYrgG8xr2-hJ-47J7OnCBl7CIj-z-Dy1Hp0Q', price: 1500.00, priceFormatted: '$1,500.00' },
        { marketHashName: 'M4A4 | Howl (Factory New)', name: 'M4A4 | Howl (Factory New)', iconUrl: 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FBRh3szJemkV09-5gZKKkuXLPr7Vn35cppwl2r3A8I3z31Hn8kE5Y2-gdYKWcFFqN1nYrgG8xr2-hJ-47J7OnCBl7CIj-z-Dy1Hp0Q', price: 800.00, priceFormatted: '$800.00' },
        { marketHashName: 'AK-47 | Fire Serpent (Field-Tested)', name: 'AK-47 | Fire Serpent (Field-Tested)', iconUrl: 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FBRh3szJemkV09-5gZKKkuXLPr7Vn35cppwl2r3A8I3z31Hn8kE5Y2-gdYKWcFFqN1nYrgG8xr2-hJ-47J7OnCBl7CIj-z-Dy1Hp0Q', price: 45.00, priceFormatted: '$45.00' },
        { marketHashName: 'Glock-18 | Fade (Factory New)', name: 'Glock-18 | Fade (Factory New)', iconUrl: 'https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FBRh3szJemkV09-5gZKKkuXLPr7Vn35cppwl2r3A8I3z31Hn8kE5Y2-gdYKWcFFqN1nYrgG8xr2-hJ-47J7OnCBl7CIj-z-Dy1Hp0Q', price: 250.00, priceFormatted: '$250.00' }
      ];
      
      // Filter by query for partial matching
      const queryLower = query.trim().toLowerCase();
      const filtered = sampleItems.filter(item => 
        item.name.toLowerCase().includes(queryLower) || 
        item.marketHashName.toLowerCase().includes(queryLower)
      );
      
      console.log(`TEST MODE: Query "${query}" matched ${filtered.length} items`);
      return res.json({ 
        items: filtered, 
        total: filtered.length,
        query: query,
        testMode: true
      });
    }

    // Helper function to calculate relevance score for sorting
    function calculateRelevanceScore(itemName, query) {
      const nameLower = itemName.toLowerCase();
      const queryLower = query.toLowerCase();
      
      // Exact match gets highest score
      if (nameLower === queryLower) return 100;
      
      // Starts with query gets high score
      if (nameLower.startsWith(queryLower)) return 90;
      
      // Contains query - score based on position (earlier is better)
      const index = nameLower.indexOf(queryLower);
      if (index !== -1) {
        // Earlier position = higher score
        return 80 - (index / nameLower.length) * 10;
      }
      
      return 0;
    }
    
    // Use Steam Community Market search
    // Enable search_descriptions=1 to search within item descriptions for better partial matching
    // This allows partial matches like "dra" to find "Dragon Lore"
    const encodedQuery = encodeURIComponent(query.trim());
    
    // Try different URL formats - Steam might require different parameters
    const urlOptions = [
      `https://steamcommunity.com/market/search/render/?query=${encodedQuery}&start=${start}&count=${Math.min(count * 2, 100)}&search_descriptions=1&sort_column=popular&sort_dir=desc&appid=730&norender=1`,
      `https://steamcommunity.com/market/search/render/?query=${encodedQuery}&start=${start}&count=${Math.min(count * 2, 100)}&search_descriptions=0&sort_column=popular&sort_dir=desc&appid=730&norender=1`,
      `https://steamcommunity.com/market/search/render/?q=${encodedQuery}&start=${start}&count=${Math.min(count * 2, 100)}&search_descriptions=1&appid=730&norender=1`
    ];
    
    let steamResponse = null; // Steam API fetch response
    let responseText = '';
    let data = null;
    let lastError = null;
    
    // Try each URL format
    for (let urlIndex = 0; urlIndex < urlOptions.length; urlIndex++) {
      const url = urlOptions[urlIndex];
      console.log(`Trying URL format ${urlIndex + 1}: ${url.substring(0, 100)}...`);
      
      try {
        steamResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://steamcommunity.com/market/search?q=' + encodedQuery,
            'Origin': 'https://steamcommunity.com',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'DNT': '1'
          }
        });
        
        if (steamResponse.ok) {
          responseText = await steamResponse.text();
          try {
            data = JSON.parse(responseText);
            // Check if we got valid data
            if (data && (data.results_html || data.assets || data.success !== false)) {
              console.log(`✅ Success with URL format ${urlIndex + 1}`);
              break; // Success! Use this data
            } else {
              console.log(`⚠️ URL format ${urlIndex + 1} returned invalid data`);
              lastError = 'Invalid data structure';
            }
          } catch (parseError) {
            console.log(`⚠️ URL format ${urlIndex + 1} returned invalid JSON`);
            lastError = parseError.message;
          }
        } else {
          console.log(`❌ URL format ${urlIndex + 1} returned ${steamResponse.status}`);
          lastError = `HTTP ${steamResponse.status}`;
        }
        
        // Add delay between attempts
        if (urlIndex < urlOptions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (fetchError) {
        console.error(`Error with URL format ${urlIndex + 1}:`, fetchError.message);
        lastError = fetchError.message;
      }
    }
    
    if (!data) {
      console.error('❌ All URL formats failed. Last error:', lastError);
      return res.json({ 
        items: [], 
        total: 0, 
        error: 'Failed to fetch from Steam API',
        message: `All attempts failed. Last error: ${lastError || 'Unknown'}. Check server console logs for details.`
      });
    }
    
    // Data was successfully parsed above - log it
    console.log('=== STEAM API RESPONSE DEBUG ===');
    console.log('Response keys:', Object.keys(data));
    console.log('Success:', data.success);
    console.log('Total count:', data.total_count);
    console.log('Results HTML length:', data.results_html ? data.results_html.length : 0);
    console.log('Has assets:', !!data.assets);
    console.log('Has listinginfo:', !!data.listinginfo);
    
    if (data.assets) {
      console.log('Assets keys:', Object.keys(data.assets));
      if (data.assets['730']) {
        console.log('CS2 assets context IDs:', Object.keys(data.assets['730']));
        // Log sample asset structure
        const firstContextId = Object.keys(data.assets['730'])[0];
        if (firstContextId) {
          const firstAsset = Object.values(data.assets['730'][firstContextId])[0];
          if (firstAsset) {
            console.log('Sample asset structure:', JSON.stringify(firstAsset, null, 2).substring(0, 500));
          }
        }
      }
    }
    
    if (data.listinginfo) {
      const listingIds = Object.keys(data.listinginfo);
      console.log('Listing info count:', listingIds.length);
      if (listingIds.length > 0) {
        console.log('First listing ID:', listingIds[0]);
        console.log('First listing structure:', JSON.stringify(data.listinginfo[listingIds[0]], null, 2).substring(0, 500));
      }
    }
    
    // Check if we have any useful data
    const hasData = (data.results_html && data.results_html.length > 0) || 
                    (data.assets && data.assets['730']) || 
                    (data.listinginfo && Object.keys(data.listinginfo).length > 0);
    
    if (!hasData) {
      console.log('❌ Steam API returned no useful data');
      console.log('Full response (first 2000 chars):', JSON.stringify(data, null, 2).substring(0, 2000));
      return res.json({ 
        items: [], 
        total: 0, 
        error: 'Steam API returned empty response',
        message: 'Steam API returned no items. This might be due to: 1) Rate limiting, 2) Steam blocking requests, 3) Invalid query, or 4) No matching items.'
      });
    }
    
    // Log sample of results_html if available
    if (data.results_html && data.results_html.length > 0) {
      console.log('Results HTML sample (first 1000 chars):', data.results_html.substring(0, 1000));
      // Also check if HTML contains market listings
      const hasMarketListings = data.results_html.includes('/market/listings/730/');
      console.log('HTML contains market listings:', hasMarketListings);
      if (hasMarketListings) {
        const listingCount = (data.results_html.match(/\/market\/listings\/730\//g) || []).length;
        console.log(`Found ${listingCount} market listing URLs in HTML`);
      }
    } else {
      console.log('WARNING: No results_html in response!');
    }
    
    let items = [];
    const queryLower = query.trim().toLowerCase();
    
    // Try parsing from structured data first (more reliable)
    if (data.assets && data.assets['730'] && data.listinginfo) {
      try {
        console.log('Attempting to parse structured data...');
        const listingIds = Object.keys(data.listinginfo);
        const contextIds = Object.keys(data.assets['730']);
        const seenNames = new Set();
        
        console.log(`Found ${listingIds.length} listings, ${contextIds.length} context IDs`);
        
        for (const listingId of listingIds.slice(0, count * 3)) {
          const listing = data.listinginfo[listingId];
          if (!listing || !listing.asset) {
            console.log(`Listing ${listingId} has no asset`);
            continue;
          }
          
          // Try each context ID to find the asset
          let description = null;
          let foundContextId = null;
          
          // Try multiple ways to find the description
          for (const contextId of contextIds) {
            const assets = data.assets['730'][contextId];
            if (!assets) continue;
            
            // Try direct asset ID lookup
            if (assets[listing.asset.id]) {
              const assetData = assets[listing.asset.id];
              // Description might be nested or direct
              if (assetData.description) {
                description = assetData.description;
              } else if (assetData.market_hash_name) {
                // Asset data itself might be the description
                description = assetData;
              }
              foundContextId = contextId;
              break;
            }
            
            // Try looking up by classid/instanceid if available
            if (listing.asset.classid) {
              const assetByClassId = Object.values(assets).find(a => 
                (a.classid && a.classid === listing.asset.classid) ||
                (a.description && a.description.classid === listing.asset.classid)
              );
              if (assetByClassId) {
                description = assetByClassId.description || assetByClassId;
                foundContextId = contextId;
                break;
              }
            }
          }
          
          // Try alternative structures
          if (!description) {
            // Maybe description is at listing level
            if (listing.description) {
              description = listing.description;
            }
            // Maybe it's in a different structure
            else if (listing.asset && listing.asset.market_hash_name) {
              description = listing.asset;
            }
          }
          
          if (description) {
            // Get market_hash_name from various possible locations
            const marketHashName = description.market_hash_name || 
                                  description.market_name ||
                                  listing.asset?.market_hash_name ||
                                  (typeof description === 'string' ? description : null);
            
            if (marketHashName) {
              // Skip duplicates
              if (seenNames.has(marketHashName)) continue;
              seenNames.add(marketHashName);
              
              const itemName = description.market_name || 
                              description.name || 
                              marketHashName;
              const nameLower = itemName.toLowerCase();
              const hashLower = marketHashName.toLowerCase();
              
              console.log(`Found item: ${itemName}, checking against query "${queryLower}"`);
              
              // Filter by query to ensure partial match (case-insensitive)
              // This allows "dra" to match "Dragon Lore"
              if (nameLower.includes(queryLower) || hashLower.includes(queryLower)) {
                // Extract price from listing
                let price = 0;
                let priceFormatted = 'N/A';
                
                if (listing.price && listing.fee !== undefined) {
                  // Price is in cents, convert to dollars
                  price = (parseInt(listing.price) + parseInt(listing.fee || 0)) / 100;
                  priceFormatted = `$${price.toFixed(2)}`;
                } else if (listing.converted_price) {
                  // Alternative price format
                  price = parseInt(listing.converted_price) / 100;
                  priceFormatted = `$${price.toFixed(2)}`;
                } else if (listing.converted_fee) {
                  price = (parseInt(listing.converted_price || 0) + parseInt(listing.converted_fee || 0)) / 100;
                  priceFormatted = `$${price.toFixed(2)}`;
                } else if (data.results_html) {
                  // Try to extract from HTML if available
                  const priceMatch = data.results_html.match(new RegExp(`listing_${listingId}[\\s\\S]*?normal_price[^>]*>([^<]+)`));
                  if (priceMatch) {
                    priceFormatted = priceMatch[1].trim();
                    price = parseFloat(priceFormatted.replace(/[^0-9.]/g, '')) || 0;
                  }
                }
                
                // Get icon URL from various possible locations
                const iconUrl = description.icon_url || 
                               description.icon_url_large || 
                               description.icon_drag_url ||
                               '';
                
                const item = {
                  marketHashName: marketHashName,
                  name: itemName,
                  iconUrl: iconUrl ? `https://steamcommunity-a.akamaihd.net/economy/image/${iconUrl}` : '',
                  price,
                  priceFormatted,
                  relevanceScore: calculateRelevanceScore(itemName, queryLower)
                };
                
                console.log(`Adding item: ${item.name} (${item.marketHashName})`);
                items.push(item);
              } else {
                console.log(`Item "${itemName}" does not match query "${queryLower}"`);
              }
            } else {
              console.log(`Listing ${listingId} has no market_hash_name in any expected location`);
            }
          } else {
            console.log(`Listing ${listingId} has no description found`);
          }
        }
        
        console.log(`Parsed ${items.length} items from structured data`);
        
        // Sort by relevance: items starting with query come first, then by position in name
        items.sort((a, b) => {
          // First, prioritize items that start with the query
          const aStarts = a.name.toLowerCase().startsWith(queryLower);
          const bStarts = b.name.toLowerCase().startsWith(queryLower);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          
          // Then by relevance score (higher is better)
          if (a.relevanceScore !== b.relevanceScore) {
            return b.relevanceScore - a.relevanceScore;
          }
          
          // Finally alphabetical
          return a.name.localeCompare(b.name);
        });
      } catch (e) {
        console.error('Error parsing structured Steam data:', e);
        console.error('Error stack:', e.stack);
      }
    } else {
      console.log('No structured data available (assets or listinginfo missing)');
    }
    
    // Always try HTML parsing as it's more reliable - Steam's API structure varies
    if (data.results_html && data.results_html.length > 0) {
      console.log('=== HTML PARSING (Primary Method) ===');
      const resultsHtml = data.results_html || '';
      console.log(`HTML length: ${resultsHtml.length} characters`);
      
      // Try multiple regex patterns from most specific to most generic
      const htmlItems = [];
      const seenHashNames = new Set();
      
      // Pattern 1: Full structure - href, img, name, price all together
      console.log('Trying Pattern 1: Full structure...');
      const pattern1 = /<a[^>]+href="\/market\/listings\/730\/([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<span[^>]+class="market_listing_item_name"[^>]*>([^<]+)<\/span>[\s\S]*?<span[^>]+class="normal_price"[^>]*>([^<]+)<\/span>/gi;
      let match;
      pattern1.lastIndex = 0;
      let pattern1Count = 0;
      
      while ((match = pattern1.exec(resultsHtml)) !== null && htmlItems.length < count * 3) {
        try {
          const marketHashName = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
          if (!marketHashName || seenHashNames.has(marketHashName)) continue;
          
          const iconUrl = (match[2] || '').trim();
          const name = (match[3] || '').trim();
          const priceText = (match[4] || '').trim();
          
          // Filter by query
          const nameLower = name.toLowerCase();
          const hashLower = marketHashName.toLowerCase();
          
          if ((nameLower.includes(queryLower) || hashLower.includes(queryLower)) && name && marketHashName) {
            seenHashNames.add(marketHashName);
            const price = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0 : 0;
            
            htmlItems.push({
              marketHashName,
              name,
              iconUrl: iconUrl.startsWith('http') ? iconUrl : (iconUrl ? `https://steamcommunity-a.akamaihd.net/economy/image/${iconUrl}` : ''),
              price,
              priceFormatted: priceText || (price > 0 ? `$${price.toFixed(2)}` : 'N/A'),
              relevanceScore: calculateRelevanceScore(name, queryLower)
            });
            pattern1Count++;
          }
        } catch (e) {
          console.error('Error in Pattern 1:', e);
        }
      }
      console.log(`Pattern 1 found ${pattern1Count} items`);
      
      // Pattern 2: Simpler - just href and name, find price separately
      if (htmlItems.length < count) {
        console.log('Trying Pattern 2: Name and hash only...');
        const pattern2 = /href="\/market\/listings\/730\/([^"]+)"[^>]*>[\s\S]{0,2000}?<span[^>]+class="market_listing_item_name"[^>]*>([^<]+)<\/span>/gi;
        pattern2.lastIndex = 0;
        let pattern2Count = 0;
        
        while ((match = pattern2.exec(resultsHtml)) !== null && htmlItems.length < count * 3) {
          try {
            const marketHashName = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
            if (!marketHashName || seenHashNames.has(marketHashName)) continue;
            
            const name = (match[2] || '').trim();
            
            // Filter by query
            const nameLower = name.toLowerCase();
            const hashLower = marketHashName.toLowerCase();
            
            if ((nameLower.includes(queryLower) || hashLower.includes(queryLower)) && name && marketHashName) {
              seenHashNames.add(marketHashName);
              
              // Try to find price nearby (within 500 chars after)
              const afterMatch = resultsHtml.substring(match.index, Math.min(resultsHtml.length, match.index + 1000));
              const priceMatch = afterMatch.match(/normal_price[^>]*>([^<]+)</i);
              const priceText = priceMatch ? priceMatch[1].trim() : '';
              const price = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0 : 0;
              
              // Try to find icon nearby (within 500 chars before)
              const beforeMatch = resultsHtml.substring(Math.max(0, match.index - 1000), match.index);
              const iconMatch = beforeMatch.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
              const iconUrl = iconMatch ? iconMatch[1].trim() : '';
              
              htmlItems.push({
                marketHashName,
                name,
                iconUrl: iconUrl.startsWith('http') ? iconUrl : (iconUrl ? `https://steamcommunity-a.akamaihd.net/economy/image/${iconUrl}` : ''),
                price,
                priceFormatted: priceText || (price > 0 ? `$${price.toFixed(2)}` : 'N/A'),
                relevanceScore: calculateRelevanceScore(name, queryLower)
              });
              pattern2Count++;
            }
          } catch (e) {
            console.error('Error in Pattern 2:', e);
          }
        }
        console.log(`Pattern 2 found ${pattern2Count} additional items`);
      }
      
      // Pattern 3: Just market hash names - simplest fallback (ALWAYS try this if others fail)
      // This is the most reliable - just extract URLs
      if (htmlItems.length === 0) {
        console.log('Trying Pattern 3: Hash names only (fallback - most reliable)...');
        const pattern3 = /href="\/market\/listings\/730\/([^"]+)"/gi;
        pattern3.lastIndex = 0;
        let pattern3Count = 0;
        let pattern3Matches = 0;
        
        while ((match = pattern3.exec(resultsHtml)) !== null && htmlItems.length < count * 3) {
          pattern3Matches++;
          try {
            const marketHashName = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
            if (!marketHashName || seenHashNames.has(marketHashName)) continue;
            
            // Don't filter by query here - just get all items and let client filter
            // This ensures we get items even if query matching fails
            seenHashNames.add(marketHashName);
            
            // Try to find name nearby in HTML
            const contextStart = Math.max(0, match.index - 500);
            const contextEnd = Math.min(resultsHtml.length, match.index + 2000);
            const context = resultsHtml.substring(contextStart, contextEnd);
            
            // Try to find item name
            const nameMatch = context.match(/market_listing_item_name[^>]*>([^<]+)</i);
            const name = nameMatch ? nameMatch[1].trim() : marketHashName;
            
            // Try to find price
            const priceMatch = context.match(/normal_price[^>]*>([^<]+)</i);
            const priceText = priceMatch ? priceMatch[1].trim() : '';
            const price = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0 : 0;
            
            // Only add if it matches query (but be lenient)
            const nameLower = name.toLowerCase();
            const hashLower = marketHashName.toLowerCase();
            if (nameLower.includes(queryLower) || hashLower.includes(queryLower) || queryLower.length < 3) {
              htmlItems.push({
                marketHashName,
                name,
                iconUrl: '',
                price,
                priceFormatted: priceText || (price > 0 ? `$${price.toFixed(2)}` : 'N/A'),
                relevanceScore: calculateRelevanceScore(name, queryLower)
              });
              pattern3Count++;
            }
          } catch (e) {
            console.error('Error in Pattern 3:', e);
          }
        }
        console.log(`Pattern 3: Found ${pattern3Matches} URL matches, ${pattern3Count} items added (after query filter)`);
        
        // If still no items and we found URLs, add them anyway (query might be too restrictive)
        if (htmlItems.length === 0 && pattern3Matches > 0) {
          console.log('⚠️ Pattern 3 found URLs but query filter removed all items. Adding first few anyway...');
          pattern3.lastIndex = 0;
          seenHashNames.clear();
          let added = 0;
          while ((match = pattern3.exec(resultsHtml)) !== null && added < 10) {
            try {
              const marketHashName = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
              if (!marketHashName || seenHashNames.has(marketHashName)) continue;
              seenHashNames.add(marketHashName);
              
              const contextStart = Math.max(0, match.index - 500);
              const contextEnd = Math.min(resultsHtml.length, match.index + 2000);
              const context = resultsHtml.substring(contextStart, contextEnd);
              const nameMatch = context.match(/market_listing_item_name[^>]*>([^<]+)</i);
              const name = nameMatch ? nameMatch[1].trim() : marketHashName;
              
              htmlItems.push({
                marketHashName,
                name,
                iconUrl: '',
                price: 0,
                priceFormatted: 'N/A',
                relevanceScore: 50 // Default score
              });
              added++;
            } catch (e) {
              console.error('Error adding fallback item:', e);
            }
          }
          console.log(`✅ Added ${added} fallback items`);
        }
      }
      
      // Merge HTML items with structured data items
      if (htmlItems.length > 0) {
        // Remove duplicates from HTML items
        const uniqueHtmlItems = [];
        const htmlSeen = new Set();
        for (const item of htmlItems) {
          if (!htmlSeen.has(item.marketHashName)) {
            htmlSeen.add(item.marketHashName);
            uniqueHtmlItems.push(item);
          }
        }
        
        // Merge with existing items (from structured data)
        const allItems = [...items];
        for (const htmlItem of uniqueHtmlItems) {
          if (!items.find(i => i.marketHashName === htmlItem.marketHashName)) {
            allItems.push(htmlItem);
          }
        }
        
        items = allItems;
        console.log(`After HTML parsing: ${items.length} total items (${uniqueHtmlItems.length} from HTML)`);
        
        // Sort by relevance
        items.sort((a, b) => {
          const aStarts = a.name.toLowerCase().startsWith(queryLower);
          const bStarts = b.name.toLowerCase().startsWith(queryLower);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          if (a.relevanceScore !== b.relevanceScore) {
            return b.relevanceScore - a.relevanceScore;
          }
          return a.name.localeCompare(b.name);
        });
      } else {
        console.log('HTML parsing found no items. Sample HTML:', resultsHtml.substring(0, 2000));
      }
    } else {
      console.log('No HTML results available');
    }
    
    // Log final items count
    console.log(`📊 Final items count before limiting: ${items.length}`);
    
    // If still no items, return empty but log the structure
    if (items.length === 0) {
      console.log('❌ No items found after all parsing attempts');
      console.log('Response structure:', {
        hasResults: !!data.results,
        hasResultsHtml: !!data.results_html,
        resultsHtmlLength: data.results_html?.length || 0,
        hasAssets: !!data.assets,
        hasListingInfo: !!data.listinginfo,
        listingInfoCount: data.listinginfo ? Object.keys(data.listinginfo).length : 0,
        success: data.success,
        totalCount: data.total_count,
        responseKeys: Object.keys(data)
      });
      
      // Log a sample of the HTML if available for debugging
      if (data.results_html) {
        console.log('Sample HTML (first 2000 chars):', data.results_html.substring(0, 2000));
        // Check if HTML has market listings
        const listingMatches = data.results_html.match(/\/market\/listings\/730\//g);
        console.log(`Found ${listingMatches ? listingMatches.length : 0} market listing URLs in HTML`);
      }
      
      // Return empty response with helpful error
      return res.json({
        items: [],
        total: 0,
        error: 'Steam API returned empty response',
        message: 'Steam API returned no items. This might be due to: 1) Rate limiting, 2) Steam blocking requests, 3) Invalid query, or 4) No matching items.'
      });
    } else {
      console.log(`✅ Found ${items.length} items after parsing`);
    }

    // Limit to requested count and return
    const limitedItems = items.slice(0, count);
    
    console.log(`✅ Returning ${limitedItems.length} items for query "${query}"`);
    
    // Log the response structure before sending
    if (limitedItems.length > 0) {
      console.log('✅ Sample item being sent:', JSON.stringify(limitedItems[0], null, 2));
    } else {
      console.log('⚠️ No items to return - items array was empty');
      console.log('⚠️ Full items array:', items);
    }
    
    // Always return a valid response, even if empty
    const apiResponse = {
      items: limitedItems,
      total: limitedItems.length,
      start,
      count: limitedItems.length,
      query: query // Include query in apiResponse for debugging
    };
    
    console.log('✅ Response structure:', {
      itemsCount: apiResponse.items.length,
      total: apiResponse.total,
      hasItems: !!apiResponse.items,
      itemsIsArray: Array.isArray(apiResponse.items)
    });
    
    res.json(apiResponse);
  } catch (err) {
    console.error('Item search error:', err);
    console.error('Error stack:', err.stack);
    // Return error response but don't throw - return empty results instead
    res.json({ 
      items: [], 
      total: 0, 
      error: err.message || 'Search failed',
      message: 'Unable to search Steam market. You can still manually enter item names in the transaction form.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Steam authentication configured`);
  if (!STEAM_API_KEY) {
    console.warn('WARNING: STEAM_API_KEY not set. Get one from https://steamcommunity.com/dev/apikey');
  }
});
