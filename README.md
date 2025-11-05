# CS2 Profit & Loss Tracker

A web application to track your Counter-Strike 2 profit and loss. Sign in with Steam, add your transactions, and see your profits/losses in real-time.

## Features

- 🔐 **Steam Authentication** - Sign in with your Steam account (no password needed!)
- 🔍 **Smart Item Search** - Search CS2 items with live suggestions from Steam Market
- 📊 **Profit Tracking** - Track buy/sell prices and calculate your net profit/loss
- 💱 **Multi-Currency** - Support for USD, AUD, EUR with live exchange rates
- 📈 **Dashboard** - See your total spent, net profit, and profit percentage at a glance
- 💾 **Data Export/Import** - Backup and restore your transaction data

## Quick Start (For Users)

1. Visit the live website (your friend will share the URL)
2. Click "Sign in through Steam"
3. Start tracking your CS2 transactions!

## For Developers: Local Setup

If you want to run this locally:

```bash
npm install
```

Create a `.env` file:
```env
PORT=3000
STEAM_API_KEY=your_steam_api_key
STEAM_REALM=http://localhost:3000
STEAM_RETURN_URL=http://localhost:3000/auth/steam/return
SESSION_SECRET=your-random-secret-key
NODE_ENV=development
```

Run:
```bash
npm start
```

## Deployment

To deploy this live so others can use it, see [DEPLOY.md](./DEPLOY.md) for step-by-step instructions using Railway, Render, or Fly.io.

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Backend**: Node.js, Express
- **Authentication**: Steam OpenID (via Passport.js)
- **Data Storage**: JSON file (can be upgraded to database)

## License

ISC


