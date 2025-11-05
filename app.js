// Utilities
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const CURRENCIES = [
  { code: 'AUD', symbol: 'A$', locale: 'en-AU' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
];

// Local fallback dataset for typeahead (popular items)
const LOCAL_ITEM_FALLBACK = [
  'Kilowatt Case',
  'Dreams & Nightmares Case',
  'Revolution Case',
  'Fracture Case',
  'Prisma 2 Case',
  'Clutch Case',
  'AK-47 | Redline (Field-Tested)',
  'AK-47 | Slate (Factory New)',
  'M4A1-S | Printstream (Field-Tested)',
  'AWP | Asiimov (Field-Tested)',
  'AWP | Dragon Lore (Factory New)',
  'Desert Eagle | Printstream (Minimal Wear)',
  'USP-S | Kill Confirmed (Field-Tested)',
  'Glock-18 | Fade (Factory New)',
  'Butterfly Knife | Marble Fade (Factory New)',
  'Operation Riptide Case',
  'Sticker | Crown (Foil)',
  'Sticker | Cloud9 (Holo) | Katowice 2014',
  'Sticker | Vitality (Holo) | Paris 2023',
];

const STORAGE_KEYS = {
  users: 'cs2pl.users',
  session: 'cs2pl.session',
};

function readUsers() {
  const raw = localStorage.getItem(STORAGE_KEYS.users);
  return raw ? JSON.parse(raw) : {};
}

function writeUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function getSession() {
  const raw = localStorage.getItem(STORAGE_KEYS.session);
  return raw ? JSON.parse(raw) : null;
}

function setSession(username) {
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({ username }));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.session);
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatMoney(amount, code) {
  const curr = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
  return new Intl.NumberFormat(curr.locale, { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount || 0);
}

async function sha256Hex(message) {
  const enc = new TextEncoder();
  const data = enc.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt(len = 16) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// State
let currentUser = null; // { username, salt, passwordHash, baseCurrency, displayCurrency, rates, transactions: [] }

function getDefaultRates(base) {
  const baseIndex = CURRENCIES.findIndex((c) => c.code === base);
  const obj = {};
  CURRENCIES.forEach((c) => {
    obj[c.code] = c.code === base ? 1 : 1; // will be updated by fetch; editable in settings
  });
  return obj;
}

function convertAmount(amountInBase, fromCode, toCode, rates, baseCurrency) {
  if (!rates || !amountInBase) return 0;
  // If amounts stored in base currency, conversion for display is: base -> target
  if (fromCode === baseCurrency && toCode in rates) return amountInBase * rates[toCode];
  if (toCode === baseCurrency && fromCode in rates && rates[fromCode] !== 0) return amountInBase / rates[fromCode];
  if (fromCode in rates && toCode in rates && rates[fromCode] !== 0) {
    // cross via base: from -> base -> to
    const inBase = amountInBase / rates[fromCode];
    return inBase * rates[toCode];
  }
  return amountInBase; // fallback
}

function toBase(amount, inputCurrency, user) {
  if (inputCurrency === user.baseCurrency) return amount;
  // Convert from inputCurrency to base via rates
  if (!user.rates || !user.rates[inputCurrency] || user.rates[inputCurrency] === 0) return amount; // fallback
  // amount is in inputCurrency; toBase: amount / rate[input]
  return amount / user.rates[inputCurrency];
}

function fromBase(amountBase, displayCurrency, user) {
  if (displayCurrency === user.baseCurrency) return amountBase;
  if (!user.rates || !user.rates[displayCurrency]) return amountBase;
  return amountBase * user.rates[displayCurrency];
}

// Exchange rates
async function fetchRates(base) {
  // Try frankfurter.app first
  try {
    const symbols = CURRENCIES.map((c) => c.code).join(',');
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${symbols}`);
    if (!res.ok) throw new Error('Rate fetch failed');
    const data = await res.json();
    const result = { [base]: 1 };
    CURRENCIES.forEach((c) => {
      if (c.code === base) return;
      result[c.code] = data.rates[c.code] ?? 1;
    });
    return result;
  } catch (_) {
    // Fallback: exchangerate.host
    try {
      const symbols = CURRENCIES.map((c) => c.code).join(',');
      const res = await fetch(`https://api.exchangerate.host/latest?base=${base}&symbols=${symbols}`);
      if (!res.ok) throw new Error('Rate fetch failed');
      const data = await res.json();
      const result = { [base]: 1 };
      CURRENCIES.forEach((c) => {
        if (c.code === base) return;
        result[c.code] = data.rates[c.code] ?? 1;
      });
      return result;
    } catch (e) {
      return getDefaultRates(base);
    }
  }
}

// DOM setup
function populateCurrencySelect(el, selected) {
  el.innerHTML = '';
  CURRENCIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = `${c.code}`;
    if (c.code === selected) opt.selected = true;
    el.appendChild(opt);
  });
}

function renderRatesList(user) {
  const container = $('#rates-list');
  container.innerHTML = '';
  CURRENCIES.forEach((c) => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = `${c.code}`;
    label.className = 'muted';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.0001';
    input.min = '0';
    input.value = String(user.rates?.[c.code] ?? (c.code === user.baseCurrency ? 1 : 1));
    input.addEventListener('input', () => {
      if (!user.rates) user.rates = {};
      user.rates[c.code] = Number(input.value) || 0;
    });
    wrap.appendChild(label);
    wrap.appendChild(input);
    container.appendChild(wrap);
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (_) {
    return dateStr;
  }
}

function renderStats() {
  const tx = currentUser.transactions || [];
  let spentBase = 0;
  let netBase = 0;

  tx.forEach((t) => {
    const buyBase = t.buyPriceBase;
    const sellBase = t.sellPriceBase || 0;
    spentBase += buyBase;
    netBase += (sellBase - buyBase);
  });

  const disp = $('#display-currency').value || currentUser.displayCurrency || currentUser.baseCurrency;
  $('#stat-spent').textContent = formatMoney(fromBase(spentBase, disp, currentUser), disp);
  
  const netCard = $('#stat-net-card');
  const netValue = $('#stat-net');
  const netDisp = fromBase(netBase, disp, currentUser);
  netValue.textContent = formatMoney(netDisp, disp);
  if (netDisp >= 0) {
    netCard.classList.add('positive');
    netCard.classList.remove('negative');
  } else {
    netCard.classList.add('negative');
    netCard.classList.remove('positive');
  }

  const pct = spentBase > 0 ? (netBase / spentBase) * 100 : 0;
  $('#stat-profit-pct').textContent = `${pct.toFixed(2)}%`;
}

function renderTable() {
  const tbody = $('#tx-tbody');
  tbody.innerHTML = '';
  const query = ($('#search').value || '').toLowerCase();
  const disp = $('#display-currency').value || currentUser.displayCurrency || currentUser.baseCurrency;

  const rows = (currentUser.transactions || [])
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date))
    .filter((t) => {
      if (!query) return true;
      return [t.itemName, t.notes, t.type].some((v) => (v || '').toLowerCase().includes(query));
    });

  rows.forEach((t) => {
    const tr = document.createElement('tr');
    const buyDisp = fromBase(t.buyPriceBase, disp, currentUser);
    const sellDisp = fromBase(t.sellPriceBase || 0, disp, currentUser);
    const diffDisp = sellDisp - buyDisp;
    const pct = t.buyPriceBase > 0 ? ((t.sellPriceBase || 0) - t.buyPriceBase) / t.buyPriceBase * 100 : 0;

    tr.innerHTML = `
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.itemName)}</td>
      <td><span class="chip">${escapeHtml(t.type)}</span></td>
      <td>${formatMoney(buyDisp, disp)}</td>
      <td>${t.sellPriceBase ? formatMoney(sellDisp, disp) : '—'}</td>
      <td class="money ${diffDisp >= 0 ? 'pos' : 'neg'}">${t.sellPriceBase ? formatMoney(diffDisp, disp) : '—'}</td>
      <td>${t.sellPriceBase ? pct.toFixed(2) + '%' : '—'}</td>
      <td>${escapeHtml(t.notes || '')}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" data-id="${t.id}">Edit</button>
          <button class="icon-btn" data-action="delete" data-id="${t.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return (s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function persistUser(user) {
  const users = readUsers();
  users[user.username] = user;
  writeUsers(users);
}

function loadUser(username) {
  const users = readUsers();
  return users[username] || null;
}

function showAppView(show) {
  if (show) {
    $('#auth-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
  } else {
    $('#auth-view').classList.remove('hidden');
    $('#app-view').classList.add('hidden');
  }
}

function renderUserContext() {
  $('#welcome-user').textContent = `Welcome, ${currentUser.username}`;
  populateCurrencySelect($('#display-currency'), currentUser.displayCurrency || currentUser.baseCurrency);
  populateCurrencySelect($('#base-currency'), currentUser.baseCurrency);
  populateCurrencySelect($('#tx-currency'), currentUser.baseCurrency);
  renderRatesList(currentUser);
  renderStats();
  renderTable();
}

// Auth logic
function bindAuth() {
  const tabLogin = $('#tab-login');
  const tabSignup = $('#tab-signup');
  const loginForm = $('#login-form');
  const signupForm = $('#signup-form');
  const loginErr = $('#login-error');
  const signupErr = $('#signup-error');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.classList.add('visible');
    signupForm.classList.remove('visible');
  });
  tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    signupForm.classList.add('visible');
    loginForm.classList.remove('visible');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErr.textContent = '';
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    const user = loadUser(username);
    if (!user) { loginErr.textContent = 'User not found.'; return; }
    const hash = await sha256Hex(user.salt + ':' + password);
    if (hash !== user.passwordHash) { loginErr.textContent = 'Invalid credentials.'; return; }
    currentUser = user;
    if (!currentUser.displayCurrency) currentUser.displayCurrency = currentUser.baseCurrency;
    setSession(username);
    showAppView(true);
    renderUserContext();
    // Try refreshing rates silently
    tryRefreshRates();
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupErr.textContent = '';
    const username = $('#signup-username').value.trim();
    const password = $('#signup-password').value;
    const baseCurrency = $('#signup-currency').value;
    if (!username || !password) { signupErr.textContent = 'Enter username and password.'; return; }
    const users = readUsers();
    if (users[username]) { signupErr.textContent = 'Username already exists.'; return; }
    const salt = randomSalt();
    const passwordHash = await sha256Hex(salt + ':' + password);
    const user = {
      username,
      salt,
      passwordHash,
      baseCurrency,
      displayCurrency: baseCurrency,
      rates: getDefaultRates(baseCurrency),
      transactions: [],
    };
    users[username] = user;
    writeUsers(users);
    currentUser = user;
    setSession(username);
    showAppView(true);
    renderUserContext();
    tryRefreshRates();
  });
}

async function tryRefreshRates() {
  try {
    const rates = await fetchRates(currentUser.baseCurrency);
    currentUser.rates = { ...currentUser.rates, ...rates };
    persistUser(currentUser);
    renderRatesList(currentUser);
    renderStats();
    renderTable();
  } catch (_) {
    // ignore
  }
}

// App bindings
function bindApp() {
  $('#logout').addEventListener('click', () => {
    clearSession();
    currentUser = null;
    showAppView(false);
  });

  $('#open-settings').addEventListener('click', () => {
    $('#base-currency').value = currentUser.baseCurrency;
    renderRatesList(currentUser);
    $('#settings-modal').showModal();
  });

  $('#save-settings').addEventListener('click', (e) => {
    e.preventDefault();
    const newBase = $('#base-currency').value;
    if (newBase !== currentUser.baseCurrency) {
      // When base changes, recompute stored base amounts: since rates are relative to old base, we need to transform
      const oldBase = currentUser.baseCurrency;
      const r = currentUser.rates || {};
      const factor = (r[newBase] && r[oldBase]) ? (1 / (r[newBase])) : 1; // convert old base -> new base
      currentUser.transactions = (currentUser.transactions || []).map((t) => ({
        ...t,
        buyPriceBase: t.buyPriceBase * factor,
        sellPriceBase: (t.sellPriceBase || 0) * factor,
      }));
      // Rebase rates so that new base is 1 and others adjusted
      const newRates = { [newBase]: 1 };
      CURRENCIES.forEach((c) => {
        if (c.code === newBase) return;
        // if r[c] is price of c per oldBase, and factor converts oldBase->newBase, then rate wrt new base is r[c] * factor
        newRates[c.code] = (r[c.code] || 1) * factor;
      });
      currentUser.rates = newRates;
      currentUser.baseCurrency = newBase;
      if (!currentUser.displayCurrency) currentUser.displayCurrency = newBase;
      populateCurrencySelect($('#tx-currency'), currentUser.baseCurrency);
      populateCurrencySelect($('#base-currency'), currentUser.baseCurrency);
    }
    persistUser(currentUser);
    $('#settings-modal').close();
    renderStats();
    renderTable();
  });

  $('#refresh-rates').addEventListener('click', async () => {
    const btn = $('#refresh-rates');
    const prev = btn.textContent;
    btn.textContent = 'Refreshing…';
    btn.disabled = true;
    const rates = await fetchRates(currentUser.baseCurrency);
    currentUser.rates = { ...currentUser.rates, ...rates };
    persistUser(currentUser);
    renderRatesList(currentUser);
    renderStats();
    renderTable();
    btn.textContent = prev;
    btn.disabled = false;
  });

  $('#display-currency').addEventListener('change', () => {
    currentUser.displayCurrency = $('#display-currency').value;
    persistUser(currentUser);
    renderStats();
    renderTable();
  });

  $('#search').addEventListener('input', () => {
    renderTable();
  });

  $('#tx-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = $('#tx-date').value;
    const itemName = $('#tx-item').value.trim();
    const type = $('#tx-type').value;
    const buy = Number($('#tx-buy').value || 0);
    const sell = Number($('#tx-sell').value || 0);
    const notes = $('#tx-notes').value.trim();
    const currency = $('#tx-currency').value || currentUser.baseCurrency;

    const buyBase = toBase(buy, currency, currentUser);
    const sellBase = sell ? toBase(sell, currency, currentUser) : 0;

    const tx = { id: uid(), date, itemName, type, notes, buyPriceBase: buyBase, sellPriceBase: sell ? sellBase : null };
    currentUser.transactions.push(tx);
    persistUser(currentUser);
    renderStats();
    renderTable();
    $('#tx-form').reset();
  });

  // Row actions (edit/delete)
  $('#tx-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'delete') {
      currentUser.transactions = currentUser.transactions.filter((t) => t.id !== id);
      persistUser(currentUser);
      renderStats();
      renderTable();
    } else if (action === 'edit') {
      const t = currentUser.transactions.find((x) => x.id === id);
      if (!t) return;
      // Prefill form in display currency for convenience
      const disp = $('#tx-currency').value || currentUser.baseCurrency;
      $('#tx-date').value = t.date || '';
      $('#tx-item').value = t.itemName || '';
      $('#tx-type').value = t.type || 'Case';
      $('#tx-notes').value = t.notes || '';
      const buyDisp = convertAmount(t.buyPriceBase, currentUser.baseCurrency, disp, currentUser.rates, currentUser.baseCurrency);
      const sellDisp = t.sellPriceBase ? convertAmount(t.sellPriceBase, currentUser.baseCurrency, disp, currentUser.rates, currentUser.baseCurrency) : 0;
      $('#tx-buy').value = String(buyDisp.toFixed(2));
      $('#tx-sell').value = t.sellPriceBase ? String(sellDisp.toFixed(2)) : '';
      $('#tx-currency').value = disp;
      // Replace submit handler once to update
      const form = $('#tx-form');
      const handler = (ev) => {
        ev.preventDefault();
        const date = $('#tx-date').value;
        const itemName = $('#tx-item').value.trim();
        const type = $('#tx-type').value;
        const buy = Number($('#tx-buy').value || 0);
        const sell = Number($('#tx-sell').value || 0);
        const notes = $('#tx-notes').value.trim();
        const currency = $('#tx-currency').value || currentUser.baseCurrency;
        t.date = date; t.itemName = itemName; t.type = type; t.notes = notes;
        t.buyPriceBase = toBase(buy, currency, currentUser);
        t.sellPriceBase = $('#tx-sell').value ? toBase(sell, currency, currentUser) : null;
        persistUser(currentUser);
        renderStats();
        renderTable();
        form.reset();
        form.removeEventListener('submit', handler);
        form.addEventListener('submit', defaultAddHandler, { once: true });
      };
      const defaultAddHandler = (ev) => {};
      // Temporarily override default by removing and adding once
      form.addEventListener('submit', handler, { once: true });
    }
  });

  // Export / Import
  $('#export-json').addEventListener('click', () => {
    const data = JSON.stringify({
      username: currentUser.username,
      baseCurrency: currentUser.baseCurrency,
      displayCurrency: currentUser.displayCurrency,
      rates: currentUser.rates,
      transactions: currentUser.transactions,
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cs2pl-${currentUser.username}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('#import-json').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data.transactions)) throw new Error('Invalid file');
      currentUser.transactions = data.transactions.map((t) => ({
        id: t.id || uid(),
        date: t.date || '',
        itemName: t.itemName || '',
        type: t.type || 'Case',
        notes: t.notes || '',
        buyPriceBase: Number(t.buyPriceBase || 0),
        sellPriceBase: t.sellPriceBase != null ? Number(t.sellPriceBase) : null,
      }));
      if (data.baseCurrency && CURRENCIES.some((c) => c.code === data.baseCurrency)) currentUser.baseCurrency = data.baseCurrency;
      if (data.displayCurrency && CURRENCIES.some((c) => c.code === data.displayCurrency)) currentUser.displayCurrency = data.displayCurrency;
      if (data.rates) currentUser.rates = { ...currentUser.rates, ...data.rates };
      persistUser(currentUser);
      renderUserContext();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  // Typeahead for item name
  bindItemTypeahead();
}

function boot() {
  bindAuth();
  bindApp();
  // Restore session
  const session = getSession();
  if (session?.username) {
    const user = loadUser(session.username);
    if (user) {
      currentUser = user;
      showAppView(true);
      renderUserContext();
      tryRefreshRates();
      return;
    }
  }
  // default to auth view state
  $('#tab-login').click();
}

document.addEventListener('DOMContentLoaded', boot);

// =================== Typeahead ===================
function bindItemTypeahead() {
  const input = $('#tx-item');
  const box = $('#item-suggest');
  let lastQuery = '';
  let pending = 0;

  function hide() { box.classList.add('hidden'); box.innerHTML = ''; }
  function show(items, source = '') {
    if (!items || items.length === 0) { hide(); return; }
    box.innerHTML = '';
    items.slice(0, 30).forEach((name) => {
      const row = document.createElement('div');
      row.className = 'row';
      const title = document.createElement('div');
      title.className = 'name';
      title.textContent = name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = source || 'CS2';
      row.appendChild(title);
      row.appendChild(meta);
      row.addEventListener('click', () => {
        input.value = name;
        hide();
      });
      box.appendChild(row);
    });
    box.classList.remove('hidden');
  }

  const debounced = debounce(async () => {
    const q = input.value.trim();
    if (!q || q.length < 1) { hide(); return; }
    lastQuery = q;
    const myTurn = ++pending;
    const allResults = new Set();
    
    // Try CSFloat API (may be blocked by CORS, but worth trying)
    try {
      const csFloatUrl = `https://csfloat.com/api/v1/listings?market_hash_name=${encodeURIComponent(q)}&limit=50`;
      const csFloatRes = await fetch(csFloatUrl, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors'
      });
      if (csFloatRes.ok) {
        const csFloatData = await csFloatRes.json();
        if (Array.isArray(csFloatData) && csFloatData.length > 0) {
          csFloatData.forEach((item) => {
            if (item.market_hash_name) allResults.add(item.market_hash_name);
          });
        }
      }
    } catch (_) {
      // CSFloat likely blocked by CORS, continue with Steam
    }

    // Try Steam Community Market search (appid 730) - more generous with multiple attempts
    try {
      // Try exact match first
      let url = `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=100&query=${encodeURIComponent(q)}`;
      let res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        const results = (data?.results || []).map((r) => r.hash_name || r.name).filter(Boolean);
        results.forEach((r) => allResults.add(r));
      }
      
      // If query has multiple words, try partial matches
      const words = q.split(/\s+/).filter(w => w.length > 2);
      if (words.length > 1 && allResults.size < 10) {
        for (const word of words.slice(0, 2)) {
          url = `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=50&query=${encodeURIComponent(word)}`;
          res = await fetch(url, { method: 'GET' });
          if (res.ok) {
            const data = await res.json();
            const results = (data?.results || []).map((r) => r.hash_name || r.name).filter(Boolean);
            results.forEach((r) => {
              if (r.toLowerCase().includes(q.toLowerCase())) {
                allResults.add(r);
              }
            });
          }
        }
      }
    } catch (_) {
      // Steam failed, continue with fallbacks
    }

    if (myTurn !== pending) return; // outdated

    // Combine with local fallback
    const local = localFallback(q);
    local.forEach((n) => allResults.add(n));

    // Also try fuzzy matching from local list
    const fuzzy = fuzzyMatchLocal(q);
    fuzzy.forEach((n) => allResults.add(n));

    if (allResults.size > 0) {
      show(Array.from(allResults), allResults.size > local.length ? 'Steam Market / CSFloat' : 'Local');
      return;
    }

    // Last resort: show local matches
    show(local.length > 0 ? local : [], 'Local');
  }, 150);

  input.addEventListener('input', debounced);
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 1) debounced();
  });
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target) && e.target !== input) hide();
  });

  function localFallback(q) {
    const lq = q.toLowerCase();
    return LOCAL_ITEM_FALLBACK.filter((n) => n.toLowerCase().includes(lq));
  }

  function fuzzyMatchLocal(q) {
    const lq = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (lq.length === 0) return [];
    return LOCAL_ITEM_FALLBACK.filter((n) => {
      const nl = n.toLowerCase();
      return lq.some((term) => nl.includes(term));
    });
  }
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}


