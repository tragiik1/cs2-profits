# CS2 Profits Setup Guide

## Prerequisites

- Node.js 18+ installed
- A Steam account
- A Google reCAPTCHA account (optional but recommended)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory (copy from `.env.example` if provided):
```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Steam API Key - Get from: https://steamcommunity.com/dev/apikey
STEAM_API_KEY=your_steam_api_key_here
STEAM_REALM=http://localhost:3000
STEAM_RETURN_URL=http://localhost:3000/auth/steam/return

# reCAPTCHA Keys - Get from: https://www.google.com/recaptcha/admin
RECAPTCHA_SITE_KEY=your_recaptcha_site_key_here
RECAPTCHA_SECRET=your_recaptcha_secret_key_here

# Session Secret - Generate a random string
SESSION_SECRET=your-random-session-secret-key
```

## Getting Your Steam API Key

1. Go to https://steamcommunity.com/dev/apikey
2. Sign in with your Steam account
3. Enter a domain name (for localhost, use `localhost` or `127.0.0.1`)
4. Copy the API key and add it to your `.env` file as `STEAM_API_KEY`

## Getting reCAPTCHA Keys (Optional)

1. Go to https://www.google.com/recaptcha/admin
2. Click "Create" and select reCAPTCHA v3
3. Add your domain (localhost for development)
4. Copy the Site Key and Secret Key
5. Add them to your `.env` file
6. Update `index.html` line 11: Replace `YOUR_RECAPTCHA_SITE_KEY` with your actual site key

## Running the Application

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Features

- ✅ Steam OAuth authentication
- ✅ Smart item search with Steam Market API
- ✅ Transaction tracking with profit/loss calculations
- ✅ Multi-currency support (USD, AUD, EUR)
- ✅ Live exchange rates
- ✅ Data export/import
- ✅ reCAPTCHA protection (optional)

## Production Deployment

For production:

1. Set `NODE_ENV=production` in your `.env`
2. Update `STEAM_REALM` and `STEAM_RETURN_URL` to your production domain
3. Update `FRONTEND_URL` to your production domain
4. Update the reCAPTCHA site key in `index.html`
5. Use a secure random `SESSION_SECRET`
6. Consider using a proper database instead of JSON file storage
7. Set up HTTPS (required for secure cookies in production)

## Troubleshooting

**Steam login not working:**
- Verify your Steam API key is correct
- Check that `STEAM_REALM` and `STEAM_RETURN_URL` match your domain
- Ensure the domain in your Steam API key registration matches

**reCAPTCHA errors:**
- Verify both site key and secret key are correct
- Check that the domain matches your reCAPTCHA configuration
- The app will work without reCAPTCHA, but it's recommended for production
