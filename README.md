# CS2 Profit & Loss (Local)

A clean, modern, dark-themed single-page web app to track Counter-Strike 2 profit and loss. Supports local accounts, per-account data storage in your browser, multiple currencies (AUD/USD/EUR) with live-rate fetch and manual overrides, and a dashboard with key metrics.

## Features
- Local account signup/login (salted SHA-256 hashed password, stored locally)
- Transactions table with: Date, Item Name, Type, Buy Price, Sell Price, Profit/Loss, Profit %, Notes
- Dashboard: Total Spent, Total Profit, Total Loss, Profit %
- Currencies: AUD, USD, EUR; display currency selectable; account base currency configurable
- Live exchange rate fetch with manual overrides (Settings)
- Import/Export your data (JSON)

## Getting Started
Simply open `index.html` in your browser. All data is stored in `localStorage` under your browser profile.

## Notes
- This is a local app intended for personal use. There is no server. Do not reuse sensitive passwords.
- Currency conversion: values are stored internally in your account base currency. Display conversion uses your exchange rates.


