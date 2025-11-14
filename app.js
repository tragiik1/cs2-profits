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
  const num = amount || 0;
  const formatted = num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  // Custom currency formatting
  switch (code) {
    case 'AUD':
      return `A$${formatted}`;
    case 'EUR':
      return `€${formatted}`;
    case 'USD':
    default:
      return `$${formatted}`;
  }
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
let currentSteamId = null; // Store Steam ID for generating links

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
  const disp = $('#display-currency')?.value || settings.displayCurrency || settings.baseCurrency;

  // Use getFilteredTransactions if it exists, otherwise fall back to old logic
  const rows = typeof getFilteredTransactions === 'function' 
    ? getFilteredTransactions() 
    : transactions
        .slice()
        .sort((a, b) => (a.date || '').localeCompare(b.date))
        .filter((t) => {
          const searchEl = $('#search');
          const query = (searchEl?.value || '').toLowerCase();
          if (!query) return true;
          const searchText = [t.itemName || '', t.notes || '', t.type || ''].join(' ').toLowerCase();
          return searchText.includes(query);
        });

  // Update select all checkbox
  const selectAllCheckbox = $('#select-all-checkbox');
  if (selectAllCheckbox && typeof selectedTransactionIds !== 'undefined') {
    const allSelected = rows.length > 0 && rows.every(t => selectedTransactionIds.has(t.id));
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = !allSelected && rows.some(t => selectedTransactionIds.has(t.id));
  }

  rows.forEach((t) => {
    const tr = document.createElement('tr');
    const quantity = t.quantity || 1;
    const buyDisp = fromBase(t.buyPriceBase, disp);
    const sellDisp = fromBase(t.sellPriceBase || 0, disp);
    const diffDisp = sellDisp - buyDisp;
    const pct = t.buyPriceBase > 0 ? ((t.sellPriceBase || 0) - t.buyPriceBase) / t.buyPriceBase * 100 : 0;
    const isSelected = typeof selectedTransactionIds !== 'undefined' && selectedTransactionIds.has(t.id);

    tr.innerHTML = `
      <td>
        <input type="checkbox" class="transaction-checkbox" data-id="${t.id}" ${isSelected ? 'checked' : ''} />
      </td>
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.itemName || '')}</td>
      <td><span class="chip">${escapeHtml(t.type || '')}</span></td>
      <td>${quantity}</td>
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
    
    // Add checkbox event listener
    const checkbox = tr.querySelector('.transaction-checkbox');
    if (checkbox && typeof toggleTransactionSelection === 'function') {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleTransactionSelection(t.id);
      });
    }
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
      // Re-render inventory prices with new currency
      const inventoryGrid = $('#inventory-grid');
      if (inventoryGrid && inventoryGrid.querySelectorAll('.inventory-item').length > 0) {
        updateInventoryPricesCurrency();
      }
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
      const quantityEl = $('#tx-quantity');
      const buyEl = $('#tx-buy');
      const sellEl = $('#tx-sell');
      const currencyEl = $('#tx-currency');
      const notesEl = $('#tx-notes');

      if (!dateEl || !typeEl || !itemEl || !buyEl || !currencyEl || !quantityEl) return;

      const date = dateEl.value;
      const type = typeEl.value;
      const itemName = itemEl.value.trim();
      const quantity = Number(quantityEl.value || 1);
      const buyPerItem = Number(buyEl.value || 0);
      const sellPerItem = Number(sellEl?.value || 0);
      const currency = currencyEl.value || settings.baseCurrency;
      const notes = notesEl?.value.trim() || '';

      // Calculate total prices (price per item * quantity)
      const buyTotal = buyPerItem * quantity;
      const sellTotal = sellPerItem * quantity;
      const buyBase = toBase(buyTotal, currency);
      const sellBase = sellTotal > 0 ? toBase(sellTotal, currency) : 0;

      const tx = {
        id: uid(),
        date,
        itemName,
        type,
        quantity: quantity,
        buyPriceBase: buyBase,
        sellPriceBase: sellBase > 0 ? sellBase : null,
        buyPricePerItem: toBase(buyPerItem, currency),
        sellPricePerItem: sellPerItem > 0 ? toBase(sellPerItem, currency) : null,
        notes
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
        const quantityEl = $('#tx-quantity');
        const notesEl = $('#tx-notes');
        const buyEl = $('#tx-buy');
        const sellEl = $('#tx-sell');
        const currencyEl = $('#tx-currency');

        const quantity = t.quantity || 1;

        if (dateEl) dateEl.value = t.date || '';
        if (typeEl) typeEl.value = t.type || 'Case';
        if (itemEl) itemEl.value = t.itemName || '';
        if (quantityEl) quantityEl.value = String(quantity);
        if (notesEl) notesEl.value = t.notes || '';

        const disp = settings.displayCurrency;
        // Calculate per-item price from total
        const buyTotalDisp = fromBase(t.buyPriceBase, disp);
        const sellTotalDisp = t.sellPriceBase ? fromBase(t.sellPriceBase, disp) : 0;
        const buyPerItemDisp = buyTotalDisp / quantity;
        const sellPerItemDisp = sellTotalDisp > 0 ? sellTotalDisp / quantity : 0;

        if (buyEl) buyEl.value = String(buyPerItemDisp.toFixed(2));
        if (sellEl) sellEl.value = t.sellPriceBase ? String(sellPerItemDisp.toFixed(2)) : '';
        if (currencyEl) currencyEl.value = disp;

        const originalTx = { ...t };
        transactions = transactions.filter((tx) => tx.id !== id);
        saveTransactions(transactions);

        const form = $('#tx-form');
        if (!form) return;

        $('#add-transaction-modal').showModal();

        const handler = (ev) => {
          ev.preventDefault();
          if (!dateEl || !typeEl || !itemEl || !buyEl || !currencyEl || !quantityEl) return;

          const date = dateEl.value;
          const type = typeEl.value;
          const itemName = itemEl.value.trim();
          const quantity = Number(quantityEl.value || 1);
          const buyPerItem = Number(buyEl.value || 0);
          const sellPerItem = Number(sellEl?.value || 0);
          const currency = currencyEl.value || settings.baseCurrency;
          const notes = notesEl?.value.trim() || '';

          // Calculate total prices (price per item * quantity)
          const buyTotal = buyPerItem * quantity;
          const sellTotal = sellPerItem * quantity;
          const buyBase = toBase(buyTotal, currency);
          const sellBase = sellTotal > 0 ? toBase(sellTotal, currency) : 0;

          const updatedTx = {
            ...originalTx,
            date,
            itemName,
            type,
            quantity: quantity,
            notes,
            buyPriceBase: buyBase,
            sellPriceBase: sellBase > 0 ? sellBase : null,
            buyPricePerItem: toBase(buyPerItem, currency),
            sellPricePerItem: sellPerItem > 0 ? toBase(sellPerItem, currency) : null
          };

          // Calculate profit/loss for this transaction
          const profitLoss = sellBase - buyBase;
          const disp = settings.displayCurrency || settings.baseCurrency;
          const profitLossDisp = fromBase(profitLoss, disp);

          transactions.push(updatedTx);
          saveTransactions(transactions);
          renderContext();
          
          // Show floating animation if there's a sell price
          if (sellPerItem > 0) {
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
        ['Date', 'Item Name', 'Type', 'Quantity', 'Buy Price', 'Sell Price', 'Profit / Loss', 'Profit %', 'Notes']
      ];

      transactions
        .slice()
        .sort((a, b) => (a.date || '').localeCompare(b.date))
        .forEach((t) => {
          const quantity = t.quantity || 1;
          const buyDisp = fromBase(t.buyPriceBase, disp);
          const sellDisp = fromBase(t.sellPriceBase || 0, disp);
          const diffDisp = sellDisp - buyDisp;
          const pct = t.buyPriceBase > 0 ? ((t.sellPriceBase || 0) - t.buyPriceBase) / t.buyPriceBase * 100 : 0;

          wsData.push([
            t.date || '',
            t.itemName || '',
            t.type || '',
            quantity,
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

        // Check header row to determine format
        const headerRow = jsonData[0] || [];
        const hasQuantity = headerRow.includes('Quantity') || headerRow[3] === 'Quantity';
        
        // Skip header row
        const rows = jsonData.slice(1);
        const imported = [];

        rows.forEach((row) => {
          if (!row[0] || !row[1]) return; // Skip rows without date and item name

          const date = row[0];
          const itemName = String(row[1] || '');
          const type = String(row[2] || 'Case');
          
          // Handle old format (no quantity) vs new format (with quantity)
          let quantity, buyPrice, sellPrice, notes;
          
          if (hasQuantity) {
            // New format: Date, Item Name, Type, Quantity, Buy Price, Sell Price, Profit/Loss, Profit%, Notes
            quantity = Number(row[3]) || 1;
            buyPrice = Number(row[4]) || 0;
            sellPrice = row[5] ? Number(row[5]) : null;
            notes = String(row[8] || '');
          } else {
            // Old format: Date, Item Name, Type, Buy Price, Sell Price, Profit/Loss, Profit%, Notes
            quantity = 1; // Default to 1 for old format
            buyPrice = Number(row[3]) || 0;
            sellPrice = row[4] ? Number(row[4]) : null;
            notes = String(row[7] || '');
          }

          // Assume imported prices are totals (matching our export format)
          const currency = settings.displayCurrency || settings.baseCurrency;
          const buyTotal = buyPrice;
          const sellTotal = sellPrice || 0;
          const buyBase = toBase(buyTotal, currency);
          const sellBase = sellTotal > 0 ? toBase(sellTotal, currency) : 0;
          
          // Calculate per-item prices
          const buyPricePerItem = buyTotal / quantity;
          const sellPricePerItem = sellTotal > 0 ? sellTotal / quantity : 0;

          imported.push({
            id: uid(),
            date: date instanceof Date ? date.toISOString().split('T')[0] : String(date),
            itemName,
            type,
            quantity: quantity,
            notes,
            buyPriceBase: buyBase,
            sellPriceBase: sellTotal > 0 ? sellBase : null,
            buyPricePerItem: toBase(buyPricePerItem, currency),
            sellPricePerItem: sellPricePerItem > 0 ? toBase(sellPricePerItem, currency) : null
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

  // ========== NEW FEATURES ==========
  
  // Search Overlay (CSFloat-style)
  let searchDebounceTimer = null;
  let searchResults = [];
  
  function openSearchOverlay() {
    const overlay = $('#search-overlay');
    const input = $('#search-overlay-input');
    if (overlay && input) {
      overlay.style.display = 'flex';
      setTimeout(() => input.focus(), 100);
    }
  }
  
  function closeSearchOverlay() {
    const overlay = $('#search-overlay');
    const input = $('#search-overlay-input');
    if (overlay) {
      overlay.style.display = 'none';
      if (input) input.value = '';
      const results = $('#search-overlay-results');
      if (results) results.innerHTML = '<div class="search-overlay-empty">Start typing to search for CS2 items...</div>';
    }
  }
  
  async function performItemSearch(query) {
    const trimmedQuery = query.trim();
    
    // Show message immediately for very short queries
    const results = $('#search-overlay-results');
    if (!trimmedQuery || trimmedQuery.length < 1) {
      if (results) results.innerHTML = '<div class="search-overlay-empty">Start typing to search for CS2 items...</div>';
      return;
    }
    
    // For single character, show loading but don't search yet (wait for more input)
    if (trimmedQuery.length === 1) {
      if (results) results.innerHTML = '<div class="search-overlay-empty">Type more to search...</div>';
      return;
    }
    
    if (results) results.innerHTML = '<div class="search-overlay-empty">Searching...</div>';
    
    try {
      // Search with partial matching enabled
      const response = await fetch(`/api/search-items?q=${encodeURIComponent(trimmedQuery)}&count=30`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Search failed', message: `HTTP ${response.status}` }));
        throw new Error(errorData.message || errorData.error || 'Search failed');
      }
      
      const responseText = await response.text();
      console.log('🔍 Raw response text (first 500 chars):', responseText.substring(0, 500));
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Failed to parse JSON:', parseError);
        console.error('Full response text:', responseText);
        throw new Error('Invalid JSON response from server');
      }
      
      console.log('🔍 Search response received (full object):', data);
      console.log('🔍 Response keys:', Object.keys(data));
      console.log('🔍 data.items type:', typeof data.items);
      console.log('🔍 data.items value:', data.items);
      console.log('🔍 data.items length:', data.items?.length);
      console.log('🔍 data.items is array?', Array.isArray(data.items));
      
      // Try multiple possible property names
      searchResults = data.items || data.results || data.data || [];
      
      // If items is not an array, try to convert it
      if (!Array.isArray(searchResults)) {
        console.warn('⚠️ Items is not an array, attempting to convert...');
        console.warn('⚠️ searchResults type:', typeof searchResults);
        console.warn('⚠️ searchResults value:', searchResults);
        if (searchResults && typeof searchResults === 'object') {
          searchResults = Object.values(searchResults);
          console.log('✅ Converted to array:', searchResults.length, 'items');
        } else {
          console.warn('⚠️ Could not convert to array, using empty array');
          searchResults = [];
        }
      }
      
      console.log('🔍 Raw items from server:', searchResults.length);
      if (searchResults.length > 0) {
        console.log('🔍 First item:', searchResults[0]);
        console.log('🔍 First item keys:', Object.keys(searchResults[0]));
      } else {
        console.warn('⚠️ No items received! Full data object:', JSON.stringify(data, null, 2));
      }
      
      // Log sample items to see structure
      if (searchResults.length > 0) {
        console.log('🔍 Sample item structure:', JSON.stringify(searchResults[0], null, 2));
      }
      
      // Additional client-side filtering for better partial matching
      // This ensures items containing the query are shown
      // BUT: Server already filters, so we might not need this - let's make it less strict
      if (searchResults.length > 0) {
        const queryLower = trimmedQuery.toLowerCase();
        const beforeFilter = searchResults.length;
        
        // Server already filters, so we just do a very basic validation
        // Don't filter out items - trust the server
        const filtered = searchResults.filter(item => {
          // Only remove completely invalid items (null, undefined, or missing all identifiers)
          if (!item) return false;
          // Keep item if it has at least one identifier (name, marketHashName, or market_hash_name)
          return item.name || item.marketHashName || item.market_hash_name;
        });
        
        console.log(`🔍 Filtered items: ${beforeFilter} -> ${filtered.length} (only removed invalid items)`);
        searchResults = filtered;
        
        // Sort by relevance: items starting with query come first
        if (searchResults.length > 0) {
          searchResults.sort((a, b) => {
            const aName = (a.name || a.marketHashName || '').toLowerCase();
            const bName = (b.name || b.marketHashName || '').toLowerCase();
            const aStarts = aName.startsWith(queryLower);
            const bStarts = bName.startsWith(queryLower);
            
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            
            // Then sort by how early the query appears in the name
            const aIndex = aName.indexOf(queryLower);
            const bIndex = bName.indexOf(queryLower);
            if (aIndex !== bIndex) return aIndex - bIndex;
            
            // Finally alphabetical
            return aName.localeCompare(bName);
          });
        }
      }
      
      console.log(`🔍 Final searchResults length: ${searchResults.length}`);
      
      if (searchResults.length === 0) {
        if (results) {
          let message = `No items found matching "${trimmedQuery}". Try a different search term.`;
          if (data.error || data.message) {
            message = data.message || data.error || message;
          }
          results.innerHTML = `
            <div class="search-overlay-empty">
              <p>${message}</p>
              <p style="margin-top: 12px; font-size: 13px; color: var(--muted);">
                Tip: Try searching for partial names like "dra" for "Dragon Lore" or "ak" for "AK-47"
              </p>
              <p style="margin-top: 8px; font-size: 13px; color: var(--muted);">
                You can still manually enter the item name in the transaction form.
              </p>
              <button 
                class="primary" 
                style="margin-top: 16px; padding: 8px 16px;"
                onclick="document.getElementById('search-overlay').style.display='none'; document.getElementById('add-transaction-modal').showModal();"
              >
                Add Transaction Manually
              </button>
            </div>
          `;
        }
      } else {
        renderSearchResults(searchResults.slice(0, 20)); // Show top 20 results
      }
    } catch (err) {
      console.error('Search error:', err);
      if (results) {
        results.innerHTML = `
          <div class="search-overlay-empty">
            <p>Search failed: ${err.message || 'Please try again.'}</p>
            <p style="margin-top: 12px; font-size: 13px; color: var(--muted);">
              You can still manually enter the item name in the transaction form.
            </p>
            <button 
              class="primary" 
              style="margin-top: 16px; padding: 8px 16px;"
              onclick="document.getElementById('search-overlay').style.display='none'; document.getElementById('add-transaction-modal').showModal();"
            >
              Add Transaction Manually
            </button>
          </div>
        `;
      }
    }
  }
  
  function renderSearchResults(items) {
    console.log('🎨 renderSearchResults called with:', items.length, 'items');
    
    // Make sure overlay is visible
    const overlay = $('#search-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      console.log('✅ Search overlay is now visible');
    }
    
    const results = $('#search-overlay-results');
    if (!results) {
      console.error('❌ search-overlay-results element not found!');
      return;
    }
    
    if (!items || items.length === 0) {
      console.log('⚠️ No items to render');
      results.innerHTML = '<div class="search-overlay-empty">No items found. Try a different search term.</div>';
      return;
    }
    
    console.log('🎨 Rendering', items.length, 'items');
    console.log('🎨 Sample item:', JSON.stringify(items[0], null, 2));
    
    const displayCurrency = settings.displayCurrency || settings.baseCurrency || 'USD';
    console.log('🎨 Display currency:', displayCurrency);
    
    try {
      const html = items.map((item, index) => {
        // Handle different possible property names
        const marketHashName = item.marketHashName || item.market_hash_name || item.name || 'Unknown';
        const name = item.name || item.marketHashName || item.market_hash_name || 'Unknown Item';
        const iconUrl = item.iconUrl || item.icon_url || '';
        const price = item.price || 0;
        
        // Safe conversion
        let convertedPrice = price;
        try {
          convertedPrice = fromBase(price, displayCurrency);
        } catch (e) {
          console.warn('Error converting price for item', index, e);
          convertedPrice = price;
        }
        
        // Safe formatting
        let priceFormatted = '$0.00';
        try {
          priceFormatted = formatMoney(convertedPrice, displayCurrency);
        } catch (e) {
          console.warn('Error formatting price for item', index, e);
          priceFormatted = `$${convertedPrice.toFixed(2)}`;
        }
        
        // Safe escaping
        const safeName = escapeHtml(name);
        const safeHashName = escapeHtml(marketHashName);
        const safeIconUrl = escapeHtml(iconUrl);
        
        return `
          <div class="search-result-item" data-market-hash-name="${safeHashName}" data-index="${index}">
            ${iconUrl ? `<img src="${safeIconUrl}" alt="${safeName}" class="search-result-image" onerror="this.style.display='none';" />` : '<div class="search-result-image" style="background: #333; width: 64px; height: 64px;"></div>'}
            <div class="search-result-info">
              <div class="search-result-name">${safeName}</div>
              <div class="search-result-price">${priceFormatted}</div>
            </div>
          </div>
        `;
      }).join('');
      
      console.log('🎨 Generated HTML length:', html.length);
      console.log('🎨 HTML preview (first 500 chars):', html.substring(0, 500));
      
      results.innerHTML = html;
      
      // Add click handlers
      const resultItems = results.querySelectorAll('.search-result-item');
      console.log('🎨 Found', resultItems.length, 'result items in DOM');
      
      resultItems.forEach((el, index) => {
        el.addEventListener('click', () => {
          const marketHashName = el.dataset.marketHashName;
          const itemIndex = parseInt(el.dataset.index) || index;
          const item = items[itemIndex] || items.find(i => (i.marketHashName || i.market_hash_name) === marketHashName);
          
          console.log('🖱️ Clicked item:', marketHashName, item);
          
          if (item) {
            closeSearchOverlay();
            addItemFromSearch(item);
          }
        });
      });
      
      console.log('✅ renderSearchResults completed successfully');
    } catch (error) {
      console.error('❌ Error in renderSearchResults:', error);
      results.innerHTML = `<div class="search-overlay-empty">Error rendering results: ${error.message}</div>`;
    }
  }
  
  function addItemFromSearch(item) {
    const itemInput = $('#tx-item');
    const sellInput = $('#tx-sell');
    const dateInput = $('#tx-date');
    const quantityInput = $('#tx-quantity');
    
    if (itemInput) itemInput.value = item.name;
    if (sellInput && item.price > 0) {
      const displayCurrency = settings.displayCurrency || settings.baseCurrency || 'USD';
      const convertedPrice = fromBase(item.price, displayCurrency);
      sellInput.value = convertedPrice.toFixed(2);
    }
    if (dateInput && !dateInput.value) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.value = today;
    }
    if (quantityInput) quantityInput.value = '1';
    
    $('#add-transaction-modal').showModal();
  }
  
  // Search overlay event listeners
  const openSearchBtn = $('#open-search-btn');
  if (openSearchBtn) {
    openSearchBtn.addEventListener('click', openSearchOverlay);
  }
  
  const searchOverlay = $('#search-overlay');
  if (searchOverlay) {
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) closeSearchOverlay();
    });
  }
  
  const searchOverlayClose = $('#search-overlay-close');
  if (searchOverlayClose) {
    searchOverlayClose.addEventListener('click', closeSearchOverlay);
  }
  
  const searchOverlayInput = $('#search-overlay-input');
  if (searchOverlayInput) {
    searchOverlayInput.addEventListener('input', (e) => {
      const query = e.target.value;
      clearTimeout(searchDebounceTimer);
      // Shorter debounce for better responsiveness (200ms instead of 300ms)
      // For very short queries (1-2 chars), wait a bit longer to avoid too many requests
      const debounceTime = query.length <= 2 ? 400 : 200;
      searchDebounceTimer = setTimeout(() => performItemSearch(query), debounceTime);
    });
    
    searchOverlayInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSearchOverlay();
      }
      // Allow Enter to select first result
      if (e.key === 'Enter') {
        const firstResult = $('#search-overlay-results')?.querySelector('.search-result-item');
        if (firstResult) {
          firstResult.click();
        }
      }
    });
  }
  
  // Keyboard shortcut (Ctrl+K or Cmd+K)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearchOverlay();
    }
  });
  
  // Real-time Inventory Sync
  let inventorySyncInterval = null;
  
  function startInventorySync() {
    if (inventorySyncInterval) return; // Already running
    
    // Sync every 5 minutes
    inventorySyncInterval = setInterval(() => {
      if (currentSteamId) {
        loadInventory();
      }
    }, 5 * 60 * 1000);
  }
  
  function stopInventorySync() {
    if (inventorySyncInterval) {
      clearInterval(inventorySyncInterval);
      inventorySyncInterval = null;
    }
  }
  
  // Start sync when inventory is loaded - this will be called from updateUserUI
  // We'll hook into the loadInventory call there
  
  // Bulk Operations
  let selectedTransactionIds = new Set();
  
  function updateBulkActionsUI() {
    const count = selectedTransactionIds.size;
    const bulkBar = $('#bulk-actions-bar');
    const bulkBtn = $('#bulk-actions-btn');
    const countEl = $('#bulk-selected-count');
    
    if (countEl) countEl.textContent = `${count} selected`;
    
    if (count > 0) {
      if (bulkBar) bulkBar.style.display = 'flex';
      if (bulkBtn) bulkBtn.style.display = 'inline-flex';
    } else {
      if (bulkBar) bulkBar.style.display = 'none';
      if (bulkBtn) bulkBtn.style.display = 'none';
    }
  }
  
  function toggleTransactionSelection(id) {
    if (selectedTransactionIds.has(id)) {
      selectedTransactionIds.delete(id);
    } else {
      selectedTransactionIds.add(id);
    }
    updateBulkActionsUI();
    renderTable(); // Re-render to update checkboxes
  }
  
  function selectAllTransactions() {
    const filtered = getFilteredTransactions();
    filtered.forEach(t => selectedTransactionIds.add(t.id));
    updateBulkActionsUI();
    renderTable();
  }
  
  function deselectAllTransactions() {
    selectedTransactionIds.clear();
    updateBulkActionsUI();
    renderTable();
  }
  
  const selectAllCheckbox = $('#select-all-checkbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectAllTransactions();
      } else {
        deselectAllTransactions();
      }
    });
  }
  
  const bulkDeleteBtn = $('#bulk-delete-btn');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', () => {
      if (selectedTransactionIds.size === 0) return;
      if (!confirm(`Delete ${selectedTransactionIds.size} transaction(s)?`)) return;
      
      transactions = transactions.filter(t => !selectedTransactionIds.has(t.id));
      selectedTransactionIds.clear();
      saveTransactions(transactions);
      updateBulkActionsUI();
      renderContext();
    });
  }
  
  const bulkCloseBtn = $('#bulk-close-btn');
  if (bulkCloseBtn) {
    bulkCloseBtn.addEventListener('click', () => {
      selectedTransactionIds.clear();
      updateBulkActionsUI();
      renderTable();
    });
  }
  
  // Inventory Filters
  let inventoryFilters = {
    type: '',
    priceMin: null,
    priceMax: null
  };
  
  function applyInventoryFilters() {
    const typeFilter = $('#inventory-filter-type')?.value || '';
    const priceMin = parseFloat($('#inventory-filter-price-min')?.value) || null;
    const priceMax = parseFloat($('#inventory-filter-price-max')?.value) || null;
    
    inventoryFilters = { type: typeFilter, priceMin, priceMax };
    renderInventoryWithFilters();
  }
  
  function clearInventoryFilters() {
    inventoryFilters = { type: '', priceMin: null, priceMax: null };
    if ($('#inventory-filter-type')) $('#inventory-filter-type').value = '';
    if ($('#inventory-filter-price-min')) $('#inventory-filter-price-min').value = '';
    if ($('#inventory-filter-price-max')) $('#inventory-filter-price-max').value = '';
    renderInventoryWithFilters();
  }
  
  function renderInventoryWithFilters() {
    // This will be called after inventory is loaded
    // We'll filter the displayed items
    const items = document.querySelectorAll('.inventory-item');
    items.forEach(itemEl => {
      let show = true;
      
      // Type filter
      if (inventoryFilters.type) {
        const itemData = JSON.parse(itemEl.dataset.itemData || '{}');
        const itemType = itemData.type || '';
        if (!itemType.toLowerCase().includes(inventoryFilters.type.toLowerCase())) {
          show = false;
        }
      }
      
      // Price filter
      if (show && (inventoryFilters.priceMin !== null || inventoryFilters.priceMax !== null)) {
        const priceEl = itemEl.querySelector('.inventory-item-price');
        const priceText = priceEl?.textContent || '0';
        const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
        const displayCurrency = settings.displayCurrency || settings.baseCurrency || 'USD';
        const priceUSD = parseFloat(priceEl?.dataset.priceUsd || '0') || 0;
        
        if (inventoryFilters.priceMin !== null && priceUSD < inventoryFilters.priceMin) {
          show = false;
        }
        if (inventoryFilters.priceMax !== null && priceUSD > inventoryFilters.priceMax) {
          show = false;
        }
      }
      
      itemEl.style.display = show ? '' : 'none';
    });
  }
  
  const inventoryFilterBtn = $('#inventory-filter-btn');
  if (inventoryFilterBtn) {
    inventoryFilterBtn.addEventListener('click', () => {
      const filters = $('#inventory-filters');
      if (filters) {
        filters.style.display = filters.style.display === 'none' ? 'flex' : 'none';
      }
    });
  }
  
  const inventoryFilterApply = $('#inventory-filter-apply');
  if (inventoryFilterApply) {
    inventoryFilterApply.addEventListener('click', applyInventoryFilters);
  }
  
  const inventoryFilterClear = $('#inventory-filter-clear');
  if (inventoryFilterClear) {
    inventoryFilterClear.addEventListener('click', clearInventoryFilters);
  }
  
  // Transaction Filters
  let transactionFilters = {
    dateFrom: null,
    dateTo: null,
    type: '',
    profitMin: null,
    profitMax: null
  };
  
  function getFilteredTransactions() {
    const searchEl = $('#search');
    const query = (searchEl?.value || '').toLowerCase();
    
    return transactions
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date))
      .filter((t) => {
        // Search filter
        if (query) {
          const searchText = [t.itemName || '', t.notes || '', t.type || ''].join(' ').toLowerCase();
          if (!searchText.includes(query)) return false;
        }
        
        // Date filter
        if (transactionFilters.dateFrom && t.date < transactionFilters.dateFrom) return false;
        if (transactionFilters.dateTo && t.date > transactionFilters.dateTo) return false;
        
        // Type filter
        if (transactionFilters.type && t.type !== transactionFilters.type) return false;
        
        // Profit filter
        const disp = settings.displayCurrency || settings.baseCurrency;
        const buyDisp = fromBase(t.buyPriceBase, disp);
        const sellDisp = fromBase(t.sellPriceBase || 0, disp);
        const profit = sellDisp - buyDisp;
        
        if (transactionFilters.profitMin !== null && profit < transactionFilters.profitMin) return false;
        if (transactionFilters.profitMax !== null && profit > transactionFilters.profitMax) return false;
        
        return true;
      });
  };
  
  // Make other functions globally accessible
  window.toggleTransactionSelection = toggleTransactionSelection;
  window.selectedTransactionIds = selectedTransactionIds;
  window.renderInventoryWithFilters = renderInventoryWithFilters;
  window.startInventorySync = startInventorySync;
  window.stopInventorySync = stopInventorySync;
  
  function applyTransactionFilters() {
    const dateFrom = $('#transaction-filter-date-from')?.value || null;
    const dateTo = $('#transaction-filter-date-to')?.value || null;
    const type = $('#transaction-filter-type')?.value || '';
    const profitMin = parseFloat($('#transaction-filter-profit-min')?.value) || null;
    const profitMax = parseFloat($('#transaction-filter-profit-max')?.value) || null;
    
    transactionFilters = { dateFrom, dateTo, type, profitMin, profitMax };
    renderTable();
  }
  
  function clearTransactionFilters() {
    transactionFilters = { dateFrom: null, dateTo: null, type: '', profitMin: null, profitMax: null };
    if ($('#transaction-filter-date-from')) $('#transaction-filter-date-from').value = '';
    if ($('#transaction-filter-date-to')) $('#transaction-filter-date-to').value = '';
    if ($('#transaction-filter-type')) $('#transaction-filter-type').value = '';
    if ($('#transaction-filter-profit-min')) $('#transaction-filter-profit-min').value = '';
    if ($('#transaction-filter-profit-max')) $('#transaction-filter-profit-max').value = '';
    renderTable();
  }
  
  const transactionFilterBtn = $('#transaction-filter-btn');
  if (transactionFilterBtn) {
    transactionFilterBtn.addEventListener('click', () => {
      const filters = $('#transaction-filters');
      if (filters) {
        filters.style.display = filters.style.display === 'none' ? 'flex' : 'none';
      }
    });
  }
  
  const transactionFilterApply = $('#transaction-filter-apply');
  if (transactionFilterApply) {
    transactionFilterApply.addEventListener('click', applyTransactionFilters);
  }
  
  const transactionFilterClear = $('#transaction-filter-clear');
  if (transactionFilterClear) {
    transactionFilterClear.addEventListener('click', clearTransactionFilters);
  }
}

// Authentication
async function checkAuthStatus() {
  try {
    const response = await fetch('/auth/user');
    const data = await response.json();
    
    if (data.authenticated && data.user) {
      // Store Steam ID for generating links
      if (data.user.steamId) {
        currentSteamId = data.user.steamId;
      }
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

  // Store Steam ID for generating links
  if (user.steamId) {
    currentSteamId = user.steamId;
  }

  // Show inventory section and load inventory
  const inventorySection = $('#inventory-section');
  if (inventorySection) {
    inventorySection.style.display = 'block';
    loadInventory();
    // Start inventory sync after loading (if startInventorySync is available)
    setTimeout(() => {
      if (currentSteamId && typeof window.startInventorySync === 'function') {
        window.startInventorySync();
      }
    }, 1000);
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
      // Filter to only tradeable items
      const tradeableItems = data.items.filter(item => item.tradable === true);
      renderInventory(data.items);
      // Load prices only for tradeable items
      if (tradeableItems.length > 0) {
        loadInventoryPrices(tradeableItems);
      }
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

  // Filter out non-tradeable items
  const tradeableItems = items.filter(item => item.tradable === true);

  if (tradeableItems.length === 0 && items.length > 0) {
    inventoryGrid.innerHTML = `
      <div class="inventory-empty">
        <p>No tradeable items found in your inventory.</p>
        <p style="margin-top: 12px; font-size: 13px; color: var(--muted);">
          Only tradeable items are displayed. Trade-locked items are hidden.
        </p>
      </div>
    `;
    return;
  }

  tradeableItems.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'inventory-item';
    itemEl.dataset.marketHashName = item.marketHashName;
    itemEl.setAttribute('data-market-hash-name', item.marketHashName);
    
    // Build badges for item status (only for non-marketable now since we filter trade-locked)
    const badges = [];
    if (!item.marketable) {
      badges.push('<span class="item-badge non-marketable-badge" title="Not Marketable">🚫</span>');
    }
    
    itemEl.innerHTML = `
      <div class="inventory-item-image-wrapper">
        <img src="${item.iconUrl}" alt="${item.name}" class="inventory-item-image" loading="lazy" />
        ${badges.join('')}
      </div>
      <div class="inventory-item-name">${escapeHtml(item.name)}</div>
      <div class="inventory-item-price loading">Loading price...</div>
    `;

    // Store item data on element for context menu
    itemEl.dataset.itemData = JSON.stringify(item);
    
    // Add click to show context menu
    itemEl.addEventListener('click', (e) => {
      e.stopPropagation();
      showInventoryItemMenu(item, itemEl, e);
    });

    inventoryGrid.appendChild(itemEl);
  });
  
  // Apply filters after rendering
  if (typeof window.renderInventoryWithFilters === 'function') {
    setTimeout(() => window.renderInventoryWithFilters(), 100);
  }
}

// Close menu when clicking outside (set up once)
if (!window.inventoryMenuClickHandler) {
  window.inventoryMenuClickHandler = (e) => {
    if (menuJustOpened) return; // Don't close if menu just opened
    if (!e.target.closest('.inventory-item-menu') && !e.target.closest('.inventory-item')) {
      closeInventoryItemMenu();
    }
  };
  document.addEventListener('click', window.inventoryMenuClickHandler);
}

// Store inventory prices globally for currency conversion
let inventoryPrices = {};

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
        
        // Update prices in the UI and store USD prices
        Object.keys(data.prices).forEach(marketHashName => {
          const priceData = data.prices[marketHashName];
          const itemElements = document.querySelectorAll(`[data-market-hash-name="${marketHashName}"]`);
          
          // Store USD price for currency conversion
          if (priceData.success && priceData.price) {
            inventoryPrices[marketHashName] = priceData.price; // Store USD price
          }
          
          itemElements.forEach(el => {
            const priceEl = el.querySelector('.inventory-item-price');
            if (priceEl) {
              if (priceData.success) {
                // Convert and display price in selected currency
                const displayCurrency = settings.displayCurrency || settings.baseCurrency || 'USD';
                const priceUSD = priceData.price;
                const convertedPrice = fromBase(priceUSD, displayCurrency);
                priceEl.textContent = formatMoney(convertedPrice, displayCurrency);
                priceEl.dataset.priceUsd = priceUSD; // Store USD price in data attribute
                priceEl.classList.remove('loading');
              } else {
                priceEl.textContent = 'Price unavailable';
                priceEl.classList.remove('loading');
                priceEl.style.color = 'var(--muted)';
                priceEl.dataset.priceUsd = '0';
              }
            }
          });
        });
        
        // Update inventory total after prices are loaded
        updateInventoryTotal();
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

function updateInventoryPricesCurrency() {
  const displayCurrency = settings.displayCurrency || settings.baseCurrency || 'USD';
  const priceElements = document.querySelectorAll('.inventory-item-price');
  
  priceElements.forEach(priceEl => {
    const priceUSD = parseFloat(priceEl.dataset.priceUsd || '0');
    if (priceUSD > 0) {
      const convertedPrice = fromBase(priceUSD, displayCurrency);
      priceEl.textContent = formatMoney(convertedPrice, displayCurrency);
    }
  });
  
  // Update inventory total
  updateInventoryTotal();
}

function updateInventoryTotal() {
  const displayCurrency = settings.displayCurrency || settings.baseCurrency || 'USD';
  const priceElements = document.querySelectorAll('.inventory-item-price');
  let totalUSD = 0;
  
  priceElements.forEach(priceEl => {
    const priceUSD = parseFloat(priceEl.dataset.priceUsd || '0');
    if (priceUSD > 0 && !priceEl.textContent.includes('unavailable') && !priceEl.textContent.includes('Loading')) {
      totalUSD += priceUSD;
    }
  });
  
  // Update or create inventory total display
  const inventorySection = $('#inventory-section');
  if (inventorySection) {
    let totalEl = $('#inventory-total');
    if (!totalEl) {
      // Create total display if it doesn't exist - add it after the header
      const sectionHeader = inventorySection.querySelector('.section-header');
      if (sectionHeader) {
        // Insert total between h2 and button
        totalEl = document.createElement('div');
        totalEl.id = 'inventory-total';
        totalEl.className = 'inventory-total';
        const refreshBtn = sectionHeader.querySelector('#refresh-inventory-btn');
        if (refreshBtn && refreshBtn.parentNode === sectionHeader) {
          sectionHeader.insertBefore(totalEl, refreshBtn);
        } else {
          sectionHeader.appendChild(totalEl);
        }
      }
    }
    
    if (totalEl) {
      const convertedTotal = fromBase(totalUSD, displayCurrency);
      totalEl.textContent = `Total Value: ${formatMoney(convertedTotal, displayCurrency)}`;
      totalEl.style.display = totalUSD > 0 ? 'block' : 'none';
    }
  }
}

// Context menu for inventory items
let currentMenu = null;
let currentMenuItemEl = null;
let menuJustOpened = false;
let menuPositionUpdateHandler = null;

function updateMenuPosition() {
  if (!currentMenu || !currentMenuItemEl) return;
  
  const rect = currentMenuItemEl.getBoundingClientRect();
  const menuStyle = currentMenu.style;
  
  // Update position based on current item position (getBoundingClientRect already accounts for scroll)
  menuStyle.top = `${rect.bottom + 8}px`;
  menuStyle.left = `${rect.left}px`;
  
  // Adjust if menu would go off screen
  const menuRect = currentMenu.getBoundingClientRect();
  
  if (menuRect.right > window.innerWidth) {
    menuStyle.left = `${rect.right - menuRect.width}px`;
  }
  if (menuRect.bottom > window.innerHeight) {
    menuStyle.top = `${rect.top - menuRect.height - 8}px`;
  }
}

function showInventoryItemMenu(item, itemEl, event) {
  // Close any existing menu
  closeInventoryItemMenu();
  
  // Create menu element
  const menu = document.createElement('div');
  menu.className = 'inventory-item-menu';
  menu.id = 'inventory-item-menu';
  
  // Generate URLs
  const marketHashName = encodeURIComponent(item.marketHashName || item.name);
  const steamMarketUrl = `https://steamcommunity.com/market/listings/730/${marketHashName}`;
  const inventoryUrl = currentSteamId 
    ? `https://steamcommunity.com/profiles/${currentSteamId}/inventory/730/2/`
    : '#';
  
  menu.innerHTML = `
    <button class="menu-item" data-action="add">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span>Add</span>
    </button>
    <a href="${steamMarketUrl}" target="_blank" class="menu-item" data-action="market">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
      <span>View on Steam Market</span>
    </a>
    <a href="${inventoryUrl}" target="_blank" class="menu-item" data-action="inventory">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="21" x2="9" y2="9"></line>
      </svg>
      <span>View in Inventory</span>
    </a>
  `;
  
  // Store references
  currentMenu = menu;
  currentMenuItemEl = itemEl;
  
  // Position menu near the clicked item
  const menuStyle = menu.style;
  menuStyle.position = 'fixed';
  menuStyle.zIndex = '1000';
  
  // Add to body first so we can measure it
  document.body.appendChild(menu);
  
  // Initial positioning
  updateMenuPosition();
  
  // Set up scroll/resize listeners to update position
  menuPositionUpdateHandler = () => {
    updateMenuPosition();
  };
  
  window.addEventListener('scroll', menuPositionUpdateHandler, true);
  window.addEventListener('resize', menuPositionUpdateHandler);
  
  // Handle menu item clicks
  menu.querySelector('[data-action="add"]').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeInventoryItemMenu();
    addInventoryItemAsTransaction(item);
  });
  
  menuJustOpened = true;
  
  // Allow click event to finish before enabling outside click detection
  setTimeout(() => {
    menuJustOpened = false;
  }, 100);
}

function closeInventoryItemMenu() {
  if (currentMenu) {
    currentMenu.remove();
    currentMenu = null;
  }
  if (currentMenuItemEl) {
    currentMenuItemEl = null;
  }
  if (menuPositionUpdateHandler) {
    window.removeEventListener('scroll', menuPositionUpdateHandler, true);
    window.removeEventListener('resize', menuPositionUpdateHandler);
    menuPositionUpdateHandler = null;
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
    const quantityInput = $('#tx-quantity');
    const sellInput = $('#tx-sell');
    const dateInput = $('#tx-date');
    
    if (itemInput) itemInput.value = item.name;
    if (quantityInput) quantityInput.value = '1'; // Default to 1
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
