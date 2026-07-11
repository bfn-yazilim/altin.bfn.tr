const STORAGE_KEY = 'altin-takip-v2';

const TYPE_DEFS = [
  { key: 'gram', name: 'Gram Altın', sub: '24 ayar · 1 gr', karat: 24, weight: 1 },
  { key: 'ceyrek', name: 'Çeyrek Altın', sub: '22 ayar · 1,75 gr', karat: 22, weight: 1.75 },
  { key: 'yarim', name: 'Yarım Altın', sub: '22 ayar · 3,50 gr', karat: 22, weight: 3.5 },
  { key: 'tam', name: 'Tam Altın', sub: '22 ayar · 7,00 gr', karat: 22, weight: 7 },
  { key: 'cumhuriyet', name: 'Cumhuriyet Altını', sub: '22 ayar · 7,216 gr', karat: 22, weight: 7.216 },
  { key: 'ajdar', name: 'Ajda Bilezik', sub: '22 ayar · 10 gr', karat: 22, weight: 10 },
];

function unitPriceFor(def, price24, price22) {
  return def.karat === 22 ? price22 : price24;
}

const byKey = Object.fromEntries(TYPE_DEFS.map((d) => [d.key, d]));

// Backup encryption (AES-GCM + PBKDF2, Web Crypto API)
const PBKDF2_ITERATIONS = 150000;

function bufToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptText(plainText, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plainText));
  const combined = new Uint8Array(salt.length + iv.length + cipherBuf.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(cipherBuf), salt.length + iv.length);
  return bufToBase64(combined);
}

async function decryptText(cipherTextB64, password) {
  const combined = base64ToBytes(cipherTextB64);
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const data = combined.slice(28);
  const key = await deriveKey(password, salt);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plainBuf);
}

function loadState() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    saved = {};
  }
  return {
    gramPrice: saved.gramPrice ?? '',
    gramPrice22: saved.gramPrice22 ?? '',
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
  exportOpen: false,
  exportPassword: '',
  exportOutput: '',
  exportError: '',
  importOpen: false,
  importText: '',
  importPassword: '',
  importError: '',
};

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ gramPrice: state.gramPrice, gramPrice22: state.gramPrice22, entries: state.entries })
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
const gramPrice22Input = document.getElementById('gramPrice22Input');
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

const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');

const exportOverlay = document.getElementById('exportOverlay');
const closeExportBtn = document.getElementById('closeExportBtn');
const exportPasswordInput = document.getElementById('exportPasswordInput');
const exportErrorEl = document.getElementById('exportError');
const generateExportBtn = document.getElementById('generateExportBtn');
const exportResultEl = document.getElementById('exportResult');
const exportOutputEl = document.getElementById('exportOutput');
const copyExportBtn = document.getElementById('copyExportBtn');

const importOverlay = document.getElementById('importOverlay');
const closeImportBtn = document.getElementById('closeImportBtn');
const importTextArea = document.getElementById('importTextArea');
const importPasswordInput = document.getElementById('importPasswordInput');
const importErrorEl = document.getElementById('importError');
const decryptImportBtn = document.getElementById('decryptImportBtn');

function render() {
  const price24 = num(state.gramPrice);
  const price22 = num(state.gramPrice22);
  gramPriceInput.value = state.gramPrice;
  gramPrice22Input.value = state.gramPrice22;

  // Entries
  let total = 0;
  let totalBuy = 0;
  let totalWithBuyPrice = 0;
  entriesList.innerHTML = '';

  state.entries.forEach((e, i) => {
    const d = byKey[e.type] || TYPE_DEFS[0];
    const count = num(e.count);
    const amount = count * d.weight * unitPriceFor(d, price24, price22);
    const buy = num(e.buyPrice);
    total += amount;
    if (buy > 0) {
      totalBuy += buy;
      totalWithBuyPrice += amount;
    }
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

  const totalDiff = totalWithBuyPrice - totalBuy;
  const hasTotalDiff = totalBuy > 0;

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
  const addAmount = num(state.addCount) * addDef.weight * unitPriceFor(addDef, price24, price22);
  addPreviewEl.textContent = addAmount > 0 ? fmtCurrency(addAmount) : '—';

  // Export sheet
  exportOverlay.hidden = !state.exportOpen;
  exportPasswordInput.value = state.exportPassword;
  exportErrorEl.hidden = !state.exportError;
  exportErrorEl.textContent = state.exportError;
  exportResultEl.hidden = !state.exportOutput;
  exportOutputEl.value = state.exportOutput;

  // Import sheet
  importOverlay.hidden = !state.importOpen;
  importTextArea.value = state.importText;
  importPasswordInput.value = state.importPassword;
  importErrorEl.hidden = !state.importError;
  importErrorEl.textContent = state.importError;
}

// Event bindings
gramPriceInput.addEventListener('input', (e) => {
  state.gramPrice = e.target.value;
  save();
  render();
});

gramPrice22Input.addEventListener('input', (e) => {
  state.gramPrice22 = e.target.value;
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

// Backup / restore
exportBtn.addEventListener('click', () => {
  state.exportOpen = true;
  state.exportPassword = '';
  state.exportOutput = '';
  state.exportError = '';
  render();
});

closeExportBtn.addEventListener('click', () => {
  state.exportOpen = false;
  render();
});

exportOverlay.addEventListener('click', (e) => {
  if (e.target === exportOverlay) {
    state.exportOpen = false;
    render();
  }
});

exportPasswordInput.addEventListener('input', (e) => {
  state.exportPassword = e.target.value;
  render();
});

generateExportBtn.addEventListener('click', async () => {
  if (!state.exportPassword) {
    state.exportError = 'Lütfen bir şifre girin.';
    state.exportOutput = '';
    render();
    return;
  }
  try {
    const payload = JSON.stringify({
      app: 'altin-takip',
      version: 3,
      exportedAt: new Date().toISOString(),
      gramPrice: state.gramPrice,
      gramPrice22: state.gramPrice22,
      entries: state.entries,
    });
    state.exportOutput = await encryptText(payload, state.exportPassword);
    state.exportError = '';
  } catch (e) {
    state.exportOutput = '';
    state.exportError = 'Şifreleme sırasında bir hata oluştu.';
  }
  render();
});

copyExportBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(exportOutputEl.value);
    copyExportBtn.textContent = 'Kopyalandı ✓';
  } catch (e) {
    exportOutputEl.select();
    copyExportBtn.textContent = 'Seçildi, Ctrl+C ile kopyalayın';
  }
  setTimeout(() => {
    copyExportBtn.textContent = 'Kopyala';
  }, 1800);
});

importBtn.addEventListener('click', () => {
  state.importOpen = true;
  state.importText = '';
  state.importPassword = '';
  state.importError = '';
  render();
});

closeImportBtn.addEventListener('click', () => {
  state.importOpen = false;
  render();
});

importOverlay.addEventListener('click', (e) => {
  if (e.target === importOverlay) {
    state.importOpen = false;
    render();
  }
});

importTextArea.addEventListener('input', (e) => {
  state.importText = e.target.value;
  render();
});

importPasswordInput.addEventListener('input', (e) => {
  state.importPassword = e.target.value;
  render();
});

decryptImportBtn.addEventListener('click', async () => {
  if (!state.importText.trim()) {
    state.importError = 'Lütfen şifreli metni yapıştırın.';
    render();
    return;
  }
  if (!state.importPassword) {
    state.importError = 'Lütfen şifreyi girin.';
    render();
    return;
  }

  let data;
  try {
    const plainText = await decryptText(state.importText.trim(), state.importPassword);
    data = JSON.parse(plainText);
  } catch (e) {
    state.importError = 'Çözümleme başarısız: yanlış şifre ya da geçersiz metin.';
    render();
    return;
  }
  if (!data || !Array.isArray(data.entries)) {
    state.importError = 'Geçersiz yedek: beklenen veri yapısı bulunamadı.';
    render();
    return;
  }

  const proceed = confirm('Mevcut veriler, içe aktarılan yedek ile değiştirilecek. Devam edilsin mi?');
  if (!proceed) return;

  state.gramPrice = data.gramPrice ?? '';
  state.gramPrice22 = data.gramPrice22 ?? '';
  state.entries = data.entries;
  state.importOpen = false;
  state.importText = '';
  state.importPassword = '';
  state.importError = '';
  save();
  render();
  alert('Yedek başarıyla içe aktarıldı.');
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
