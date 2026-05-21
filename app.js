/* ============================================================
   SMF DASHBOARD — app.js
   Data source: Google Sheets (TSV via publish-to-web)
   ============================================================ */

const SHEET_ID = '2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ';
const SHEET_GID = '408991878';
const DATA_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?gid=${SHEET_GID}&single=true&output=tsv`;
// CORS proxy fallback for local file:// access
const PROXY_URLS = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

// ── Palette ───────────────────────────────────────────────────────
const PALETTE = [
  '#4f8ef7','#9b59f5','#22d3a5','#f5a623','#f55a5a','#38d5f7',
  '#f57ef0','#a3e635','#fb923c','#60a5fa','#34d399','#f472b6',
  '#facc15','#a78bfa','#2dd4bf','#f97316','#e879f9','#4ade80',
  '#38bdf8','#fb7185'
];

// Status → group mapping
const STATUS_GROUP = {
  'OF-New':               'Baru',
  'Dupcheck-Process':     'Dupcheck',
  'Dupcheck-Success':     'Dupcheck',
  'Dupcheck-Failed':      'Dupcheck',
  'SVY-Process':          'Survey',
  'SVY-Open':             'Survey',
  'APK-Process':          'Approval',
  'APK-Open':             'Approval',
  'LOS-Open':             'LOS',
  'LOS-Reject':           'LOS',
  'Core-Process':         'Core',
  'Core-Open':            'Core',
  'Core-Cancel':          'Core',
  'MUF-Drawdown':         'Disbursement',
  'MUF-Pending_Drawdown': 'Disbursement',
  'SF-Cancel':            'Cancelled',
  'SF-RFU':               'Cancelled',
  'SF-Reject':            'Cancelled',
  'Dupcheck-Cancel':      'Cancelled',
};

const RESOLVED_STATUSES = new Set([
  'LOS-Open','LOS-Reject','MUF-Drawdown','MUF-Pending_Drawdown','Core-Process','Core-Open'
]);
const CANCELLED_STATUSES = new Set(['SF-Cancel','SF-RFU','SF-Reject','Core-Cancel','Dupcheck-Cancel']);

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

// ── App State ─────────────────────────────────────────────────────
let rawData   = [];   // all parsed rows
let filtered  = [];   // after global filters applied
let chartRefs = {};   // chart.js instances

const filters = {
  bulan:    new Set(),
  cabang:   new Set(),
  produk:   new Set(),
  kategori: new Set(),
};

// Tiket table state
const tiketState = {
  query:     '',
  status:    '',
  rootcause: '',
  sortCol:   'submitDate',
  sortDir:   -1,
  page:      1,
  pageSize:  25,
};

// ── Utility Helpers ───────────────────────────────────────────────
function parseDate(str) {
  // Format: "20 May, 2026, 11:12"
  if (!str || str.trim() === '') return null;
  try {
    const cleaned = str.replace(/,\s*(\d{2}:\d{2})$/, ' $1');
    return new Date(cleaned);
  } catch { return null; }
}

function daysDiff(a, b) {
  if (!a || !b) return null;
  const diff = (b - a) / (1000 * 60 * 60 * 24);
  return parseFloat(diff.toFixed(2));
}

function formatNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('id-ID');
}

function getMonthKey(d) {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
}

function getMonthLabel(key) {
  if (!key) return '—';
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[+m - 1]} ${y}`;
}

function getStatusGroup(status) {
  if (!status) return 'Lainnya';
  for (const [k, v] of Object.entries(STATUS_GROUP)) {
    if (status.startsWith(k)) return v;
  }
  const prefix = status.split('-')[0];
  return prefix || 'Lainnya';
}

function getStatusClass(status) {
  if (!status) return '';
  if (status === 'OF-New') return 'status-OF-New';
  if (status.startsWith('Dupcheck')) return 'status-Dupcheck';
  if (status.startsWith('SVY')) return 'status-SVY';
  if (status.startsWith('APK')) return 'status-APK';
  if (status.startsWith('LOS')) return 'status-LOS';
  if (status.startsWith('MUF')) return 'status-MUF';
  if (status.startsWith('Core')) return 'status-Core';
  if (status.startsWith('SF')) return 'status-SF';
  return '';
}

function getSlaClass(days) {
  if (days === null || days === undefined) return '';
  if (days <= 1) return 'sla-fast';
  if (days <= 3) return 'sla-normal';
  return 'sla-slow';
}

function isResolved(row) {
  for (const s of RESOLVED_STATUSES) if (row.status.startsWith(s)) return true;
  return false;
}

function isCancelled(row) {
  for (const s of CANCELLED_STATUSES) if (row.status.startsWith(s)) return true;
  return false;
}

function topN(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function avg(arr) {
  const valid = arr.filter(v => v !== null && !isNaN(v));
  if (!valid.length) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

// ── Parse TSV ─────────────────────────────────────────────────────
function parseTSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  // header: Branch Name, Cust Name, Purchase Purpose Name, Status, Order Number, Pega ID, Submit Date, Updated At
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 5) continue;
    const branch     = (cols[0] || '').trim();
    const custName   = (cols[1] || '').trim();
    const product    = (cols[2] || '').trim() || '(Tidak Ada)';
    const status     = (cols[3] || '').trim();
    const orderNum   = (cols[4] || '').trim();
    const pegaId     = (cols[5] || '').trim();
    const submitStr  = (cols[6] || '').trim();
    const updatedStr = (cols[7] || '').trim();

    if (!orderNum) continue;

    const submitDate  = parseDate(submitStr);
    const updatedDate = parseDate(updatedStr);
    const sla = (submitDate && updatedDate) ? daysDiff(submitDate, updatedDate) : null;
    const monthKey = getMonthKey(submitDate);

    rows.push({
      branch, custName, product, status, orderNum, pegaId,
      submitDate, updatedDate, sla, monthKey,
      statusGroup: getStatusGroup(status),
      dayStr: submitDate ? submitDate.toISOString().slice(0,10) : null,
    });
  }
  return rows;
}

// ── Fetch Data (with CORS proxy fallback) ────────────────────────
async function tryFetch(url) {
  const resp = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const text = await resp.text();
  // Sanity check: must look like TSV with our expected header
  if (!text.includes('Branch Name') && !text.includes('SMF-')) throw new Error('Unexpected response format');
  return text;
}

async function fetchData() {
  showLoading(true);
  const urlsToTry = [DATA_URL, ...PROXY_URLS.map(fn => fn(DATA_URL))];
  let lastErr = null;

  for (const url of urlsToTry) {
    try {
      const text = await tryFetch(url);
      rawData = parseTSV(text);
      document.getElementById('last-update-text').textContent =
        'Update: ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      // Always re-init filters (handles fresh data on refresh)
      initFilters();
      applyFilters();
      showLoading(false);
      return;
    } catch (err) {
      console.warn('Fetch attempt failed for:', url, err.message);
      lastErr = err;
    }
  }

  showLoading(false);
  document.getElementById('last-update-text').textContent = 'Gagal memuat';
  document.getElementById('loading-overlay').innerHTML = `
    <div style="text-align:center;padding:32px;max-width:400px">
      <div style="font-size:48px;margin-bottom:16px">⚠️</div>
      <h3 style="color:#e8eaf6;margin-bottom:8px">Gagal Memuat Data</h3>
      <p style="color:#8892b0;font-size:13px;margin-bottom:20px">
        Pastikan koneksi internet aktif dan Google Sheet sudah dipublikasikan ke web.<br/>
        Error: ${lastErr?.message || 'Unknown'}
      </p>
      <button onclick="location.reload()" style="background:#4f8ef7;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-family:Inter,sans-serif;font-size:14px;font-weight:600">
        ↻ Coba Lagi
      </button>
    </div>`;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

// ── Build Filter Options ──────────────────────────────────────────
function initFilters() {
  // Clear existing filter items (for refresh support)
  ['bulan','cabang','produk','kategori'].forEach(k => {
    const dd = document.getElementById(`dropdown-${k}`);
    if (dd) dd.innerHTML = '';
    filters[k].clear();
    const btn = document.getElementById(`btn-filter-${k}`);
    if (btn) btn.innerHTML = `Semua <span class="arrow">▾</span>`;
  });
  // Clear status/rootcause selects (keep first option)
  const sel = document.getElementById('tiket-filter-status');
  while (sel.options.length > 1) sel.remove(1);
  const rcSel = document.getElementById('tiket-filter-rootcause');
  while (rcSel.options.length > 1) rcSel.remove(1);
  // Collect unique values
  const months   = [...new Set(rawData.map(r => r.monthKey).filter(Boolean))].sort();
  const branches  = [...new Set(rawData.map(r => r.branch).filter(Boolean))].sort();
  const products  = [...new Set(rawData.map(r => r.product).filter(Boolean))].sort();
  const statuses  = [...new Set(rawData.map(r => r.statusGroup).filter(Boolean))].sort();

  buildMultiSelect('bulan',    months,   m => getMonthLabel(m));
  buildMultiSelect('cabang',   branches, b => b);
  buildMultiSelect('produk',   products, p => p);
  buildMultiSelect('kategori', statuses, s => s);

  // Tiket table status dropdown
  const allStatuses = [...new Set(rawData.map(r => r.status).filter(Boolean))].sort();
  allStatuses.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  });

  // Root cause dropdown for tiket
  const rcGroups = [...new Set(rawData.map(r => r.statusGroup))].sort();
  rcGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    rcSel.appendChild(opt);
  });
}

function buildMultiSelect(key, values, labelFn) {
  const dropdown = document.getElementById(`dropdown-${key}`);
  const btn      = document.getElementById(`btn-filter-${key}`);

  // Search box inside dropdown
  const searchEl = document.createElement('input');
  searchEl.type = 'text';
  searchEl.placeholder = 'Cari...';
  searchEl.className = 'msd-search';
  searchEl.addEventListener('input', () => {
    const q = searchEl.value.toLowerCase();
    dropdown.querySelectorAll('.msd-item').forEach(item => {
      item.style.display = item.dataset.value.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  dropdown.appendChild(searchEl);

  values.forEach(val => {
    const item = document.createElement('label');
    item.className = 'msd-item';
    item.dataset.value = val;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = val;
    cb.addEventListener('change', () => {
      if (cb.checked) { filters[key].add(val); item.classList.add('selected'); }
      else            { filters[key].delete(val); item.classList.remove('selected'); }
      updateBtnLabel(key, btn, values.length);
      applyFilters();
    });

    item.appendChild(cb);
    item.appendChild(document.createTextNode(' ' + labelFn(val)));
    dropdown.appendChild(item);
  });

  // Toggle dropdown
  btn.addEventListener('click', e => {
    e.stopPropagation();
    closeAllDropdowns(key);
    dropdown.classList.toggle('open');
    btn.classList.toggle('open');
    if (dropdown.classList.contains('open')) searchEl.focus();
  });
}

function closeAllDropdowns(except) {
  ['bulan','cabang','produk','kategori'].forEach(k => {
    if (k === except) return;
    document.getElementById(`dropdown-${k}`).classList.remove('open');
    document.getElementById(`btn-filter-${k}`).classList.remove('open');
  });
}

document.addEventListener('click', () => {
  ['bulan','cabang','produk','kategori'].forEach(k => {
    document.getElementById(`dropdown-${k}`)?.classList.remove('open');
    document.getElementById(`btn-filter-${k}`)?.classList.remove('open');
  });
});

function updateBtnLabel(key, btn, total) {
  const sel = filters[key].size;
  btn.innerHTML = sel === 0
    ? `Semua <span class="arrow">▾</span>`
    : `${sel}/${total} dipilih <span class="arrow">▾</span>`;
}

document.getElementById('reset-filters').addEventListener('click', () => {
  ['bulan','cabang','produk','kategori'].forEach(k => {
    filters[k].clear();
    const btn = document.getElementById(`btn-filter-${k}`);
    btn.innerHTML = `Semua <span class="arrow">▾</span>`;
    document.getElementById(`dropdown-${k}`).querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    document.getElementById(`dropdown-${k}`).querySelectorAll('.msd-item').forEach(item => {
      item.classList.remove('selected');
    });
  });
  applyFilters();
});

// ── Apply Filters ─────────────────────────────────────────────────
function applyFilters() {
  filtered = rawData.filter(r => {
    if (filters.bulan.size    && !filters.bulan.has(r.monthKey))      return false;
    if (filters.cabang.size   && !filters.cabang.has(r.branch))       return false;
    if (filters.produk.size   && !filters.produk.has(r.product))      return false;
    if (filters.kategori.size && !filters.kategori.has(r.statusGroup)) return false;
    return true;
  });
  renderActiveSection();
}

// ── Navigation ────────────────────────────────────────────────────
const SECTIONS = {
  overview: { title: 'Overview', sub: 'KPI & Tren Bulanan' },
  cabang:   { title: 'Cabang',   sub: 'Analisis per Kantor Cabang' },
  editdata: { title: 'Edit Data', sub: 'Permintaan Edit Data per Tag & Cabang' },
  sla:      { title: 'SLA',      sub: 'Breakdown & Analisis Service Level Agreement' },
  tiket:    { title: 'Tiket',    sub: 'Tabel Lengkap Tiket dengan Search & Filter' },
};

let activeSection = 'overview';

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const sec = item.dataset.section;
    setSection(sec);
  });
});

function setSection(sec) {
  activeSection = sec;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.section === sec));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === `section-${sec}`));
  const meta = SECTIONS[sec];
  document.getElementById('page-title').textContent = meta.title;
  document.getElementById('page-sub').textContent   = meta.sub;
  renderActiveSection();
}

function renderActiveSection() {
  if (activeSection === 'overview')  renderOverview();
  if (activeSection === 'cabang')    renderCabang();
  if (activeSection === 'editdata')  renderEditData();
  if (activeSection === 'sla')       renderSLA();
  if (activeSection === 'tiket')     { tiketState.page = 1; renderTiket(); }
}

// ── Destroy & Recreate Chart ──────────────────────────────────────
function createChart(id, type, data, options = {}) {
  if (chartRefs[id]) { chartRefs[id].destroy(); }
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  chartRefs[id] = new Chart(ctx, { type, data, options: deepMerge(defaultOpts(type), options) });
}

function defaultOpts(type) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#8892b0', font: { family: 'Inter', size: 11 }, boxWidth: 12 }
      },
      tooltip: {
        backgroundColor: '#161c35',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#e8eaf6',
        bodyColor: '#8892b0',
        padding: 10,
        callbacks: {
          label: ctx => {
            const v = ctx.parsed?.y ?? ctx.parsed ?? ctx.formattedValue;
            return ` ${ctx.dataset.label || ctx.label}: ${typeof v === 'number' ? v.toLocaleString('id-ID') : v}`;
          }
        }
      }
    },
    animation: { duration: 400 }
  };

  if (['bar','line'].includes(type)) {
    base.scales = {
      x: {
        ticks: { color: '#8892b0', font: { family: 'Inter', size: 11 }, maxRotation: 45 },
        grid: { color: 'rgba(255,255,255,0.04)' }
      },
      y: {
        ticks: { color: '#8892b0', font: { family: 'Inter', size: 11 } },
        grid: { color: 'rgba(255,255,255,0.06)' }
      }
    };
  }

  return base;
}

function deepMerge(target, source) {
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = target[key] || {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// ── ① OVERVIEW ───────────────────────────────────────────────────
function renderOverview() {
  const data = filtered;
  const total = data.length;
  const resolved = data.filter(r => isResolved(r)).length;
  const open = data.filter(r => !isResolved(r) && !isCancelled(r)).length;
  const slaVals = data.map(r => r.sla).filter(v => v !== null && v >= 0);
  const avgSla = slaVals.length ? (slaVals.reduce((s,v) => s+v, 0) / slaVals.length).toFixed(1) : '—';

  document.getElementById('kpi-total-val').textContent  = formatNum(total);
  document.getElementById('kpi-selesai-val').textContent = formatNum(resolved);
  document.getElementById('kpi-open-val').textContent   = formatNum(open);
  document.getElementById('kpi-sla-val').textContent    = avgSla !== '—' ? avgSla + ' hr' : '—';

  // Tren per bulan
  const byMonth = {};
  data.forEach(r => { if (r.monthKey) { byMonth[r.monthKey] = (byMonth[r.monthKey]||0) + 1; } });
  const monthKeys = Object.keys(byMonth).sort();
  createChart('chart-tren-bulan', 'line', {
    labels: monthKeys.map(getMonthLabel),
    datasets: [{
      label: 'Tiket',
      data: monthKeys.map(k => byMonth[k]),
      borderColor: '#4f8ef7',
      backgroundColor: 'rgba(79,142,247,0.12)',
      tension: 0.4,
      fill: true,
      pointBackgroundColor: '#4f8ef7',
      pointRadius: 4,
    }]
  }, {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#8892b0', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#8892b0', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true }
    }
  });

  // Status donut
  const byStatus = {};
  data.forEach(r => { byStatus[r.status] = (byStatus[r.status]||0) + 1; });
  const statusEntries = topN(byStatus, 10);
  createChart('chart-status-donut', 'doughnut', {
    labels: statusEntries.map(e => e[0]),
    datasets: [{ data: statusEntries.map(e => e[1]), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#161c35' }]
  }, {
    plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } },
    cutout: '62%',
  });

  // Top Kategori (product)
  const byProd = {};
  data.forEach(r => { if (r.product) byProd[r.product] = (byProd[r.product]||0) + 1; });
  const prodEntries = topN(byProd, 6);
  createChart('chart-top-kategori', 'bar', {
    labels: prodEntries.map(e => e[0]),
    datasets: [{ label: 'Tiket', data: prodEntries.map(e => e[1]), backgroundColor: PALETTE.slice(0,6), borderRadius: 6 }]
  }, {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  });

  // Root cause (status group)
  const byRc = {};
  data.forEach(r => { byRc[r.statusGroup] = (byRc[r.statusGroup]||0) + 1; });
  const rcEntries = topN(byRc, 8);
  createChart('chart-root-cause', 'bar', {
    labels: rcEntries.map(e => e[0]),
    datasets: [{ label: 'Tiket', data: rcEntries.map(e => e[1]), backgroundColor: PALETTE.slice(2, 10), borderRadius: 6 }]
  }, {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  });

  // Per Produk (horizontal bar)
  const prodAll = topN(byProd, 8);
  createChart('chart-per-produk', 'bar', {
    labels: prodAll.map(e => e[0]),
    datasets: [{ label: 'Tiket', data: prodAll.map(e => e[1]), backgroundColor: PALETTE.slice(4, 12), borderRadius: 6 }]
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, ticks: { color: '#8892b0' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#8892b0', font: { size: 11 } }, grid: { display: false } }
    }
  });
}

// ── ② CABANG ─────────────────────────────────────────────────────
function renderCabang() {
  const data = filtered;

  // Count per branch
  const byBranch = {};
  data.forEach(r => { if (r.branch) byBranch[r.branch] = (byBranch[r.branch]||0) + 1; });
  const top20 = topN(byBranch, 20);

  // Top 20 bar
  createChart('chart-top-cabang', 'bar', {
    labels: top20.map(e => e[0]),
    datasets: [{ label: 'Total Tiket', data: top20.map(e => e[1]), backgroundColor: '#4f8ef7', borderRadius: 6 }]
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, ticks: { color: '#8892b0' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#8892b0', font: { size: 10 } }, grid: { display: false } }
    }
  });

  // Status stacked per cabang (top 10)
  const top10br = topN(byBranch, 10).map(e => e[0]);
  const allGroups = [...new Set(data.map(r => r.statusGroup))].sort();
  const stackedDatasets = allGroups.map((g, i) => ({
    label: g,
    data: top10br.map(br => data.filter(r => r.branch === br && r.statusGroup === g).length),
    backgroundColor: PALETTE[i % PALETTE.length],
    borderRadius: 3,
  }));
  createChart('chart-cabang-stacked', 'bar', {
    labels: top10br,
    datasets: stackedDatasets
  }, {
    plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
    scales: {
      x: { stacked: true, ticks: { color: '#8892b0', font: { size: 9 }, maxRotation: 60 }, grid: { display: false } },
      y: { stacked: true, ticks: { color: '#8892b0', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  });

  // Breakdown kategori (produk) per cabang top 10
  const allProds = [...new Set(data.map(r => r.product))].sort();
  const prodDatasets = allProds.slice(0,6).map((p, i) => ({
    label: p,
    data: top10br.map(br => data.filter(r => r.branch === br && r.product === p).length),
    backgroundColor: PALETTE[i % PALETTE.length],
    borderRadius: 3,
  }));
  createChart('chart-cabang-kategori', 'bar', {
    labels: top10br,
    datasets: prodDatasets
  }, {
    plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
    scales: {
      x: { stacked: true, ticks: { color: '#8892b0', font: { size: 9 }, maxRotation: 60 }, grid: { display: false } },
      y: { stacked: true, ticks: { color: '#8892b0', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  });

  // Root cause per cabang top 10
  const rcGroups = [...new Set(data.map(r => r.statusGroup))].sort();
  const rcDatasets = rcGroups.slice(0,6).map((g, i) => ({
    label: g,
    data: top10br.map(br => data.filter(r => r.branch === br && r.statusGroup === g).length),
    backgroundColor: PALETTE[(i + 4) % PALETTE.length],
    borderRadius: 3,
  }));
  createChart('chart-cabang-rootcause', 'bar', {
    labels: top10br,
    datasets: rcDatasets
  }, {
    plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
    scales: {
      x: { stacked: true, ticks: { color: '#8892b0', font: { size: 9 }, maxRotation: 60 }, grid: { display: false } },
      y: { stacked: true, ticks: { color: '#8892b0', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  });
}

// ── ③ EDIT DATA ───────────────────────────────────────────────────
function renderEditData() {
  // "Edit Data" is inferred from tickets — treat each ticket as a data edit request
  // Tag = Purchase Purpose Name (product field)
  const data = filtered;

  // Daily trend
  const byDay = {};
  data.forEach(r => { if (r.dayStr) byDay[r.dayStr] = (byDay[r.dayStr]||0) + 1; });
  const days = Object.keys(byDay).sort().slice(-60); // last 60 days
  createChart('chart-editdata-harian', 'line', {
    labels: days.map(d => {
      const dt = new Date(d);
      return `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]}`;
    }),
    datasets: [{
      label: 'Jumlah',
      data: days.map(d => byDay[d]),
      borderColor: '#22d3a5',
      backgroundColor: 'rgba(34,211,165,0.1)',
      tension: 0.4, fill: true, pointRadius: 2,
    }]
  }, {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#8892b0', font: { size: 10 }, maxTicksLimit: 20 }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { beginAtZero: true, ticks: { color: '#8892b0', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
    }
  });

  // Tag (purchase purpose)
  const byTag = {};
  data.forEach(r => { if (r.product) byTag[r.product] = (byTag[r.product]||0) + 1; });
  const tagEntries = topN(byTag, 8);
  createChart('chart-editdata-tag', 'doughnut', {
    labels: tagEntries.map(e => e[0]),
    datasets: [{ data: tagEntries.map(e => e[1]), backgroundColor: PALETTE.slice(0,8), borderWidth: 2, borderColor: '#161c35' }]
  }, {
    plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } },
    cutout: '58%',
  });

  // Edit data per cabang top 20
  const byBranch = {};
  data.forEach(r => { if (r.branch) byBranch[r.branch] = (byBranch[r.branch]||0) + 1; });
  const top20br = topN(byBranch, 20);
  createChart('chart-editdata-cabang', 'bar', {
    labels: top20br.map(e => e[0]),
    datasets: [{ label: 'Edit Data', data: top20br.map(e => e[1]), backgroundColor: '#9b59f5', borderRadius: 6 }]
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, ticks: { color: '#8892b0' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#8892b0', font: { size: 10 } }, grid: { display: false } }
    }
  });

  // Detail table: Tag x Cabang
  const tableMap = {};
  data.forEach(r => {
    const key = `${r.product}|||${r.branch}`;
    tableMap[key] = (tableMap[key]||0) + 1;
  });
  const tableRows = Object.entries(tableMap)
    .map(([k, v]) => { const [tag, br] = k.split('|||'); return { tag, branch: br, count: v }; })
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

  const tbody = document.getElementById('editdata-tbody');
  tbody.innerHTML = tableRows.map(r => `
    <tr>
      <td>${r.tag}</td>
      <td>${r.branch}</td>
      <td><strong>${r.count}</strong></td>
    </tr>
  `).join('');
}

// ── ④ SLA ─────────────────────────────────────────────────────────
function renderSLA() {
  const data = filtered.filter(r => r.sla !== null && r.sla >= 0);

  const le1  = data.filter(r => r.sla <= 1).length;
  const two3 = data.filter(r => r.sla > 1 && r.sla <= 3).length;
  const gt3  = data.filter(r => r.sla > 3).length;
  const totalSla = data.length;
  const avgOverall = totalSla ? (data.reduce((s,r)=>s+r.sla,0)/totalSla).toFixed(1) : '—';

  document.getElementById('sla-le1-val').textContent  = `${le1} (${totalSla ? Math.round(le1/totalSla*100) : 0}%)`;
  document.getElementById('sla-2-3-val').textContent  = `${two3} (${totalSla ? Math.round(two3/totalSla*100) : 0}%)`;
  document.getElementById('sla-gt3-val').textContent  = `${gt3} (${totalSla ? Math.round(gt3/totalSla*100) : 0}%)`;
  document.getElementById('sla-avg-val').textContent  = avgOverall !== '—' ? avgOverall + ' hari' : '—';

  // Donut distribution
  createChart('chart-sla-donut', 'doughnut', {
    labels: ['≤ 1 hari', '2–3 hari', '> 3 hari'],
    datasets: [{
      data: [le1, two3, gt3],
      backgroundColor: ['#22d3a5','#f5a623','#f55a5a'],
      borderWidth: 2, borderColor: '#161c35'
    }]
  }, {
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 11 } } },
      tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString('id-ID')} tiket` } }
    },
    cutout: '60%',
  });

  // Avg SLA per month
  const monthSla = {};
  data.forEach(r => {
    if (!r.monthKey) return;
    if (!monthSla[r.monthKey]) monthSla[r.monthKey] = [];
    monthSla[r.monthKey].push(r.sla);
  });
  const monthKeys = Object.keys(monthSla).sort();
  createChart('chart-sla-bulan', 'line', {
    labels: monthKeys.map(getMonthLabel),
    datasets: [{
      label: 'Avg SLA (hari)',
      data: monthKeys.map(k => parseFloat(avg(monthSla[k]).toFixed(2))),
      borderColor: '#f5a623',
      backgroundColor: 'rgba(245,166,35,0.1)',
      tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#f5a623',
    }]
  }, {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#8892b0', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { beginAtZero: true, ticks: { color: '#8892b0', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
    }
  });

  // Avg SLA per produk
  const prodSla = {};
  data.forEach(r => {
    if (!prodSla[r.product]) prodSla[r.product] = [];
    prodSla[r.product].push(r.sla);
  });
  const prodEntries = Object.entries(prodSla)
    .map(([k, v]) => [k, parseFloat(avg(v).toFixed(2))])
    .sort((a,b) => b[1]-a[1])
    .slice(0,10);
  createChart('chart-sla-produk', 'bar', {
    labels: prodEntries.map(e => e[0]),
    datasets: [{
      label: 'Avg SLA (hari)',
      data: prodEntries.map(e => e[1]),
      backgroundColor: prodEntries.map(e => e[1] > 3 ? '#f55a5a' : e[1] > 1 ? '#f5a623' : '#22d3a5'),
      borderRadius: 6
    }]
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, ticks: { color: '#8892b0' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#8892b0', font: { size: 11 } }, grid: { display: false } }
    }
  });

  // Avg SLA per status group
  const groupSla = {};
  data.forEach(r => {
    if (!groupSla[r.statusGroup]) groupSla[r.statusGroup] = [];
    groupSla[r.statusGroup].push(r.sla);
  });
  const groupEntries = Object.entries(groupSla)
    .map(([k, v]) => [k, parseFloat(avg(v).toFixed(2))])
    .sort((a,b) => b[1]-a[1]);
  createChart('chart-sla-statusgroup', 'bar', {
    labels: groupEntries.map(e => e[0]),
    datasets: [{
      label: 'Avg SLA (hari)',
      data: groupEntries.map(e => e[1]),
      backgroundColor: groupEntries.map(e => e[1] > 3 ? '#f55a5a' : e[1] > 1 ? '#f5a623' : '#22d3a5'),
      borderRadius: 6
    }]
  }, {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, ticks: { color: '#8892b0' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#8892b0', font: { size: 11 } }, grid: { display: false } }
    }
  });
}

// ── ⑤ TIKET TABLE ─────────────────────────────────────────────────
function renderTiket() {
  const { query, status, rootcause, sortCol, sortDir, page, pageSize } = tiketState;

  let rows = filtered.filter(r => {
    if (status    && r.status !== status)         return false;
    if (rootcause && r.statusGroup !== rootcause) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!(r.orderNum.toLowerCase().includes(q) ||
            r.custName.toLowerCase().includes(q)  ||
            r.branch.toLowerCase().includes(q)    ||
            r.product.toLowerCase().includes(q)   ||
            r.status.toLowerCase().includes(q)))    return false;
    }
    return true;
  });

  // Sort
  rows.sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (sortCol === 'submitDate') { av = a.submitDate?.getTime() || 0; bv = b.submitDate?.getTime() || 0; }
    if (sortCol === 'sla')        { av = a.sla ?? -1; bv = b.sla ?? -1; }
    if (av === null || av === undefined) av = '';
    if (bv === null || bv === undefined) bv = '';
    if (av < bv) return -1 * sortDir;
    if (av > bv) return  1 * sortDir;
    return 0;
  });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  document.getElementById('tiket-count').textContent = `${total.toLocaleString('id-ID')} tiket`;

  const tbody = document.getElementById('tiket-tbody');
  tbody.innerHTML = pageRows.map(r => {
    const slaClass = getSlaClass(r.sla);
    const statusCls = getStatusClass(r.status);
    const dateStr = r.submitDate
      ? r.submitDate.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })
      : '—';
    return `
      <tr>
        <td><strong>${r.orderNum}</strong>${r.pegaId ? `<br/><small style="color:#4a5568;font-size:10px">${r.pegaId}</small>` : ''}</td>
        <td>${r.branch || '—'}</td>
        <td>${r.custName || '—'}</td>
        <td>${r.product || '—'}</td>
        <td><span class="status-badge ${statusCls}">${r.status}</span></td>
        <td>${r.statusGroup}</td>
        <td>${dateStr}</td>
        <td class="${slaClass}">${r.sla !== null ? r.sla.toFixed(1) : '—'}</td>
      </tr>`;
  }).join('');

  renderPagination(page, totalPages);
}

function renderPagination(current, total) {
  const container = document.getElementById('pagination');
  container.innerHTML = '';

  const btn = (label, page, active = false, disabled = false, ellipsis = false) => {
    const b = document.createElement('button');
    b.className = 'page-btn' + (active ? ' active' : '') + (ellipsis ? ' ellipsis' : '');
    b.textContent = label;
    b.disabled = disabled;
    if (!disabled && !ellipsis) {
      b.addEventListener('click', () => {
        tiketState.page = page;
        renderTiket();
        document.getElementById('section-tiket').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    return b;
  };

  container.appendChild(btn('‹ Prev', current - 1, false, current <= 1));

  const pages = paginationRange(current, total);
  pages.forEach(p => {
    if (p === '...') container.appendChild(btn('…', null, false, false, true));
    else container.appendChild(btn(p, p, p === current));
  });

  container.appendChild(btn('Next ›', current + 1, false, current >= total));
}

function paginationRange(current, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

// Tiket event listeners
document.getElementById('tiket-search').addEventListener('input', e => {
  tiketState.query = e.target.value;
  tiketState.page = 1;
  renderTiket();
});

document.getElementById('tiket-filter-status').addEventListener('change', e => {
  tiketState.status = e.target.value;
  tiketState.page = 1;
  renderTiket();
});

document.getElementById('tiket-filter-rootcause').addEventListener('change', e => {
  tiketState.rootcause = e.target.value;
  tiketState.page = 1;
  renderTiket();
});

// Column sorting
document.querySelectorAll('.data-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (tiketState.sortCol === col) {
      tiketState.sortDir *= -1;
    } else {
      tiketState.sortCol = col;
      tiketState.sortDir = -1;
    }
    document.querySelectorAll('.data-table th').forEach(h => h.classList.remove('sort-asc','sort-desc'));
    th.classList.add(tiketState.sortDir === 1 ? 'sort-asc' : 'sort-desc');
    tiketState.page = 1;
    renderTiket();
  });
});

// ── Refresh Button ────────────────────────────────────────────────
document.getElementById('refresh-btn').addEventListener('click', () => {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  fetchData().finally(() => btn.classList.remove('spinning'));
});

// ── Chart.js Global Defaults ──────────────────────────────────────
Chart.defaults.font.family = 'Inter';
Chart.defaults.color = '#8892b0';

// ── Bootstrap ─────────────────────────────────────────────────────
fetchData();
