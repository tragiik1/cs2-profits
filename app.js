// Utilities
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const CURRENCIES = [
  { code: 'AUD', symbol: 'A$', locale: 'en-AU' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
];

const LOCAL_ITEM_FALLBACK = [
  'Kilowatt Case', 'Dreams & Nightmares Case', 'Revolution Case', 'Fracture Case',
  'Prisma 2 Case', 'Clutch Case', 'AK-47 | Redline (Field-Tested)',
  'AK-47 | Slate (Factory New)', 'M4A1-S | Printstream (Field-Tested)',
  'AWP | Asiimov (Field-Tested)', 'AWP | Dragon Lore (Factory New)',
  'Desert Eagle | Printstream (Minimal Wear)', 'USP-S | Kill Confirmed (Field-Tested)',
  'Glock-18 | Fade (Factory New)', 'Butterfly Knife | Marble Fade (Factory New)',
  'Operation Riptide Case', 'Sticker | Crown (Foil)',
  'Sticker | Cloud9 (Holo) | Katowice 2014', 'Sticker | Vitality (Holo) | Paris 2023',
];

const STORAGE_KEY_SESSIONS = 'cs2pl_sessions';
const STORAGE_KEY_CURRENT_SESSION = 'cs2pl_current_session';
const STORAGE_KEY_SETTINGS = 'cs2pl_settings';

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function formatMoney(amount, code) {
  const curr = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
  return new Intl.NumberFormat(curr.locale, { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount || 0);
}
function getDefaultRates(base) {
  const obj = {}; CURRENCIES.forEach((c) => { obj[c.code] = c.code === base ? 1 : 1; }); return obj;
}
function getDefaultSettings() { return { baseCurrency: 'USD', displayCurrency: 'USD', rates: getDefaultRates('USD') }; }

function loadSessions() { try { const d = localStorage.getItem(STORAGE_KEY_SESSIONS); return d ? JSON.parse(d) : {}; } catch (e) { return {}; } }
function saveSessions(sessions) { localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions)); }
function loadCurrentSessionId() { return localStorage.getItem(STORAGE_KEY_CURRENT_SESSION); }
function saveCurrentSessionId(id) { localStorage.setItem(STORAGE_KEY_CURRENT_SESSION, id); }
function loadSettings() { try { const d = localStorage.getItem(STORAGE_KEY_SETTINGS); return d ? JSON.parse(d) : getDefaultSettings(); } catch (e) { return getDefaultSettings(); } }
function saveSettings(s) { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(s)); }
function getSession(id) { const s = loadSessions(); return s[id] || null; }
function saveSession(id, data) { const s = loadSessions(); s[id] = data; saveSessions(s); }
function createSession(name, type = 'General') { const id = uid(); const s = { id, name, type, transactions: [], createdAt: new Date().toISOString() }; saveSession(id, s); return s; }
function getAllSessions() { return loadSessions(); }

let currentSession = null;
let settings = null;

function convertAmount(amountInBase, fromCode, toCode, rates, baseCurrency) {
  if (!rates || !amountInBase) return 0;
  if (fromCode === baseCurrency && toCode in rates) return amountInBase * rates[toCode];
  if (toCode === baseCurrency && fromCode in rates && rates[fromCode] !== 0) return amountInBase / rates[fromCode];
  if (fromCode in rates && toCode in rates && rates[fromCode] !== 0) { const inBase = amountInBase / rates[fromCode]; return inBase * rates[toCode]; }
  return amountInBase;
}
function toBase(amount, inputCurrency) { if (inputCurrency === settings.baseCurrency) return amount; if (!settings.rates || !settings.rates[inputCurrency] || settings.rates[inputCurrency] === 0) return amount; return amount / settings.rates[inputCurrency]; }
function fromBase(amountBase, displayCurrency) { if (displayCurrency === settings.baseCurrency) return amountBase; if (!settings.rates || !settings.rates[displayCurrency]) return amountBase; return amountBase * settings.rates[displayCurrency]; }

async function fetchRates(base) {
  try {
    const symbols = CURRENCIES.map((c) => c.code).join(',');
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${symbols}`);
    if (!res.ok) throw new Error('Rate fetch failed');
    const data = await res.json();
    const result = { [base]: 1 };
    CURRENCIES.forEach((c) => { if (c.code !== base) result[c.code] = data.rates[c.code] ?? 1; });
    return result;
  } catch (_) {
    try {
      const symbols = CURRENCIES.map((c) => c.code).join(',');
      const res = await fetch(`https://api.exchangerate.host/latest?base=${base}&symbols=${symbols}`);
      if (!res.ok) throw new Error('Rate fetch failed');
      const data = await res.json();
      const result = { [base]: 1 };
      CURRENCIES.forEach((c) => { if (c.code !== base) result[c.code] = data.rates[c.code] ?? 1; });
      return result;
    } catch (e) { return getDefaultRates(base); }
  }
}

function populateCurrencySelect(el, selected) {
  el.innerHTML = '';
  CURRENCIES.forEach((c) => { const opt = document.createElement('option'); opt.value = c.code; opt.textContent = c.code; if (c.code === selected) opt.selected = true; el.appendChild(opt); });
}

function renderRatesList() {
  const container = $('#rates-list');
  container.innerHTML = '';
  CURRENCIES.forEach((c) => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = c.code;
    label.className = 'muted';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.0001';
    input.min = '0';
    input.value = String(settings.rates?.[c.code] ?? (c.code === settings.baseCurrency ? 1 : 1));
    input.addEventListener('input', () => { if (!settings.rates) settings.rates = {}; settings.rates[c.code] = Number(input.value) || 0; });
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
    return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
  } catch (_) { return dateStr; }
}

function renderStats() {
  if (!currentSession) return;
  const tx = currentSession.transactions || [];
  let spentBase = 0, netBase = 0;
  tx.forEach((t) => { spentBase += t.buyPriceBase; netBase += (t.sellPriceBase || 0) - t.buyPriceBase; });
  const disp = $('#display-currency').value || settings.displayCurrency || settings.baseCurrency;
  $('#stat-spent').textContent = formatMoney(fromBase(spentBase, disp), disp);
  const netCard = $('#stat-net-card'), netValue = $('#stat-net'), netDisp = fromBase(netBase, disp);
  netValue.textContent = formatMoney(netDisp, disp);
  if (netDisp >= 0) { netCard.classList.add('positive'); netCard.classList.remove('negative'); } else { netCard.classList.add('negative'); netCard.classList.remove('positive'); }
  const pct = spentBase > 0 ? (netBase / spentBase) * 100 : 0;
  $('#stat-profit-pct').textContent = `${pct.toFixed(2)}%`;
}

function renderTable() {
  if (!currentSession) return;
  const tbody = $('#tx-tbody');
  tbody.innerHTML = '';
  const query = ($('#search').value || '').toLowerCase();
  const disp = $('#display-currency').value || settings.displayCurrency || settings.baseCurrency;
  const rows = (currentSession.transactions || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date)).filter((t) => {
    if (!query) return true;
    const searchText = [t.itemName || '', t.notes || '', t.type || '', t.tradeupReds ? t.tradeupReds.join(' ') : ''].join(' ').toLowerCase();
    return searchText.includes(query);
  });
  rows.forEach((t) => {
    const tr = document.createElement('tr');
    const buyDisp = fromBase(t.buyPriceBase, disp), sellDisp = fromBase(t.sellPriceBase || 0, disp), diffDisp = sellDisp - buyDisp;
    const pct = t.buyPriceBase > 0 ? ((t.sellPriceBase || 0) - t.buyPriceBase) / t.buyPriceBase * 100 : 0;
    let itemDisplay = escapeHtml(t.itemName || '');
    if (t.type === 'Trade-up' && t.tradeupReds && t.tradeupReds.length > 0) itemDisplay = `${itemDisplay} (${t.tradeupReds.length} reds)`;
    tr.innerHTML = `<td>${formatDate(t.date)}</td><td>${itemDisplay}</td><td><span class="chip">${escapeHtml(t.type)}</span></td><td>${formatMoney(buyDisp, disp)}</td><td>${t.sellPriceBase ? formatMoney(sellDisp, disp) : '—'}</td><td class="money ${diffDisp >= 0 ? 'pos' : 'neg'}">${t.sellPriceBase ? formatMoney(diffDisp, disp) : '—'}</td><td>${t.sellPriceBase ? pct.toFixed(2) + '%' : '—'}</td><td>${escapeHtml(t.notes || '')}</td><td><div class="row-actions"><button class="icon-btn" data-action="edit" data-id="${t.id}">Edit</button><button class="icon-btn" data-action="delete" data-id="${t.id}">Delete</button></div></td>`;
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return (s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function renderSessionSelector() {
  const selector = $('#session-selector');
  selector.innerHTML = '';
  const sessions = getAllSessions();
  const sessionIds = Object.keys(sessions);
  if (sessionIds.length === 0) { selector.innerHTML = '<option value="">No sessions</option>'; return; }
  sessionIds.forEach((id) => { const session = sessions[id]; const opt = document.createElement('option'); opt.value = id; opt.textContent = session.name || 'Unnamed Session'; if (currentSession && id === currentSession.id) opt.selected = true; selector.appendChild(opt); });
}

function renderSessionContext() {
  if (!currentSession) { $('#session-name').textContent = 'No session selected'; return; }
  $('#session-name').textContent = currentSession.name || 'Unnamed Session';
  populateCurrencySelect($('#display-currency'), settings.displayCurrency || settings.baseCurrency);
  populateCurrencySelect($('#base-currency'), settings.baseCurrency);
  populateCurrencySelect($('#tx-currency'), settings.baseCurrency);
  renderRatesList();
  renderStats();
  renderTable();
  renderSessionSelector();
}

function switchSession(sessionId) {
  if (!sessionId) return;
  const session = getSession(sessionId);
  if (!session) return;
  currentSession = session;
  saveCurrentSessionId(sessionId);
  renderSessionContext();
}

function toggleTradeupFields(show) {
  const regularFields = $('#regular-fields'), tradeupFields = $('#tradeup-fields');
  if (show) { regularFields.classList.add('hidden'); tradeupFields.classList.remove('hidden'); $('#tradeup-reds').required = true; $('#tx-item').required = false; }
  else { regularFields.classList.remove('hidden'); tradeupFields.classList.add('hidden'); $('#tradeup-reds').required = false; $('#tx-item').required = true; }
}

async function searchSteamMarket(query, abortController) {
  const results = new Set();
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
  try {
    const url = `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=100&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { method: 'GET', signal: abortController?.signal });
    if (!res.ok) throw new Error('Steam API request failed');
    const data = await res.json();
    if (data && data.results && Array.isArray(data.results)) {
      data.results.forEach((item) => {
        const name = item.hash_name || item.name;
        if (name && typeof name === 'string') {
          const nameLower = name.toLowerCase();
          if (queryWords.every(word => nameLower.includes(word))) results.add(name);
        }
      });
    }
    if (queryWords.length > 1 && results.size < 30) {
      const significantWords = queryWords.filter(w => w.length >= 3);
      for (const word of significantWords.slice(0, 2)) {
        try {
          const wordUrl = `https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=50&query=${encodeURIComponent(word)}`;
          const wordRes = await fetch(wordUrl, { method: 'GET', signal: abortController?.signal });
          if (wordRes.ok) {
            const wordData = await wordRes.json();
            if (wordData && wordData.results && Array.isArray(wordData.results)) {
              wordData.results.forEach((item) => {
                const name = item.hash_name || item.name;
                if (name && typeof name === 'string') {
                  const nameLower = name.toLowerCase();
                  if (queryWords.every(w => nameLower.includes(w))) results.add(name);
                }
              });
            }
          }
        } catch (_) {}
      }
    }
  } catch (err) { if (err.name === 'AbortError') return null; }
  return results.size > 0 ? Array.from(results) : null;
}

function bindTypeahead(inputId, suggestId) {
  const input = $(inputId);
  if (!input) return;
  const box = $(suggestId);
  let lastQuery = '', pending = 0, abortController = null;

  function hide() {
    if (box) box.classList.add('hidden');
    if (box) box.innerHTML = '';
    if (abortController) { abortController.abort(); abortController = null; }
  }

  function show(items, source = '') {
    if (!box) return;
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
      meta.textContent = source || 'Steam Market';
      row.appendChild(title);
      row.appendChild(meta);
      row.addEventListener('click', () => { input.value = name; hide(); input.focus(); });
      box.appendChild(row);
    });
    box.classList.remove('hidden');
  }

  const debounced = debounce(async () => {
    const q = input.value.trim();
    if (!q || q.length < 1) { hide(); return; }
    if (q === lastQuery) return;
    lastQuery = q;
    if (abortController) abortController.abort();
    abortController = new AbortController();
    const myTurn = ++pending;
    const allResults = new Set();
    const qLower = q.toLowerCase();
    const queryWords = qLower.split(/\s+/).filter(w => w.length > 0);
    const steamResults = await searchSteamMarket(q, abortController);
    if (myTurn !== pending) return;
    if (steamResults && steamResults.length > 0) {
      steamResults.forEach((name) => {
        const nameLower = name.toLowerCase();
        if (queryWords.every(word => nameLower.includes(word))) allResults.add(name);
      });
    }
    const local = LOCAL_ITEM_FALLBACK.filter((n) => {
      const nLower = n.toLowerCase();
      return queryWords.every(word => nLower.includes(word));
    });
    local.forEach((name) => allResults.add(name));
    if (allResults.size > 0) {
      const sortedResults = Array.from(allResults).sort((a, b) => {
        const aLower = a.toLowerCase(), bLower = b.toLowerCase(), qLower = q.toLowerCase();
        const aStarts = aLower.startsWith(qLower), bStarts = bLower.startsWith(qLower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        const aIndex = aLower.indexOf(qLower), bIndex = bLower.indexOf(qLower);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.localeCompare(b);
      });
      show(sortedResults, steamResults && steamResults.length > 0 ? 'Steam Market' : 'Local');
    } else { hide(); }
  }, 250);

  input.addEventListener('input', () => { debounced(); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 1) debounced(); });
  input.addEventListener('blur', (e) => { setTimeout(() => { if (!box || !box.contains(document.activeElement)) hide(); }, 200); });
  document.addEventListener('click', (e) => { if (!box || (!box.contains(e.target) && e.target !== input)) hide(); });
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
}

function bindApp() {
  $('#session-selector').addEventListener('change', (e) => { switchSession(e.target.value); });
  $('#new-session').addEventListener('click', () => { $('#new-session-modal').showModal(); });
  $('#create-session').addEventListener('click', (e) => {
    e.preventDefault();
    const name = $('#new-session-name').value.trim();
    if (!name) return;
    const type = $('#new-session-type').value;
    const session = createSession(name, type);
    saveCurrentSessionId(session.id);
    currentSession = session;
    $('#new-session-modal').close();
    $('#new-session-name').value = '';
    renderSessionContext();
  });

  $('#tx-type').addEventListener('change', (e) => { toggleTradeupFields(e.target.value === 'Trade-up'); });

  $('#open-settings').addEventListener('click', () => { $('#base-currency').value = settings.baseCurrency; renderRatesList(); $('#settings-modal').showModal(); });

  $('#save-settings').addEventListener('click', (e) => {
    e.preventDefault();
    const newBase = $('#base-currency').value;
    if (newBase !== settings.baseCurrency) {
      const oldBase = settings.baseCurrency;
      const r = settings.rates || {};
      const factor = (r[newBase] && r[oldBase]) ? (1 / (r[newBase])) : 1;
      const sessions = getAllSessions();
      Object.values(sessions).forEach((session) => {
        session.transactions = (session.transactions || []).map((t) => ({ ...t, buyPriceBase: t.buyPriceBase * factor, sellPriceBase: (t.sellPriceBase || 0) * factor }));
        saveSession(session.id, session);
      });
      const newRates = { [newBase]: 1 };
      CURRENCIES.forEach((c) => { if (c.code !== newBase) newRates[c.code] = (r[c.code] || 1) * factor; });
      settings.rates = newRates;
      settings.baseCurrency = newBase;
      populateCurrencySelect($('#tx-currency'), settings.baseCurrency);
      populateCurrencySelect($('#base-currency'), settings.baseCurrency);
    }
    saveSettings(settings);
    $('#settings-modal').close();
    renderStats();
    renderTable();
  });

  $('#refresh-rates').addEventListener('click', async () => {
    const btn = $('#refresh-rates');
    const prev = btn.textContent;
    btn.textContent = 'Refreshing…';
    btn.disabled = true;
    const rates = await fetchRates(settings.baseCurrency);
    settings.rates = { ...settings.rates, ...rates };
    saveSettings(settings);
    renderRatesList();
    renderStats();
    renderTable();
    btn.textContent = prev;
    btn.disabled = false;
  });

  $('#display-currency').addEventListener('change', () => { settings.displayCurrency = $('#display-currency').value; saveSettings(settings); renderStats(); renderTable(); });
  $('#search').addEventListener('input', () => { renderTable(); });

  $('#tx-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentSession) { alert('Please create or select a session first'); return; }
    const date = $('#tx-date').value;
    const type = $('#tx-type').value;
    const currency = $('#tx-currency').value || settings.baseCurrency;
    const notes = $('#tx-notes').value.trim();
    let tx;
    if (type === 'Trade-up') {
      const redsText = $('#tradeup-reds').value.trim();
      const reds = redsText.split('\n').map(r => r.trim()).filter(r => r.length > 0);
      const costSteam = Number($('#tradeup-cost-steam').value || 0);
      const costManual = Number($('#tradeup-cost-manual').value || 0);
      const received = $('#tradeup-received').value.trim();
      const receivedPrice = Number($('#tradeup-received-price').value || 0);
      const totalCost = costSteam + costManual;
      const buyBase = toBase(totalCost, currency);
      const sellBase = receivedPrice ? toBase(receivedPrice, currency) : 0;
      tx = { id: uid(), date, type: 'Trade-up', itemName: received || 'Trade-up Result', tradeupReds: reds, tradeupCostSteam: costSteam, tradeupCostManual: costManual, buyPriceBase: buyBase, sellPriceBase: receivedPrice ? sellBase : null, notes };
    } else {
      const itemName = $('#tx-item').value.trim();
      const buy = Number($('#tx-buy').value || 0);
      const sell = Number($('#tx-sell').value || 0);
      const buyBase = toBase(buy, currency);
      const sellBase = sell ? toBase(sell, currency) : 0;
      tx = { id: uid(), date, itemName, type, notes, buyPriceBase: buyBase, sellPriceBase: sell ? sellBase : null };
    }
    currentSession.transactions.push(tx);
    saveSession(currentSession.id, currentSession);
    renderStats();
    renderTable();
    $('#tx-form').reset();
    toggleTradeupFields(false);
  });

  $('#tx-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'delete') {
      currentSession.transactions = currentSession.transactions.filter((t) => t.id !== id);
      saveSession(currentSession.id, currentSession);
      renderStats();
      renderTable();
    } else if (action === 'edit') {
      const t = currentSession.transactions.find((x) => x.id === id);
      if (!t) return;
      $('#tx-date').value = t.date || '';
      $('#tx-type').value = t.type || 'Case';
      $('#tx-notes').value = t.notes || '';
      if (t.type === 'Trade-up') {
        toggleTradeupFields(true);
        $('#tradeup-reds').value = (t.tradeupReds || []).join('\n');
        $('#tradeup-cost-steam').value = t.tradeupCostSteam || 0;
        $('#tradeup-cost-manual').value = t.tradeupCostManual || 0;
        $('#tradeup-received').value = t.itemName || '';
        $('#tradeup-received-price').value = t.sellPriceBase ? fromBase(t.sellPriceBase, settings.displayCurrency).toFixed(2) : '';
        $('#tx-currency').value = settings.displayCurrency;
      } else {
        toggleTradeupFields(false);
        const disp = settings.displayCurrency;
        $('#tx-item').value = t.itemName || '';
        const buyDisp = convertAmount(t.buyPriceBase, settings.baseCurrency, disp, settings.rates, settings.baseCurrency);
        const sellDisp = t.sellPriceBase ? convertAmount(t.sellPriceBase, settings.baseCurrency, disp, settings.rates, settings.baseCurrency) : 0;
        $('#tx-buy').value = String(buyDisp.toFixed(2));
        $('#tx-sell').value = t.sellPriceBase ? String(sellDisp.toFixed(2)) : '';
        $('#tx-currency').value = disp;
      }
      const originalTx = { ...t };
      currentSession.transactions = currentSession.transactions.filter((tx) => tx.id !== id);
      saveSession(currentSession.id, currentSession);
      const form = $('#tx-form');
      const handler = (ev) => {
        ev.preventDefault();
        if (!currentSession) return;
        const date = $('#tx-date').value;
        const type = $('#tx-type').value;
        const currency = $('#tx-currency').value || settings.baseCurrency;
        const notes = $('#tx-notes').value.trim();
        let updatedTx;
        if (type === 'Trade-up') {
          const redsText = $('#tradeup-reds').value.trim();
          const reds = redsText.split('\n').map(r => r.trim()).filter(r => r.length > 0);
          const costSteam = Number($('#tradeup-cost-steam').value || 0);
          const costManual = Number($('#tradeup-cost-manual').value || 0);
          const received = $('#tradeup-received').value.trim();
          const receivedPrice = Number($('#tradeup-received-price').value || 0);
          const totalCost = costSteam + costManual;
          const buyBase = toBase(totalCost, currency);
          const sellBase = receivedPrice ? toBase(receivedPrice, currency) : 0;
          updatedTx = { ...originalTx, date, type: 'Trade-up', itemName: received || 'Trade-up Result', tradeupReds: reds, tradeupCostSteam: costSteam, tradeupCostManual: costManual, buyPriceBase: buyBase, sellPriceBase: receivedPrice ? sellBase : null, notes };
        } else {
          const itemName = $('#tx-item').value.trim();
          const buy = Number($('#tx-buy').value || 0);
          const sell = Number($('#tx-sell').value || 0);
          const buyBase = toBase(buy, currency);
          const sellBase = sell ? toBase(sell, currency) : 0;
          updatedTx = { ...originalTx, date, itemName, type, notes, buyPriceBase: buyBase, sellPriceBase: sell ? sellBase : null };
        }
        currentSession.transactions.push(updatedTx);
        saveSession(currentSession.id, currentSession);
        renderStats();
        renderTable();
        form.reset();
        toggleTradeupFields(false);
        form.removeEventListener('submit', handler);
      };
      form.addEventListener('submit', handler, { once: true });
    }
  });

  $('#export-json').addEventListener('click', () => {
    if (!currentSession) { alert('Please select a session to export'); return; }
    const data = JSON.stringify({ session: currentSession, settings: settings }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cs2pl-${currentSession.name || 'session'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $('#import-json').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (data.session) {
        const session = data.session;
        session.id = uid();
        saveSession(session.id, session);
        switchSession(session.id);
      }
      if (data.settings) { settings = { ...settings, ...data.settings }; saveSettings(settings); }
      renderSessionContext();
      alert('Import successful!');
    } catch (err) { alert('Import failed: ' + err.message); } finally { e.target.value = ''; }
  });

  bindTypeahead('#tx-item', '#item-suggest');
  bindTypeahead('#tradeup-received', '#tradeup-suggest');
}

function boot() {
  settings = loadSettings();
  const currentSessionId = loadCurrentSessionId();
  if (currentSessionId) {
    const session = getSession(currentSessionId);
    if (session) currentSession = session;
  }
  if (!currentSession) {
    const defaultSession = createSession('Default Session', 'General');
    saveCurrentSessionId(defaultSession.id);
    currentSession = defaultSession;
  }
  bindApp();
  renderSessionContext();
  tryRefreshRates();
}

async function tryRefreshRates() {
  try {
    const rates = await fetchRates(settings.baseCurrency);
    settings.rates = { ...settings.rates, ...rates };
    saveSettings(settings);
    renderRatesList();
    renderStats();
    renderTable();
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', boot);
