# Environment Variables Setup Guide

## Quick Setup

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```
   Or on Windows:
   ```cmd
   copy .env.example .env
   ```

2. **Edit the `.env` file** and fill in your values (see below)

## Where to Put the .env File

The `.env` file should be in the **root directory** of your project (same folder as `server.js`, `package.json`, etc.)

```
cs2-profits/
├── .env          ← Put it here!
├── server.js
├── package.json
├── app.js
└── ...
```

## Getting Your Steam API Key

1. Go to https://steamcommunity.com/dev/apikey
2. Sign in with your Steam account
3. Fill in the form:
   - **Domain Name**: See "Domain Name Settings" below
   - Click "Register"

## Domain Name Settings

### For Local Development (Testing on Your Computer):

**Set Domain Name to:** `localhost`

This allows you to test the Steam login on your local machine at `http://localhost:3000`

### For Production (When Deployed):

**Set Domain Name to:** Your actual domain (e.g., `yourdomain.com` or `yourapp.railway.app`)

**Important:** The domain must match exactly where your app is hosted. No `http://` or `https://` prefix, just the domain name.

Examples:
- ✅ `localhost` (for local dev)
- ✅ `myapp.railway.app` (if using Railway)
- ✅ `myapp.fly.dev` (if using Fly.io)
- ✅ `myapp.com` (if using your own domain)
- ❌ `http://localhost` (wrong - no protocol)
- ❌ `localhost:3000` (wrong - no port)

## Filling Out the .env File

### 1. STEAM_API_KEY
- Get from https://steamcommunity.com/dev/apikey
- Paste it directly (no quotes needed)

### 2. SESSION_SECRET
- Generate a random secret for security
- Run this command in your terminal:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Copy the output and paste it as the SESSION_SECRET value

### 3. PORT (Optional)
- Default is 3000
- Only change if port 3000 is already in use

### 4. STEAM_REALM and STEAM_RETURN_URL
- For local development, leave as-is (already set to localhost)
- For production, uncomment and update the production lines

## Example .env File

```env
STEAM_API_KEY=ABC123XYZ789DEF456GHI012JKL345MNO678
SESSION_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
PORT=3000
STEAM_REALM=http://localhost:3000
STEAM_RETURN_URL=http://localhost:3000/auth/steam/return
NODE_ENV=development
```

## Security Note

The `.env` file is already in `.gitignore`, so it won't be committed to Git. This is important because it contains sensitive information!

## Troubleshooting

**"Steam login not working"**
- Make sure the Domain Name in your Steam API key matches your URL
- Check that STEAM_REALM and STEAM_RETURN_URL match your actual URL
- Verify your STEAM_API_KEY is correct

**"Cannot find .env file"**
- Make sure the file is named exactly `.env` (with the dot at the start)
- Make sure it's in the root directory (same folder as server.js)

