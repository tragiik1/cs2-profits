# Quick Start Guide

## Step 1: Install Dependencies (if you haven't already)
```bash
npm install
```

## Step 2: Create .env File
Create a file named `.env` in the root directory with:
```env
STEAM_API_KEY=your_key_here
SESSION_SECRET=your_secret_here
PORT=3000
STEAM_REALM=http://localhost:3000
STEAM_RETURN_URL=http://localhost:3000/auth/steam/return
NODE_ENV=development
```

## Step 3: Start the Server
```bash
npm start
```

You should see:
```
Server running on http://localhost:3000
Steam authentication configured
```

## Step 4: Open in Browser
**IMPORTANT:** Don't open the HTML file directly!

Instead, open your browser and go to:
```
http://localhost:3000
```

## Common Mistakes

❌ **Wrong:** Opening `index.html` directly (file://)
✅ **Right:** Opening `http://localhost:3000` in browser

❌ **Wrong:** Server not running
✅ **Right:** Run `npm start` first, then open browser

## Troubleshooting

**"Cannot find module" errors:**
- Run `npm install` first

**"Port already in use":**
- Change PORT in .env to a different number (like 3001)
- Or close the program using port 3000

**"Steam login not working":**
- Make sure STEAM_API_KEY is set in .env
- Make sure Domain Name on Steam API key page is set to `localhost`

