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

// API configuration
const API_BASE = window.location.origin;

// API helper functions
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  
  return response.json();
}

async function getAuthUser() {
  try {
    const data = await apiRequest('/auth/user');
    return data;
  } catch (err) {
    return { user: null, authenticated: false };
  }
}

async function getUserData() {
  try {
    const data = await apiRequest('/api/user/data');
    return data.user;
  } catch (err) {
    console.error('Failed to load user data:', err);
    return null;
  }
}

async function saveUserData(userData) {
  try {
    const data = await apiRequest('/api/user/data', {
      method: 'POST',
      body: JSON.stringify({ userData }),
    });
    return data.user;
  } catch (err) {
    console.error('Failed to save user data:', err);
    throw err;
  }
}

async function logout() {
  try {
    await apiRequest('/auth/logout');
    return true;
  } catch (err) {
    console.error('Logout failed:', err);
    return false;
  }
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

async function persistUser(user) {
  try {
    const updatedUser = await saveUserData(user);
    return updatedUser;
  } catch (err) {
    console.error('Failed to persist user:', err);
    throw err;
  }
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

// Auth logic - Steam authentication is handled server-side
async function checkAuth() {
  try {
    const authData = await getAuthUser();
    if (authData.authenticated && authData.user) {
      // Load full user data including transactions
      const userData = await getUserData();
      if (userData) {
        currentUser = userData;
        if (!currentUser.displayCurrency) {
          currentUser.displayCurrency = currentUser.baseCurrency || 'USD';
        }
        if (!currentUser.rates) {
          currentUser.rates = getDefaultRates(currentUser.baseCurrency || 'USD');
        }
        if (!currentUser.transactions) {
          currentUser.transactions = [];
        }
        showAppView(true);
        renderUserContext();
        tryRefreshRates();
        return true;
      }
    }
    showAppView(false);
    return false;
  } catch (err) {
    console.error('Auth check failed:', err);
    showAppView(false);
    return false;
  }
}

async function tryRefreshRates() {
  try {
    const rates = await fetchRates(currentUser.baseCurrency);
    currentUser.rates = { ...currentUser.rates, ...rates };
    await persistUser(currentUser);
    renderRatesList(currentUser);
    renderStats();
    renderTable();
  } catch (_) {
    // ignore
  }
}

// App bindings
function bindApp() {
  $('#logout').addEventListener('click', async () => {
    await logout();
    currentUser = null;
    showAppView(false);
    // Reload to clear any cached state
    window.location.reload();
  });

  $('#open-settings').addEventListener('click', () => {
    $('#base-currency').value = currentUser.baseCurrency;
    renderRatesList(currentUser);
    $('#settings-modal').showModal();
  });

  $('#save-settings').addEventListener('click', async (e) => {
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
    await persistUser(currentUser);
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
    await persistUser(currentUser);
    renderRatesList(currentUser);
    renderStats();
    renderTable();
    btn.textContent = prev;
    btn.disabled = false;
  });

  $('#display-currency').addEventListener('change', async () => {
    currentUser.displayCurrency = $('#display-currency').value;
    await persistUser(currentUser);
    renderStats();
    renderTable();
  });

  $('#search').addEventListener('input', () => {
    renderTable();
  });

  $('#tx-form').addEventListener('submit', async (e) => {
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
    await persistUser(currentUser);
    renderStats();
    renderTable();
    $('#tx-form').reset();
  });

  // Row actions (edit/delete)
  $('#tx-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'delete') {
      currentUser.transactions = currentUser.transactions.filter((t) => t.id !== id);
      await persistUser(currentUser);
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
      const handler = async (ev) => {
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
        await persistUser(currentUser);
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
      await persistUser(currentUser);
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

async function boot() {
  bindApp();
  // Check authentication status
  await checkAuth();
}

document.addEventListener('DOMContentLoaded', boot);

// =================== Typeahead ===================
function bindItemTypeahead() {
  const input = $('#tx-item');
  const box = $('#item-suggest');
  let lastQuery = '';
  let pending = 0;
  let abortController = null;

  function hide() { 
    box.classList.add('hidden'); 
    box.innerHTML = ''; 
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  function show(items, source = '') {
    if (!items || items.length === 0) { 
      hide(); 
      return; 
    }
    box.innerHTML = '';
    items.slice(0, 30).forEach((name) => {
      const row = document.createElement('div');
      row.className = 'row';
      const title = document.createElement('div');
      title.className = 'name';
      title.textContent = name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = source || 'Steam Market';
      row.appendChild(title);
      row.appendChild(meta);
      row.addEventListener('click', () => {
        input.value = name;
        hide();
        input.focus();
      });
      box.appendChild(row);
    });
    box.classList.remove('hidden');
  }

  async function searchSteamMarket(query) {
    const results = new Set();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
    
    try {
      // Primary search using Steam Community Market API
      const url = `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=100&query=${encodeURIComponent(query)}`;
      const res = await fetch(url, { 
        method: 'GET',
        signal: abortController?.signal
      });
      
      if (!res.ok) throw new Error('Steam API request failed');
      
      const data = await res.json();
      if (data && data.results && Array.isArray(data.results)) {
        data.results.forEach((item) => {
          const name = item.hash_name || item.name;
          if (name && typeof name === 'string') {
            const nameLower = name.toLowerCase();
            // Only add if it contains ALL query words
            if (queryWords.every(word => nameLower.includes(word))) {
              results.add(name);
            }
          }
        });
      }
      
      // For multi-word searches, also try searching individual significant words
      // This helps find items like "Glock-18 | Mirror Mosaic" when searching "mirror mosaic glock"
      if (queryWords.length > 1 && results.size < 30) {
        const significantWords = queryWords.filter(w => w.length >= 3);
        for (const word of significantWords.slice(0, 2)) { // Limit to avoid too many requests
          try {
            const wordUrl = `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=50&query=${encodeURIComponent(word)}`;
            const wordRes = await fetch(wordUrl, { 
              method: 'GET',
              signal: abortController?.signal
            });
            if (wordRes.ok) {
              const wordData = await wordRes.json();
              if (wordData && wordData.results && Array.isArray(wordData.results)) {
                wordData.results.forEach((item) => {
                  const name = item.hash_name || item.name;
                  if (name && typeof name === 'string') {
                    const nameLower = name.toLowerCase();
                    // Only add if it contains ALL words from the original query
                    if (queryWords.every(w => nameLower.includes(w))) {
                      results.add(name);
                    }
                  }
                });
              }
            }
          } catch (_) {
            // Ignore individual word search errors
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return null; // Request was cancelled
      }
      // API failed, will fall back to local
    }
    
    return results.size > 0 ? Array.from(results) : null;
  }

  const debounced = debounce(async () => {
    const q = input.value.trim();
    if (!q || q.length < 1) { 
      hide(); 
      return; 
    }
    
    if (q === lastQuery) return; // Skip duplicate queries
    lastQuery = q;
    
    // Cancel previous request if still pending
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();
    
    const myTurn = ++pending;
    const allResults = new Set();
    const qLower = q.toLowerCase();
    const queryWords = qLower.split(/\s+/).filter(w => w.length > 0);
    
    // Try Steam Market API first
    const steamResults = await searchSteamMarket(q);
    
    if (myTurn !== pending) return; // Outdated request
    
    if (steamResults && steamResults.length > 0) {
      // Double-check all Steam results contain all query words
      steamResults.forEach((name) => {
        const nameLower = name.toLowerCase();
        if (queryWords.every(word => nameLower.includes(word))) {
          allResults.add(name);
        }
      });
    }
    
    // Local fallback - only add items that contain ALL query words
    const local = LOCAL_ITEM_FALLBACK.filter((n) => {
      const nLower = n.toLowerCase();
      return queryWords.every(word => nLower.includes(word));
    });
    local.forEach((name) => allResults.add(name));
    
    if (allResults.size > 0) {
      const sortedResults = Array.from(allResults).sort((a, b) => {
        // Prioritize exact matches, then items starting with query
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        const qLower = q.toLowerCase();
        const aStarts = aLower.startsWith(qLower);
        const bStarts = bLower.startsWith(qLower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        // Then prioritize items where query appears earlier
        const aIndex = aLower.indexOf(qLower);
        const bIndex = bLower.indexOf(qLower);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.localeCompare(b);
      });
      
      const source = steamResults && steamResults.length > 0 ? 'Steam Market' : 'Local';
      show(sortedResults, source);
    } else {
      hide();
    }
  }, 250);

  input.addEventListener('input', () => {
    debounced();
  });
  
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 1) {
      debounced();
    }
  });
  
  input.addEventListener('blur', (e) => {
    // Delay hide to allow click on suggestions
    setTimeout(() => {
      if (!box.contains(document.activeElement)) {
        hide();
      }
    }, 200);
  });
  
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target) && e.target !== input) {
      hide();
    }
  });
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}


