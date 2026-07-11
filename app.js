const STORAGE_KEY = 'altin-takip-v2';

const TYPE_DEFS = [
  { key: 'gram', name: 'Gram Altın', sub: '24 ayar · 1 gr', mult: 1 },
  { key: 'ceyrek', name: 'Çeyrek Altın', sub: '22 ayar · 1,75 gr', mult: 1.6045 },
  { key: 'yarim', name: 'Yarım Altın', sub: '22 ayar · 3,50 gr', mult: 3.209 },
  { key: 'tam', name: 'Tam Altın', sub: '22 ayar · 7,00 gr', mult: 6.418 },
  { key: 'cumhuriyet', name: 'Cumhuriyet Altını', sub: '22 ayar · 7,216 gr', mult: 6.6146 },
  { key: 'ajdar', name: 'Ajda Bilezik', sub: '22 ayar · 10 gr', mult: 9.167 },
];

const byKey = Object.fromEntries(TYPE_DEFS.map((d) => [d.key, d]));

function loadState() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    saved = {};
  }
  return {
    gramPrice: saved.gramPrice ?? '',
    entries: saved.entries ?? [],
  };
}

const state = {
  ...loadState(),
  addOpen: false,
  addType: 'gram',
  addCount: '',
  addDate: '',
  addBuy: '',
};

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ gramPrice: state.gramPrice, entries: state.entries })
    );
  } catch (e) {
    /* ignore storage errors */
  }
}

function num(v) {
  return parseFloat(String(v ?? '').replace(',', '.')) || 0;
}

function fmtCurrency(n) {
  return n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
}

function fmtCount(n) {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// DOM refs
const gramPriceInput = document.getElementById('gramPriceInput');
const entriesList = document.getElementById('entriesList');
const emptyState = document.getElementById('emptyState');
const totalAmountEl = document.getElementById('totalAmount');
const totalDiffEl = document.getElementById('totalDiff');
const totalBuyTextEl = document.getElementById('totalBuyText');

const openAddBtn = document.getElementById('openAddBtn');
const closeAddBtn = document.getElementById('closeAddBtn');
const addOverlay = document.getElementById('addOverlay');
const typeOptionsEl = document.getElementById('typeOptions');
const addCountInput = document.getElementById('addCountInput');
const addDateInput = document.getElementById('addDateInput');
const addBuyInput = document.getElementById('addBuyInput');
const addPreviewEl = document.getElementById('addPreview');
const confirmAddBtn = document.getElementById('confirmAddBtn');

function render() {
  const price = num(state.gramPrice);
  gramPriceInput.value = state.gramPrice;

  // Entries
  let total = 0;
  let totalBuy = 0;
  entriesList.innerHTML = '';

  state.entries.forEach((e, i) => {
    const d = byKey[e.type] || TYPE_DEFS[0];
    const count = num(e.count);
    const amount = count * d.mult * price;
    const buy = num(e.buyPrice);
    total += amount;
    totalBuy += buy;
    const diff = amount - buy;
    const hasDiff = buy > 0 && amount > 0;

    const row = document.createElement('div');
    row.className = 'entry-row';

    const nameCol = document.createElement('div');
    nameCol.className = 'entry-name-col';
    const nameEl = document.createElement('div');
    nameEl.className = 'entry-name';
    nameEl.textContent = d.name;
    const subEl = document.createElement('div');
    subEl.className = 'entry-sub';
    subEl.textContent = e.date ? `${d.sub} · ${fmtDate(e.date)}` : d.sub;
    nameCol.appendChild(nameEl);
    nameCol.appendChild(subEl);

    const countEl = document.createElement('div');
    countEl.className = 'entry-count';
    countEl.textContent = fmtCount(count);

    const amountCol = document.createElement('div');
    amountCol.className = 'entry-amount-col';
    const amountEl = document.createElement('div');
    amountEl.className = 'entry-amount';
    amountEl.textContent = amount > 0 ? fmtCurrency(amount) : '—';
    amountCol.appendChild(amountEl);
    if (hasDiff) {
      const diffEl = document.createElement('div');
      diffEl.className = 'entry-diff';
      diffEl.style.color = diff >= 0 ? '#3D7A3A' : '#A33B2B';
      diffEl.textContent = `${diff >= 0 ? '▲' : '▼'} ${fmtCurrency(Math.abs(diff))}`;
      amountCol.appendChild(diffEl);
    }
    if (buy > 0) {
      const buyEl = document.createElement('div');
      buyEl.className = 'entry-buy';
      buyEl.textContent = `Alış ${fmtCurrency(buy)}`;
      amountCol.appendChild(buyEl);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.title = 'Sil';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      state.entries.splice(i, 1);
      save();
      render();
    });

    row.appendChild(nameCol);
    row.appendChild(countEl);
    row.appendChild(amountCol);
    row.appendChild(removeBtn);
    entriesList.appendChild(row);
  });

  emptyState.hidden = state.entries.length > 0;

  const totalDiff = total - totalBuy;
  const hasTotalDiff = totalBuy > 0 && total > 0;

  totalAmountEl.textContent = fmtCurrency(total);
  if (hasTotalDiff) {
    totalDiffEl.hidden = false;
    totalDiffEl.style.color = totalDiff >= 0 ? '#3D7A3A' : '#A33B2B';
    totalDiffEl.textContent = `${totalDiff >= 0 ? '▲' : '▼'} ${fmtCurrency(Math.abs(totalDiff))}`;
  } else {
    totalDiffEl.hidden = true;
  }

  if (totalBuy > 0) {
    totalBuyTextEl.hidden = false;
    totalBuyTextEl.textContent = `Alış toplamı ${fmtCurrency(totalBuy)}`;
  } else {
    totalBuyTextEl.hidden = true;
  }

  // Add sheet
  addOverlay.hidden = !state.addOpen;
  addCountInput.value = state.addCount;
  addDateInput.value = state.addDate;
  addBuyInput.value = state.addBuy;

  typeOptionsEl.innerHTML = '';
  TYPE_DEFS.forEach((d) => {
    const opt = document.createElement('button');
    opt.className = 'type-option' + (d.key === state.addType ? ' selected' : '');
    opt.innerHTML = `<span class="type-option-name">${d.name}</span><span class="type-option-sub">${d.sub}</span>`;
    opt.addEventListener('click', () => {
      state.addType = d.key;
      render();
    });
    typeOptionsEl.appendChild(opt);
  });

  const addDef = byKey[state.addType] || TYPE_DEFS[0];
  const addAmount = num(state.addCount) * addDef.mult * price;
  addPreviewEl.textContent = addAmount > 0 ? fmtCurrency(addAmount) : '—';
}

// Event bindings
gramPriceInput.addEventListener('input', (e) => {
  state.gramPrice = e.target.value;
  save();
  render();
});

openAddBtn.addEventListener('click', () => {
  state.addOpen = true;
  state.addCount = '';
  state.addBuy = '';
  state.addDate = new Date().toISOString().slice(0, 10);
  render();
});

closeAddBtn.addEventListener('click', () => {
  state.addOpen = false;
  render();
});

addOverlay.addEventListener('click', (e) => {
  if (e.target === addOverlay) {
    state.addOpen = false;
    render();
  }
});

addCountInput.addEventListener('input', (e) => {
  state.addCount = e.target.value;
  render();
});

addDateInput.addEventListener('change', (e) => {
  state.addDate = e.target.value;
  render();
});

addBuyInput.addEventListener('input', (e) => {
  state.addBuy = e.target.value;
  render();
});

confirmAddBtn.addEventListener('click', () => {
  if (num(state.addCount) <= 0) return;
  state.entries.push({
    type: state.addType,
    count: state.addCount,
    date: state.addDate,
    buyPrice: state.addBuy,
  });
  state.addOpen = false;
  save();
  render();
});

render();

// PWA: offline caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// PWA: install prompt
const installBtn = document.getElementById('installBtn');
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  installBtn.hidden = true;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  deferredInstallPrompt = null;
});
