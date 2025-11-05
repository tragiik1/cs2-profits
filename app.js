// Utilities
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const CURRENCIES = [
  { code: 'AUD', symbol: 'A$', locale: 'en-AU' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
];

const STORAGE_KEY_TRANSACTIONS = 'cs2pl_transactions';
const STORAGE_KEY_SETTINGS = 'cs2pl_settings';

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatMoney(amount, code) {
  const curr = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
  return new Intl.NumberFormat(curr.locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2
  }).format(amount || 0);
}

function getDefaultRates(base) {
  const obj = {};
  CURRENCIES.forEach((c) => {
    obj[c.code] = c.code === base ? 1 : 1;
  });
  return obj;
}

function getDefaultSettings() {
  return {
    baseCurrency: 'USD',
    displayCurrency: 'USD',
    rates: getDefaultRates('USD')
  };
}

// Storage helpers
function loadTransactions() {
  try {
    const d = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
    return d ? JSON.parse(d) : [];
  } catch (e) {
    return [];
  }
}

function saveTransactions(txns) {
  localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(txns));
}

function loadSettings() {
  try {
    const d = localStorage.getItem(STORAGE_KEY_SETTINGS);
    return d ? JSON.parse(d) : getDefaultSettings();
  } catch (e) {
    return getDefaultSettings();
  }
}

function saveSettings(s) {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(s));
}

// Currency conversion
function toBase(amount, inputCurrency) {
  if (inputCurrency === settings.baseCurrency) return amount;
  if (!settings.rates || !settings.rates[inputCurrency] || settings.rates[inputCurrency] === 0) return amount;
  return amount / settings.rates[inputCurrency];
}

function fromBase(amountBase, displayCurrency) {
  if (displayCurrency === settings.baseCurrency) return amountBase;
  if (!settings.rates || !settings.rates[displayCurrency]) return amountBase;
  return amountBase * settings.rates[displayCurrency];
}

// Fetch exchange rates
async function fetchRates(base) {
  try {
    const symbols = CURRENCIES.map((c) => c.code).join(',');
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${symbols}`);
    if (!res.ok) throw new Error('Rate fetch failed');
    const data = await res.json();
    const result = { [base]: 1 };
    CURRENCIES.forEach((c) => {
      if (c.code !== base) result[c.code] = data.rates[c.code] ?? 1;
    });
    return result;
  } catch (_) {
    try {
      const symbols = CURRENCIES.map((c) => c.code).join(',');
      const res = await fetch(`https://api.exchangerate.host/latest?base=${base}&symbols=${symbols}`);
      if (!res.ok) throw new Error('Rate fetch failed');
      const data = await res.json();
      const result = { [base]: 1 };
      CURRENCIES.forEach((c) => {
        if (c.code !== base) result[c.code] = data.rates[c.code] ?? 1;
      });
      return result;
    } catch (e) {
      return getDefaultRates(base);
    }
  }
}

function populateCurrencySelect(el, selected) {
  el.innerHTML = '';
  CURRENCIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = c.code;
    if (c.code === selected) opt.selected = true;
    el.appendChild(opt);
  });
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
    input.addEventListener('input', () => {
      if (!settings.rates) settings.rates = {};
      settings.rates[c.code] = Number(input.value) || 0;
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
    return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
  } catch (_) {
    return dateStr;
  }
}

function escapeHtml(s) {
  return (s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

// State
let transactions = [];
let settings = null;

function renderStats() {
  const disp = $('#display-currency').value || settings.displayCurrency || settings.baseCurrency;
  let spentBase = 0;
  let netBase = 0;

  transactions.forEach((t) => {
    spentBase += t.buyPriceBase || 0;
    netBase += (t.sellPriceBase || 0) - (t.buyPriceBase || 0);
  });

  $('#stat-spent').textContent = formatMoney(fromBase(spentBase, disp), disp);
  const netCard = $('#stat-net-card');
  const netValue = $('#stat-net');
  const netDisp = fromBase(netBase, disp);
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
  const disp = $('#display-currency').value || settings.displayCurrency || settings.baseCurrency;

  const rows = transactions
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date))
    .filter((t) => {
      if (!query) return true;
      const searchText = [t.itemName || '', t.notes || '', t.type || ''].join(' ').toLowerCase();
      return searchText.includes(query);
    });

  rows.forEach((t) => {
    const tr = document.createElement('tr');
    const buyDisp = fromBase(t.buyPriceBase, disp);
    const sellDisp = fromBase(t.sellPriceBase || 0, disp);
    const diffDisp = sellDisp - buyDisp;
    const pct = t.buyPriceBase > 0 ? ((t.sellPriceBase || 0) - t.buyPriceBase) / t.buyPriceBase * 100 : 0;

    tr.innerHTML = `
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.itemName || '')}</td>
      <td><span class="chip">${escapeHtml(t.type || '')}</span></td>
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

// Chart
let profitChart = null;

function filterTransactionsByPeriod(transactions, period) {
  const now = new Date();
  let cutoffDate = new Date(0); // Default to beginning of time

  switch (period) {
    case '24h':
      cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'lifetime':
    default:
      cutoffDate = new Date(0);
      break;
  }

  return transactions.filter((t) => {
    if (!t.date) return false;
    const txDate = new Date(t.date + 'T00:00:00');
    return txDate >= cutoffDate;
  });
}

function calculateCumulativeProfit(transactions, period) {
  const filtered = filterTransactionsByPeriod(transactions, period);
  
  if (filtered.length === 0) {
    return { labels: [], data: [] };
  }

  // Sort by date
  const sorted = filtered.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  
  // Group transactions by date and calculate daily profit
  const dailyProfit = new Map();
  
  sorted.forEach((t) => {
    const profit = (t.sellPriceBase || 0) - (t.buyPriceBase || 0);
    const dateStr = t.date;
    if (!dailyProfit.has(dateStr)) {
      dailyProfit.set(dateStr, 0);
    }
    dailyProfit.set(dateStr, dailyProfit.get(dateStr) + profit);
  });

  // Build cumulative dataset
  const labels = Array.from(dailyProfit.keys()).sort();
  const data = [];
  let runningTotal = 0;

  labels.forEach((dateStr) => {
    runningTotal += dailyProfit.get(dateStr);
    data.push(runningTotal);
  });

  return { labels, data };
}

function renderChart() {
  const canvas = $('#profit-chart');
  if (!canvas) return;

  const activePeriod = document.querySelector('.period-btn.active')?.getAttribute('data-period') || 'month';
  const disp = $('#display-currency').value || settings.displayCurrency || settings.baseCurrency;
  
  const { labels, data } = calculateCumulativeProfit(transactions, activePeriod);
  
  // Handle empty data
  if (data.length === 0) {
    if (profitChart) {
      profitChart.destroy();
      profitChart = null;
    }
    // Optionally show a message or empty chart
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  
  // Convert to display currency
  const dataDisp = data.map((val) => fromBase(val, disp));

  // Format labels for display
  const formattedLabels = labels.map((label) => formatDate(label));

  if (profitChart) {
    profitChart.destroy();
  }

  // Get computed CSS variable values
  const root = document.documentElement;
  const positiveColor = getComputedStyle(root).getPropertyValue('--positive').trim() || '#2ecc71';
  const negativeColor = getComputedStyle(root).getPropertyValue('--negative').trim() || '#e74c3c';
  const textColor = getComputedStyle(root).getPropertyValue('--text').trim() || '#e6edf3';
  const mutedColor = getComputedStyle(root).getPropertyValue('--muted').trim() || '#8b949e';
  const borderColor = getComputedStyle(root).getPropertyValue('--border').trim() || '#232a31';
  
  const isPositive = dataDisp.length > 0 && dataDisp[dataDisp.length - 1] >= 0;
  const lineColor = isPositive ? positiveColor : negativeColor;
  
  // Convert hex or rgb to rgba with opacity
  let fillColor;
  if (isPositive) {
    fillColor = positiveColor.includes('#') 
      ? positiveColor + '1a' // Add alpha hex for #2ecc71 -> #2ecc711a
      : 'rgba(46, 204, 113, 0.1)';
  } else {
    fillColor = negativeColor.includes('#') 
      ? negativeColor + '1a' 
      : 'rgba(231, 76, 60, 0.1)';
  }

  const ctx = canvas.getContext('2d');
  profitChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: formattedLabels,
      datasets: [{
        label: 'Cumulative Profit / Loss',
        data: dataDisp,
        borderColor: lineColor,
        backgroundColor: fillColor,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: lineColor,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              return formatMoney(context.parsed.y, disp);
            }
          },
          backgroundColor: 'rgba(15, 20, 25, 0.95)',
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: borderColor,
          borderWidth: 1,
        }
      },
      scales: {
        x: {
          grid: {
            color: borderColor,
            display: true
          },
          ticks: {
            color: mutedColor,
            maxTicksLimit: 10
          }
        },
        y: {
          grid: {
            color: borderColor,
            display: true
          },
          ticks: {
            color: mutedColor,
            callback: function(value) {
              return formatMoney(value, disp);
            }
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
}

function renderContext() {
  populateCurrencySelect($('#display-currency'), settings.displayCurrency || settings.baseCurrency);
  populateCurrencySelect($('#base-currency'), settings.baseCurrency);
  populateCurrencySelect($('#tx-currency'), settings.baseCurrency);
  renderRatesList();
  renderStats();
  renderTable();
  renderChart();
}

function bindApp() {
  // Settings
  $('#open-settings').addEventListener('click', () => {
    $('#base-currency').value = settings.baseCurrency;
    renderRatesList();
    $('#settings-modal').showModal();
  });

  $('#save-settings').addEventListener('click', (e) => {
    e.preventDefault();
    const newBase = $('#base-currency').value;
    if (newBase !== settings.baseCurrency) {
      const oldBase = settings.baseCurrency;
      const r = settings.rates || {};
      const factor = (r[newBase] && r[oldBase]) ? (1 / (r[newBase])) : 1;

      // Convert all transactions to new base
      transactions = transactions.map((t) => ({
        ...t,
        buyPriceBase: (t.buyPriceBase || 0) * factor,
        sellPriceBase: (t.sellPriceBase || 0) * factor
      }));
      saveTransactions(transactions);

      const newRates = { [newBase]: 1 };
      CURRENCIES.forEach((c) => {
        if (c.code !== newBase) newRates[c.code] = (r[c.code] || 1) * factor;
      });
      settings.rates = newRates;
      settings.baseCurrency = newBase;
    }
    saveSettings(settings);
    $('#settings-modal').close();
    renderContext();
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
    renderChart();
    btn.textContent = prev;
    btn.disabled = false;
  });

  $('#display-currency').addEventListener('change', () => {
    settings.displayCurrency = $('#display-currency').value;
    saveSettings(settings);
    renderStats();
    renderTable();
    renderChart();
  });

  // Chart period buttons
  $$('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderChart();
    });
  });

  $('#search').addEventListener('input', () => {
    renderTable();
  });

  // Form submit
  $('#tx-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = $('#tx-date').value;
    const type = $('#tx-type').value;
    const itemName = $('#tx-item').value.trim();
    const buy = Number($('#tx-buy').value || 0);
    const sell = Number($('#tx-sell').value || 0);
    const currency = $('#tx-currency').value || settings.baseCurrency;
    const notes = $('#tx-notes').value.trim();

    const buyBase = toBase(buy, currency);
    const sellBase = sell ? toBase(sell, currency) : 0;

    const tx = {
      id: uid(),
      date,
      itemName,
      type,
      notes,
      buyPriceBase: buyBase,
      sellPriceBase: sell ? sellBase : null
    };

    transactions.push(tx);
    saveTransactions(transactions);
    renderContext();
    $('#tx-form').reset();
  });

  // Table actions (edit/delete)
  $('#tx-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    if (action === 'delete') {
      transactions = transactions.filter((t) => t.id !== id);
      saveTransactions(transactions);
      renderContext();
    } else if (action === 'edit') {
      const t = transactions.find((x) => x.id === id);
      if (!t) return;

      $('#tx-date').value = t.date || '';
      $('#tx-type').value = t.type || 'Case';
      $('#tx-item').value = t.itemName || '';
      $('#tx-notes').value = t.notes || '';

      const disp = settings.displayCurrency;
      const buyDisp = fromBase(t.buyPriceBase, disp);
      const sellDisp = t.sellPriceBase ? fromBase(t.sellPriceBase, disp) : 0;

      $('#tx-buy').value = String(buyDisp.toFixed(2));
      $('#tx-sell').value = t.sellPriceBase ? String(sellDisp.toFixed(2)) : '';
      $('#tx-currency').value = disp;

      const originalTx = { ...t };
      transactions = transactions.filter((tx) => tx.id !== id);
      saveTransactions(transactions);

      const form = $('#tx-form');
      const handler = (ev) => {
        ev.preventDefault();
        const date = $('#tx-date').value;
        const type = $('#tx-type').value;
        const itemName = $('#tx-item').value.trim();
        const buy = Number($('#tx-buy').value || 0);
        const sell = Number($('#tx-sell').value || 0);
        const currency = $('#tx-currency').value || settings.baseCurrency;
        const notes = $('#tx-notes').value.trim();

        const buyBase = toBase(buy, currency);
        const sellBase = sell ? toBase(sell, currency) : 0;

        const updatedTx = {
          ...originalTx,
          date,
          itemName,
          type,
          notes,
          buyPriceBase: buyBase,
          sellPriceBase: sell ? sellBase : null
        };

        transactions.push(updatedTx);
        saveTransactions(transactions);
        renderContext();
        form.reset();
        form.removeEventListener('submit', handler);
      };
      form.addEventListener('submit', handler, { once: true });
    }
  });

  // Export Modal
  $('#open-export').addEventListener('click', () => {
    $('#export-modal').showModal();
  });

  // Import Modal
  $('#open-import').addEventListener('click', () => {
    $('#import-modal').showModal();
  });

  // Excel Export
  $('#export-excel-btn').addEventListener('click', () => {
    if (transactions.length === 0) {
      alert('No transactions to export');
      return;
    }

    const disp = settings.displayCurrency || settings.baseCurrency;
    const wsData = [
      ['Date', 'Item Name', 'Type', 'Buy Price', 'Sell Price', 'Profit / Loss', 'Profit %', 'Notes']
    ];

    transactions
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date))
      .forEach((t) => {
        const buyDisp = fromBase(t.buyPriceBase, disp);
        const sellDisp = fromBase(t.sellPriceBase || 0, disp);
        const diffDisp = sellDisp - buyDisp;
        const pct = t.buyPriceBase > 0 ? ((t.sellPriceBase || 0) - t.buyPriceBase) / t.buyPriceBase * 100 : 0;

        wsData.push([
          t.date || '',
          t.itemName || '',
          t.type || '',
          buyDisp.toFixed(2),
          t.sellPriceBase ? sellDisp.toFixed(2) : '',
          t.sellPriceBase ? diffDisp.toFixed(2) : '',
          t.sellPriceBase ? pct.toFixed(2) + '%' : '',
          t.notes || ''
        ]);
      });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    XLSX.writeFile(wb, 'cs2-profit-loss.xlsx');
    $('#export-modal').close();
  });

  // JSON Export
  $('#export-json-btn').addEventListener('click', () => {
    if (transactions.length === 0) {
      alert('No transactions to export');
      return;
    }

    const data = JSON.stringify({
      transactions,
      settings,
      exportedAt: new Date().toISOString()
    }, null, 2);

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cs2-profit-loss.json';
    a.click();
    URL.revokeObjectURL(url);
    $('#export-modal').close();
  });

  // Excel Import
  $('#import-excel').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        alert('Excel file is empty or invalid');
        return;
      }

      // Skip header row
      const rows = jsonData.slice(1);
      const imported = [];

      rows.forEach((row) => {
        if (!row[0] || !row[1]) return; // Skip rows without date and item name

        const date = row[0];
        const itemName = String(row[1] || '');
        const type = String(row[2] || 'Case');
        const buyPrice = Number(row[3]) || 0;
        const sellPrice = row[4] ? Number(row[4]) : null;
        const notes = String(row[7] || '');

        // Assume imported prices are in display currency
        const currency = settings.displayCurrency || settings.baseCurrency;
        const buyBase = toBase(buyPrice, currency);
        const sellBase = sellPrice ? toBase(sellPrice, currency) : 0;

        imported.push({
          id: uid(),
          date: date instanceof Date ? date.toISOString().split('T')[0] : String(date),
          itemName,
          type,
          notes,
          buyPriceBase: buyBase,
          sellPriceBase: sellPrice ? sellBase : null
        });
      });

      if (imported.length > 0) {
        transactions = [...transactions, ...imported];
        saveTransactions(transactions);
        renderContext();
        alert(`Imported ${imported.length} transaction(s) successfully!`);
        $('#import-modal').close();
      } else {
        alert('No valid transactions found in Excel file');
      }
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  // JSON Import
  $('#import-json').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.transactions && Array.isArray(data.transactions)) {
        // Import transactions
        const imported = data.transactions.map((t) => ({
          ...t,
          id: t.id || uid() // Preserve ID if exists, otherwise generate new
        }));

        transactions = [...transactions, ...imported];
        saveTransactions(transactions);
        renderContext();
        alert(`Imported ${imported.length} transaction(s) successfully!`);
        $('#import-modal').close();
      } else if (Array.isArray(data)) {
        // Handle case where JSON is just an array of transactions
        const imported = data.map((t) => ({
          ...t,
          id: t.id || uid()
        }));

        transactions = [...transactions, ...imported];
        saveTransactions(transactions);
        renderContext();
        alert(`Imported ${imported.length} transaction(s) successfully!`);
        $('#import-modal').close();
      } else {
        alert('Invalid JSON format. Expected transactions array.');
      }

      // Optionally import settings if provided
      if (data.settings) {
        settings = { ...settings, ...data.settings };
        saveSettings(settings);
        renderContext();
      }
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });
}

function boot() {
  settings = loadSettings();
  transactions = loadTransactions();
  bindApp();
  renderContext();
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
    renderChart();
  } catch (_) {
    // Silently fail on initial load
  }
}

document.addEventListener('DOMContentLoaded', boot);
