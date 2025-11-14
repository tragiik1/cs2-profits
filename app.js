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

// Floating money animation
function showMoneyAnimation(amount, currency) {
  const netProfitDisplay = document.querySelector('.net-profit-display');
  if (!netProfitDisplay) return;

  const floatEl = document.createElement('div');
  floatEl.className = 'money-float';
  
  // Handle zero as neutral (white)
  if (Math.abs(amount) < 0.01) {
    floatEl.classList.add('neutral');
    floatEl.textContent = formatMoney(0, currency);
  } else {
    const isPositive = amount > 0;
    floatEl.classList.add(isPositive ? 'positive' : 'negative');
    const sign = isPositive ? '+' : '';
    floatEl.textContent = `${sign}${formatMoney(amount, currency)}`;
  }
  
  // Add slight random horizontal offset for more natural feel
  const randomOffset = (Math.random() - 0.5) * 40; // -20px to +20px
  floatEl.style.setProperty('--random-offset', `${randomOffset}px`);
  
  netProfitDisplay.appendChild(floatEl);
  
  // Remove element after animation completes
  setTimeout(() => {
    floatEl.remove();
  }, 2000);
}

// State
let transactions = [];
let settings = null;

function renderStats() {
  const disp = $('#display-currency')?.value || settings.displayCurrency || settings.baseCurrency;
  let spentBase = 0;
  let netBase = 0;

  transactions.forEach((t) => {
    spentBase += t.buyPriceBase || 0;
    netBase += (t.sellPriceBase || 0) - (t.buyPriceBase || 0);
  });

  const spentEl = $('#stat-spent');
  if (spentEl) {
    spentEl.textContent = formatMoney(fromBase(spentBase, disp), disp);
  }

    const netCard = $('#stat-net-card');
    const netValue = $('#stat-net');
    if (netValue) {
      const netDisp = fromBase(netBase, disp);
      netValue.textContent = formatMoney(netDisp, disp);

      if (netCard) {
        // Remove all classes first
        netCard.classList.remove('positive', 'negative');
        
        // Only add class if not zero (within 0.01 threshold)
        if (Math.abs(netDisp) >= 0.01) {
          if (netDisp > 0) {
            netCard.classList.add('positive');
          } else {
            netCard.classList.add('negative');
          }
        }
        // If zero, no class is added, so it stays white (default color)
      }
    }

  const pct = spentBase > 0 ? (netBase / spentBase) * 100 : 0;
  const pctEl = $('#stat-profit-pct');
  if (pctEl) {
    pctEl.textContent = `${pct.toFixed(2)}%`;
  }
}

function renderTable() {
  const tbody = $('#tx-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const searchEl = $('#search');
  const query = (searchEl?.value || '').toLowerCase();
  const disp = $('#display-currency')?.value || settings.displayCurrency || settings.baseCurrency;

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
          <button class="icon-btn" data-action="edit" data-id="${t.id}" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="icon-btn" data-action="delete" data-id="${t.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
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

  const activePeriodBtn = document.querySelector('.period-btn.active');
  const activePeriod = activePeriodBtn?.getAttribute('data-period') || 'month';
  const displayCurrencyEl = $('#display-currency');
  const disp = displayCurrencyEl?.value || settings.displayCurrency || settings.baseCurrency;
  
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
  const displayCurrencyEl = $('#display-currency');
  const baseCurrencyEl = $('#base-currency');
  const txCurrencyEl = $('#tx-currency');
  
  if (displayCurrencyEl) {
    populateCurrencySelect(displayCurrencyEl, settings.displayCurrency || settings.baseCurrency);
  }
  if (baseCurrencyEl) {
    populateCurrencySelect(baseCurrencyEl, settings.baseCurrency);
  }
  if (txCurrencyEl) {
    populateCurrencySelect(txCurrencyEl, settings.baseCurrency);
  }
  renderRatesList();
  renderStats();
  renderTable();
  renderChart();
}

function bindApp() {
  // Sign In Button
  const signInBtn = $('#sign-in-btn');
  if (signInBtn) {
    signInBtn.addEventListener('click', () => {
      window.location.href = '/auth/steam';
    });
  }

  // Check authentication status on load
  checkAuthStatus();

  // Refresh Inventory Button
  const refreshInventoryBtn = $('#refresh-inventory-btn');
  if (refreshInventoryBtn) {
    refreshInventoryBtn.addEventListener('click', () => {
      loadInventory();
    });
  }

  // Menu
  const openMenuBtn = $('#open-menu');
  if (openMenuBtn) {
    openMenuBtn.addEventListener('click', () => {
      $('#menu-modal').showModal();
    });
  }

  // Menu actions
  const menuSettingsBtn = $('#menu-settings');
  if (menuSettingsBtn) {
    menuSettingsBtn.addEventListener('click', () => {
      $('#menu-modal').close();
      const baseCurrencyEl = $('#base-currency');
      if (baseCurrencyEl) {
        baseCurrencyEl.value = settings.baseCurrency;
      }
      renderRatesList();
      $('#settings-modal').showModal();
    });
  }

  const menuImportBtn = $('#menu-import');
  if (menuImportBtn) {
    menuImportBtn.addEventListener('click', () => {
      $('#menu-modal').close();
      $('#import-modal').showModal();
    });
  }

  const menuExportBtn = $('#menu-export');
  if (menuExportBtn) {
    menuExportBtn.addEventListener('click', () => {
      $('#menu-modal').close();
      $('#export-modal').showModal();
    });
  }

  // Add Transaction Button
  const addTransactionBtn = $('#add-transaction-btn');
  if (addTransactionBtn) {
    addTransactionBtn.addEventListener('click', () => {
      // Set today's date as default
      const dateInput = $('#tx-date');
      if (dateInput && !dateInput.value) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
      }
      $('#add-transaction-modal').showModal();
    });
  }

  // Analytics Toggle
  const analyticsToggle = $('#analytics-toggle');
  const analyticsContent = $('#analytics-content');
  if (analyticsToggle && analyticsContent) {
    // Load saved state
    const savedState = localStorage.getItem('analytics-expanded');
    const isExpanded = savedState === 'true';
    analyticsToggle.setAttribute('aria-expanded', isExpanded);
    analyticsContent.setAttribute('aria-hidden', !isExpanded);

    analyticsToggle.addEventListener('click', () => {
      const isCurrentlyExpanded = analyticsToggle.getAttribute('aria-expanded') === 'true';
      const newState = !isCurrentlyExpanded;
      analyticsToggle.setAttribute('aria-expanded', newState);
      analyticsContent.setAttribute('aria-hidden', !newState);
      localStorage.setItem('analytics-expanded', String(newState));
    });
  }

  // Settings
  const saveSettingsBtn = $('#save-settings');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const baseCurrencyEl = $('#base-currency');
      if (!baseCurrencyEl) return;
      const newBase = baseCurrencyEl.value;
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
  }

  const refreshRatesBtn = $('#refresh-rates');
  if (refreshRatesBtn) {
    refreshRatesBtn.addEventListener('click', async () => {
      const prev = refreshRatesBtn.textContent;
      refreshRatesBtn.textContent = 'Refreshing…';
      refreshRatesBtn.disabled = true;
      const rates = await fetchRates(settings.baseCurrency);
      settings.rates = { ...settings.rates, ...rates };
      saveSettings(settings);
      renderRatesList();
      renderStats();
      renderTable();
      renderChart();
      refreshRatesBtn.textContent = prev;
      refreshRatesBtn.disabled = false;
    });
  }

  const displayCurrencyEl = $('#display-currency');
  if (displayCurrencyEl) {
    displayCurrencyEl.addEventListener('change', () => {
      settings.displayCurrency = displayCurrencyEl.value;
      saveSettings(settings);
      renderStats();
      renderTable();
      renderChart();
    });
  }

  // Chart period buttons
  $$('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderChart();
    });
  });

  const searchEl = $('#search');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      renderTable();
    });
  }

  // Form submit
  const txForm = $('#tx-form');
  if (txForm) {
    txForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const dateEl = $('#tx-date');
      const typeEl = $('#tx-type');
      const itemEl = $('#tx-item');
      const buyEl = $('#tx-buy');
      const sellEl = $('#tx-sell');
      const currencyEl = $('#tx-currency');
      const notesEl = $('#tx-notes');

      if (!dateEl || !typeEl || !itemEl || !buyEl || !currencyEl) return;

      const date = dateEl.value;
      const type = typeEl.value;
      const itemName = itemEl.value.trim();
      const buy = Number(buyEl.value || 0);
      const sell = Number(sellEl?.value || 0);
      const currency = currencyEl.value || settings.baseCurrency;
      const notes = notesEl?.value.trim() || '';

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

      // Calculate profit/loss for this transaction
      const profitLoss = sellBase - buyBase;
      const disp = settings.displayCurrency || settings.baseCurrency;
      const profitLossDisp = fromBase(profitLoss, disp);

      transactions.push(tx);
      saveTransactions(transactions);
      renderContext();
      
      // Show floating animation if there's a sell price
      if (sell > 0) {
        setTimeout(() => {
          showMoneyAnimation(profitLossDisp, disp);
        }, 100);
      }
      
      txForm.reset();
      $('#add-transaction-modal').close();
    });
  }

  // Table actions (edit/delete)
  const txTbody = $('#tx-tbody');
  if (txTbody) {
    txTbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');

      if (action === 'delete') {
        if (confirm('Are you sure you want to delete this transaction?')) {
          // Get transaction before deleting to show animation
          const deletedTx = transactions.find((t) => t.id === id);
          const disp = settings.displayCurrency || settings.baseCurrency;
          
          transactions = transactions.filter((t) => t.id !== id);
          saveTransactions(transactions);
          renderContext();
          
          // Show animation for deleted transaction (reverse the profit/loss)
          if (deletedTx && deletedTx.sellPriceBase) {
            const profitLoss = deletedTx.sellPriceBase - deletedTx.buyPriceBase;
            const profitLossDisp = fromBase(-profitLoss, disp); // Negative because we're removing it
            setTimeout(() => {
              showMoneyAnimation(profitLossDisp, disp);
            }, 100);
          }
        }
      } else if (action === 'edit') {
        const t = transactions.find((x) => x.id === id);
        if (!t) return;

        const dateEl = $('#tx-date');
        const typeEl = $('#tx-type');
        const itemEl = $('#tx-item');
        const notesEl = $('#tx-notes');
        const buyEl = $('#tx-buy');
        const sellEl = $('#tx-sell');
        const currencyEl = $('#tx-currency');

        if (dateEl) dateEl.value = t.date || '';
        if (typeEl) typeEl.value = t.type || 'Case';
        if (itemEl) itemEl.value = t.itemName || '';
        if (notesEl) notesEl.value = t.notes || '';

        const disp = settings.displayCurrency;
        const buyDisp = fromBase(t.buyPriceBase, disp);
        const sellDisp = t.sellPriceBase ? fromBase(t.sellPriceBase, disp) : 0;

        if (buyEl) buyEl.value = String(buyDisp.toFixed(2));
        if (sellEl) sellEl.value = t.sellPriceBase ? String(sellDisp.toFixed(2)) : '';
        if (currencyEl) currencyEl.value = disp;

        const originalTx = { ...t };
        transactions = transactions.filter((tx) => tx.id !== id);
        saveTransactions(transactions);

        const form = $('#tx-form');
        if (!form) return;

        $('#add-transaction-modal').showModal();

        const handler = (ev) => {
          ev.preventDefault();
          if (!dateEl || !typeEl || !itemEl || !buyEl || !currencyEl) return;

          const date = dateEl.value;
          const type = typeEl.value;
          const itemName = itemEl.value.trim();
          const buy = Number(buyEl.value || 0);
          const sell = Number(sellEl?.value || 0);
          const currency = currencyEl.value || settings.baseCurrency;
          const notes = notesEl?.value.trim() || '';

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

          // Calculate profit/loss for this transaction
          const profitLoss = sellBase - buyBase;
          const disp = settings.displayCurrency || settings.baseCurrency;
          const profitLossDisp = fromBase(profitLoss, disp);

          transactions.push(updatedTx);
          saveTransactions(transactions);
          renderContext();
          
          // Show floating animation if there's a sell price
          if (sell > 0) {
            setTimeout(() => {
              showMoneyAnimation(profitLossDisp, disp);
            }, 100);
          }
          
          form.reset();
          $('#add-transaction-modal').close();
          form.removeEventListener('submit', handler);
        };
        form.addEventListener('submit', handler, { once: true });
      }
    });
  }

  // Export Modal (handled by menu now, but keep for backward compatibility)
  const openExportBtn = $('#open-export');
  if (openExportBtn) {
    openExportBtn.addEventListener('click', () => {
      $('#export-modal').showModal();
    });
  }

  // Import Modal (handled by menu now, but keep for backward compatibility)
  const openImportBtn = $('#open-import');
  if (openImportBtn) {
    openImportBtn.addEventListener('click', () => {
      $('#import-modal').showModal();
    });
  }

  // Excel Export
  const exportExcelBtn = $('#export-excel-btn');
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', () => {
      if (transactions.length === 0) {
        alert('No transactions to export');
        return;
      }

      const displayCurrencyEl = $('#display-currency');
      const disp = displayCurrencyEl?.value || settings.displayCurrency || settings.baseCurrency;
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
      const exportModal = $('#export-modal');
      if (exportModal) exportModal.close();
    });
  }

  // JSON Export
  const exportJsonBtn = $('#export-json-btn');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
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
      const exportModal = $('#export-modal');
      if (exportModal) exportModal.close();
    });
  }

  // Excel Import
  const importExcelInput = $('#import-excel');
  if (importExcelInput) {
    importExcelInput.addEventListener('change', async (e) => {
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
          const importModal = $('#import-modal');
          if (importModal) importModal.close();
        } else {
          alert('No valid transactions found in Excel file');
        }
      } catch (err) {
        alert('Import failed: ' + err.message);
      } finally {
        e.target.value = '';
      }
    });
  }

  // JSON Import
  const importJsonInput = $('#import-json');
  if (importJsonInput) {
    importJsonInput.addEventListener('change', async (e) => {
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
          const importModal = $('#import-modal');
          if (importModal) importModal.close();
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
          const importModal = $('#import-modal');
          if (importModal) importModal.close();
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
}

// Authentication
async function checkAuthStatus() {
  try {
    const response = await fetch('/auth/user');
    const data = await response.json();
    
    if (data.authenticated && data.user) {
      updateUserUI(data.user);
    } else {
      // User not signed in
      const signInBtn = $('#sign-in-btn');
      if (signInBtn) {
        signInBtn.textContent = 'Sign In';
        signInBtn.style.display = '';
      }
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

function updateUserUI(user) {
  const signInBtn = $('#sign-in-btn');
  if (signInBtn) {
    signInBtn.textContent = user.username || 'Signed In';
    signInBtn.onclick = () => {
      if (confirm('Sign out?')) {
        fetch('/auth/logout', { method: 'GET' })
          .then(() => window.location.reload());
      }
    };
  }

  // Show inventory section and load inventory
  const inventorySection = $('#inventory-section');
  if (inventorySection) {
    inventorySection.style.display = 'block';
    loadInventory();
  }
}

// Inventory functions
async function loadInventory() {
  const inventoryGrid = $('#inventory-grid');
  if (!inventoryGrid) return;

  inventoryGrid.innerHTML = '<div class="inventory-loading">Loading inventory...</div>';

  try {
    const response = await fetch('/api/inventory', {
      credentials: 'include' // Important for session cookies
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Show detailed error message
      const errorMsg = data.message || data.error || 'Failed to load inventory';
      
      // If it's a 400 error and inventory might be empty, show helpful message
      if (response.status === 400) {
        const steamId = data.steamId || 'your-steam-id';
        inventoryGrid.innerHTML = `
          <div class="inventory-empty">
            <p><strong>No CS2 items found in your inventory.</strong></p>
            <div style="margin-top: 16px; padding: 16px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid var(--border);">
              <p style="margin-bottom: 12px; font-size: 13px; color: var(--muted);">
                <strong>Possible reasons:</strong>
              </p>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--muted); line-height: 1.8;">
                <li>Your inventory is actually empty for CS2</li>
                <li>You have CS:GO items but not CS2 items (they're different)</li>
                <li>Inventory privacy settings are blocking access</li>
                <li>Items are in a different game</li>
              </ul>
            </div>
            <p style="margin-top: 16px; font-size: 13px;">
              <strong>Check your inventory:</strong><br>
              <a href="https://steamcommunity.com/profiles/${steamId}/inventory/730/2/" target="_blank" style="color: var(--primary); text-decoration: underline;">CS2 Inventory (Context 2)</a><br>
              <a href="https://steamcommunity.com/profiles/${steamId}/inventory/730/6/" target="_blank" style="color: var(--primary); text-decoration: underline;">CS:GO Inventory (Context 6)</a><br>
              <a href="https://steamcommunity.com/profiles/${steamId}/inventory/" target="_blank" style="color: var(--primary); text-decoration: underline;">All Games</a>
            </p>
            <p style="margin-top: 12px; font-size: 12px; color: var(--muted);">
              <strong>Privacy Check:</strong> Go to <a href="https://steamcommunity.com/my/edit/settings" target="_blank" style="color: var(--primary);">Steam Privacy Settings</a> and make sure "Inventory" is set to <strong>Public</strong>.
            </p>
          </div>
        `;
        return;
      }
      
      throw new Error(errorMsg);
    }
    
    if (data.items && data.items.length > 0) {
      renderInventory(data.items);
      // Load prices after rendering
      loadInventoryPrices(data.items);
    } else {
      inventoryGrid.innerHTML = `
        <div class="inventory-empty">
          <p>No CS2 items found in your inventory.</p>
          <p style="margin-top: 12px; font-size: 13px; color: var(--muted);">
            Make sure you have <strong>CS2</strong> items (Counter-Strike 2), not CS:GO items.
          </p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Inventory load error:', err);
    let errorMessage = err.message || 'Failed to load inventory';
    
    // Provide helpful error messages
    if (errorMessage.includes('401') || errorMessage.includes('Not authenticated')) {
      errorMessage = 'Not signed in. Please sign in with Steam.';
    } else if (errorMessage.includes('403') || errorMessage.includes('private')) {
      errorMessage = 'Inventory is private. Please set your Steam inventory to public in your Steam privacy settings.';
    } else if (errorMessage.includes('404')) {
      errorMessage = 'Steam inventory not found. Make sure you have CS2 items in your inventory.';
    }
    
    inventoryGrid.innerHTML = `<div class="inventory-empty">Error loading inventory: ${errorMessage}<br><small>Check the browser console (F12) and server console for more details.</small></div>`;
  }
}

function renderInventory(items) {
  const inventoryGrid = $('#inventory-grid');
  if (!inventoryGrid) return;

  inventoryGrid.innerHTML = '';

  items.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'inventory-item';
    itemEl.dataset.marketHashName = item.marketHashName;
    itemEl.setAttribute('data-market-hash-name', item.marketHashName);
    
    itemEl.innerHTML = `
      <img src="${item.iconUrl}" alt="${item.name}" class="inventory-item-image" loading="lazy" />
      <div class="inventory-item-name">${escapeHtml(item.name)}</div>
      <div class="inventory-item-price loading">Loading price...</div>
    `;

    // Add click to add as transaction
    itemEl.addEventListener('click', () => {
      addInventoryItemAsTransaction(item);
    });

    inventoryGrid.appendChild(itemEl);
  });
}

async function loadInventoryPrices(items) {
  // Get unique market hash names
  const marketHashNames = [...new Set(items.map(item => item.marketHashName).filter(Boolean))];
  
  if (marketHashNames.length === 0) return;

  // Process in batches of 50
  for (let i = 0; i < marketHashNames.length; i += 50) {
    const batch = marketHashNames.slice(i, i + 50);
    
    try {
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketHashNames: batch })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update prices in the UI
        Object.keys(data.prices).forEach(marketHashName => {
          const priceData = data.prices[marketHashName];
          const itemElements = document.querySelectorAll(`[data-market-hash-name="${marketHashName}"]`);
          
          itemElements.forEach(el => {
            const priceEl = el.querySelector('.inventory-item-price');
            if (priceEl) {
              if (priceData.success) {
                priceEl.textContent = priceData.formatted || `$${priceData.price.toFixed(2)}`;
                priceEl.classList.remove('loading');
              } else {
                priceEl.textContent = 'Price unavailable';
                priceEl.classList.remove('loading');
                priceEl.style.color = 'var(--muted)';
              }
            }
          });
        });
      }
    } catch (err) {
      console.error('Price fetch error:', err);
    }

    // Small delay between batches
    if (i + 50 < marketHashNames.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

function addInventoryItemAsTransaction(item) {
  // Get price from the item element
  const itemEl = document.querySelector(`[data-market-hash-name="${item.marketHashName}"]`);
  const priceEl = itemEl?.querySelector('.inventory-item-price');
  const priceText = priceEl?.textContent || '0';
  const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

  if (price > 0) {
    // Pre-fill the add transaction form
    const itemInput = $('#tx-item');
    const sellInput = $('#tx-sell');
    const dateInput = $('#tx-date');
    
    if (itemInput) itemInput.value = item.name;
    if (sellInput) sellInput.value = price.toFixed(2);
    if (dateInput && !dateInput.value) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.value = today;
    }

    // Open the add transaction modal
    $('#add-transaction-modal').showModal();
  } else {
    alert('Price not available for this item yet. Please wait for prices to load.');
  }
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
