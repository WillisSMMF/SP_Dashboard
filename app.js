/* ==========================================
   MANTIS DASHBOARD - APP LOGIC
   ========================================== */

// URL Google Sheet yang dipublish sebagai CSV
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=408991878&single=true&output=csv';

// CORS Proxy fallback — digunakan saat membuka dari file:// lokal
const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://cors-anywhere.herokuapp.com/${url}`,
];

// ===== CHART.JS DEFAULTS =====
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = 'Inter, sans-serif';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
Chart.defaults.plugins.tooltip.backgroundColor = '#1a2235';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.titleColor = '#f1f5f9';
Chart.defaults.plugins.tooltip.bodyColor = '#94a3b8';
Chart.defaults.plugins.tooltip.cornerRadius = 8;

const PALETTE = {
  primary:   '#6366f1',
  secondary: '#8b5cf6',
  cyan:      '#22d3ee',
  emerald:   '#10b981',
  amber:     '#f59e0b',
  rose:      '#f43f5e',
  sky:       '#38bdf8',
  lime:      '#a3e635',
  orange:    '#fb923c',
  pink:      '#f472b6',
};

const MULTI = [
  '#6366f1','#22d3ee','#10b981','#f59e0b','#f43f5e',
  '#8b5cf6','#38bdf8','#a3e635','#fb923c','#f472b6',
  '#4ade80','#facc15','#60a5fa','#c084fc','#34d399',
  '#fca5a5','#6ee7b7','#93c5fd','#fbbf24','#a78bfa',
];

// ===== STATE =====
let allData = [];
let filteredData = [];
let charts = {};
let currentPage = 1;
const PAGE_SIZE = 20;
let sortCol = 'Date Submitted';
let sortDir = 'desc';
let tableFilter = { search: '', status: '', rootCause: '' };

// ===== DOM REFERENCES =====
const loadingOverlay  = document.getElementById('loadingOverlay');
const refreshBtn      = document.getElementById('refreshBtn');
const filterMonth     = document.getElementById('filterMonth');
const filterProduct   = document.getElementById('filterProduct');
const lastUpdateEl    = document.getElementById('lastUpdate');
const tableSearchEl   = document.getElementById('tableSearch');
const tableStatusEl   = document.getElementById('tableStatus');
const tableRootCauseEl= document.getElementById('tableRootCause');
const tableCountEl    = document.getElementById('tableCount');
const tableBodyEl     = document.getElementById('ticketTableBody');
const paginationEl    = document.getElementById('pagination');
const sidebarEl       = document.getElementById('sidebar');
const mainEl          = document.getElementById('main');
const sidebarToggleEl = document.getElementById('sidebarToggle');
const mobileMenuBtn   = document.getElementById('mobileMenuBtn');
const currentPageTitle= document.getElementById('currentPageTitle');

// ===== SIDEBAR =====
sidebarToggleEl.addEventListener('click', () => {
  sidebarEl.classList.toggle('collapsed');
  mainEl.classList.toggle('sidebar-collapsed');
});

mobileMenuBtn.addEventListener('click', () => {
  sidebarEl.classList.toggle('mobile-open');
});

// ===== NAVIGATION =====
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const section = item.dataset.section;
    navigateTo(section);
    sidebarEl.classList.remove('mobile-open');
  });
});

function navigateTo(section) {
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`nav-${section}`).classList.add('active');
  document.getElementById(`section-${section}`).classList.add('active');
  const titles = { overview: 'Overview', tickets: 'Daftar Tiket', sla: 'Analisis SLA', branch: 'Analisis Cabang' };
  currentPageTitle.textContent = titles[section] || section;
}

// ===== DATA LOADING =====
// Strategi: coba langsung → jika gagal (CORS file://), coba proxy satu per satu
async function loadData() {
  showLoading(true);
  refreshBtn.classList.add('spinning');

  const isLocal = location.protocol === 'file:';

  // Buat daftar URL yang akan dicoba: direct dulu, lalu masing-masing proxy
  const urlsToTry = isLocal
    ? CORS_PROXIES.map(fn => fn(SHEET_CSV_URL))
    : [SHEET_CSV_URL, ...CORS_PROXIES.map(fn => fn(SHEET_CSV_URL))];

  for (let i = 0; i < urlsToTry.length; i++) {
    const url = urlsToTry[i];
    try {
      await new Promise((resolve, reject) => {
        Papa.parse(url, {
          download: true,
          header: true,
          skipEmptyLines: true,
          complete(results) {
            const rows = results.data.filter(r => r.Id && r.Id.trim() !== '');
            if (rows.length === 0) { reject(new Error('Empty result')); return; }
            allData = rows;
            showLoading(false);
            refreshBtn.classList.remove('spinning');
            lastUpdateEl.textContent = 'Update: ' + new Date().toLocaleTimeString('id-ID');
            // Tampilkan indikator sumber data
            document.querySelector('.ds-val').textContent =
              i === 0 && !isLocal ? 'Google Sheets ✓' : `Via Proxy ${i} ✓`;
            populateFilters();
            applyGlobalFilters();
            resolve();
          },
          error(err) { reject(err); }
        });
      });
      return; // Berhasil, keluar dari loop
    } catch (err) {
      console.warn(`URL ke-${i + 1} gagal:`, url, err.message);
      if (i === urlsToTry.length - 1) {
        // Semua gagal
        showLoading(false);
        refreshBtn.classList.remove('spinning');
        document.getElementById('loadingOverlay').classList.remove('hidden');
        document.getElementById('loadingOverlay').innerHTML = `
          <div style="text-align:center;padding:32px;max-width:480px">
            <div style="font-size:2.5rem;margin-bottom:16px">⚠️</div>
            <h3 style="color:#f43f5e;margin-bottom:8px">Gagal Memuat Data</h3>
            <p style="color:#94a3b8;font-size:0.875rem;margin-bottom:20px">
              Browser memblokir akses ke Google Sheets saat dibuka dari <code style="background:#1a2235;padding:2px 6px;border-radius:4px">file://</code>.<br><br>
              <strong style="color:#f1f5f9">Solusi Tercepat:</strong><br>
              Upload folder ke <a href="https://app.netlify.com/drop" target="_blank" style="color:#6366f1">Netlify Drop</a> — gratis, drag & drop, online dalam 30 detik.
            </p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
              <button onclick="loadData()" style="padding:9px 20px;background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600">↻ Coba Lagi</button>
              <a href="https://app.netlify.com/drop" target="_blank" style="padding:9px 20px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;text-decoration:none">🚀 Buka Netlify Drop</a>
            </div>
          </div>`;
      }
    }
  }
}

function showLoading(show) {
  loadingOverlay.classList.toggle('hidden', !show);
}

// ===== POPULATE FILTERS =====
function populateFilters() {
  const months = [...new Set(allData.map(r => r.Month).filter(Boolean))];
  const monthOrder = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  months.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

  filterMonth.innerHTML = '<option value="">Semua Bulan</option>';
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    filterMonth.appendChild(opt);
  });

  const products = [...new Set(allData.map(r => r['Product Source']).filter(Boolean))].sort();
  filterProduct.innerHTML = '<option value="">Semua Produk</option>';
  products.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    filterProduct.appendChild(opt);
  });
}

// ===== FILTER HANDLERS =====
filterMonth.addEventListener('change', applyGlobalFilters);
filterProduct.addEventListener('change', applyGlobalFilters);
tableSearchEl.addEventListener('input', () => { currentPage = 1; renderTable(); });
tableStatusEl.addEventListener('change', () => { currentPage = 1; renderTable(); });
tableRootCauseEl.addEventListener('change', () => { currentPage = 1; renderTable(); });
refreshBtn.addEventListener('click', loadData);

function applyGlobalFilters() {
  const month = filterMonth.value;
  const product = filterProduct.value;
  filteredData = allData.filter(r => {
    if (month && r.Month !== month) return false;
    if (product && r['Product Source'] !== product) return false;
    return true;
  });
  renderAll();
}

// ===== RENDER ALL =====
function renderAll() {
  renderKPIs();
  renderTrendChart();
  renderStatusChart();
  renderCategoryChart();
  renderRootCauseChart();
  renderProductChart();
  renderSLASection();
  renderBranchSection();
  currentPage = 1;
  renderTable();
}

// ===== HELPERS =====
function parseSLA(val) {
  if (!val) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return n;
}

function getStatusBadge(status) {
  const s = (status || '').toLowerCase();
  const map = {
    resolved: 'resolved',
    assigned: 'assigned',
    acknowledged: 'acknowledged',
    feedback: 'feedback',
    open: 'open',
  };
  const cls = map[s] || 'open';
  return `<span class="badge badge-${cls}">${status}</span>`;
}

function getRootCauseBadge(rc) {
  const s = (rc || '').toLowerCase();
  const cls = s === 'system' ? 'system' : s === 'people' ? 'people' : s === 'process' ? 'process' : 'open';
  return rc ? `<span class="badge badge-${cls}">${rc}</span>` : '<span class="badge badge-open">-</span>';
}

function getSLADisplay(val) {
  const n = parseSLA(val);
  if (val === 'on progress') return `<span class="sla-progress">On Progress</span>`;
  if (n === null) return `<span class="sla-progress">-</span>`;
  if (n <= 1) return `<span class="sla-good">${n}h ✓</span>`;
  if (n <= 3) return `<span class="sla-warn">${n}d ⚠</span>`;
  return `<span class="sla-bad">${n}d ✗</span>`;
}

function countBy(data, key) {
  const counts = {};
  data.forEach(r => {
    const v = r[key] || 'Tidak ada';
    counts[v] = (counts[v] || 0) + 1;
  });
  return counts;
}

function topN(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function destroyChart(name) {
  if (charts[name]) { charts[name].destroy(); delete charts[name]; }
}

// ===== KPI SECTION =====
function renderKPIs() {
  const total = filteredData.length;
  const resolved = filteredData.filter(r => r.Status === 'resolved').length;
  const open = filteredData.filter(r => r.Status !== 'resolved').length;

  const slaVals = filteredData
    .map(r => parseSLA(r.SLA))
    .filter(v => v !== null);
  const avgSLA = slaVals.length ? (slaVals.reduce((a, b) => a + b, 0) / slaVals.length).toFixed(1) : '-';

  document.getElementById('kpiTotal').textContent = total.toLocaleString();
  document.getElementById('kpiResolved').textContent = resolved.toLocaleString();
  document.getElementById('kpiOpen').textContent = open.toLocaleString();
  document.getElementById('kpiSla').textContent = avgSLA;
  document.getElementById('kpiResolvedPct').textContent = total ? `${Math.round(resolved / total * 100)}%` : '-';
  document.getElementById('kpiOpenPct').textContent = total ? `${Math.round(open / total * 100)}%` : '-';
  document.getElementById('kpiSlaLabel').textContent = slaVals.length ? 'rata-rata' : '-';
}

// ===== TREND CHART =====
function renderTrendChart() {
  const monthOrder = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const months = [...new Set(filteredData.map(r => r.Month).filter(Boolean))];
  months.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

  const totalByMonth = months.map(m => filteredData.filter(r => r.Month === m).length);
  const resolvedByMonth = months.map(m => filteredData.filter(r => r.Month === m && r.Status === 'resolved').length);
  const openByMonth = months.map(m => filteredData.filter(r => r.Month === m && r.Status !== 'resolved').length);

  destroyChart('trend');
  const ctx = document.getElementById('trendChart').getContext('2d');
  charts.trend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Total',
          data: totalByMonth,
          backgroundColor: 'rgba(99,102,241,0.3)',
          borderColor: PALETTE.primary,
          borderWidth: 2,
          borderRadius: 6,
          order: 3,
        },
        {
          label: 'Resolved',
          data: resolvedByMonth,
          backgroundColor: 'rgba(16,185,129,0.3)',
          borderColor: PALETTE.emerald,
          borderWidth: 2,
          borderRadius: 6,
          order: 2,
        },
        {
          label: 'Open',
          data: openByMonth,
          backgroundColor: 'rgba(245,158,11,0.2)',
          borderColor: PALETTE.amber,
          borderWidth: 2,
          borderRadius: 6,
          order: 1,
          type: 'line',
          tension: 0.4,
          fill: false,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
      }
    }
  });
}

// ===== STATUS CHART =====
function renderStatusChart() {
  const counts = countBy(filteredData, 'Status');
  const labels = Object.keys(counts);
  const data = Object.values(counts);
  const colors = labels.map((_, i) => MULTI[i % MULTI.length]);

  destroyChart('status');
  const ctx = document.getElementById('statusChart').getContext('2d');
  charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.map(c => c + '99'), borderColor: colors, borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: { legend: { position: 'bottom' } },
    }
  });
}

// ===== CATEGORY CHART =====
function renderCategoryChart() {
  const top = topN(countBy(filteredData, 'Category'), 10);
  destroyChart('category');
  const ctx = document.getElementById('categoryChart').getContext('2d');
  charts.category = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(x => x[0].length > 30 ? x[0].slice(0, 28) + '…' : x[0]),
      datasets: [{
        label: 'Jumlah Tiket',
        data: top.map(x => x[1]),
        backgroundColor: MULTI.slice(0, top.length).map(c => c + 'aa'),
        borderColor: MULTI.slice(0, top.length),
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      }
    }
  });
}

// ===== ROOT CAUSE CHART =====
function renderRootCauseChart() {
  const counts = countBy(filteredData.filter(r => r['Root Cause']), 'Root Cause');
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const colors = [PALETTE.secondary, PALETTE.orange, PALETTE.cyan, PALETTE.rose, PALETTE.lime];

  destroyChart('rootCause');
  const ctx = document.getElementById('rootCauseChart').getContext('2d');
  charts.rootCause = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: entries.map(x => x[0]),
      datasets: [{
        data: entries.map(x => x[1]),
        backgroundColor: colors.slice(0, entries.length).map(c => c + 'bb'),
        borderColor: colors.slice(0, entries.length),
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
    }
  });
}

// ===== PRODUCT CHART =====
function renderProductChart() {
  const top = topN(countBy(filteredData, 'Product Source'), 8);
  destroyChart('product');
  const ctx = document.getElementById('productChart').getContext('2d');
  charts.product = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(x => x[0]),
      datasets: [{
        label: 'Tiket',
        data: top.map(x => x[1]),
        backgroundColor: MULTI.slice(0, top.length).map(c => c + 'cc'),
        borderColor: MULTI.slice(0, top.length),
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
      }
    }
  });
}

// ===== SLA SECTION =====
function renderSLASection() {
  const resolved = filteredData.filter(r => r.Status === 'resolved');
  const withSLA = resolved.filter(r => parseSLA(r.SLA) !== null);
  const onProgress = filteredData.filter(r => r.SLA === 'on progress').length;

  const metCount = withSLA.filter(r => parseSLA(r.SLA) <= 1).length;
  const warnCount = withSLA.filter(r => { const v = parseSLA(r.SLA); return v > 1 && v <= 3; }).length;
  const breachCount = withSLA.filter(r => parseSLA(r.SLA) > 3).length;

  document.getElementById('slaMet').textContent = metCount;
  document.getElementById('slaWarning').textContent = warnCount;
  document.getElementById('slaBreached').textContent = breachCount;
  document.getElementById('slaOnProgress').textContent = onProgress;

  renderSLADistChart(withSLA);
  renderSLAMonthChart();
  renderSLAAssigneeChart(withSLA);
  renderSLAProductChart(withSLA);
}

function renderSLADistChart(data) {
  const buckets = { '≤1 hari': 0, '2 hari': 0, '3 hari': 0, '4-7 hari': 0, '>7 hari': 0 };
  data.forEach(r => {
    const v = parseSLA(r.SLA);
    if (v <= 1) buckets['≤1 hari']++;
    else if (v === 2) buckets['2 hari']++;
    else if (v === 3) buckets['3 hari']++;
    else if (v <= 7) buckets['4-7 hari']++;
    else buckets['>7 hari']++;
  });

  destroyChart('slaDist');
  const ctx = document.getElementById('slaDistChart').getContext('2d');
  const colors = [PALETTE.emerald, PALETTE.cyan, PALETTE.amber, PALETTE.orange, PALETTE.rose];
  charts.slaDist = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        label: 'Jumlah Tiket',
        data: Object.values(buckets),
        backgroundColor: colors.map(c => c + 'aa'),
        borderColor: colors,
        borderWidth: 2,
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
      }
    }
  });
}

function renderSLAMonthChart() {
  const monthOrder = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const months = [...new Set(filteredData.map(r => r.Month).filter(Boolean))];
  months.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

  const avgByMonth = months.map(m => {
    const vals = filteredData
      .filter(r => r.Month === m && parseSLA(r.SLA) !== null)
      .map(r => parseSLA(r.SLA));
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
  });

  destroyChart('slaMonth');
  const ctx = document.getElementById('slaMonthChart').getContext('2d');
  charts.slaMonth = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'Avg SLA (hari)',
        data: avgByMonth,
        borderColor: PALETTE.cyan,
        backgroundColor: 'rgba(34,211,238,0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointBackgroundColor: PALETTE.cyan,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
      }
    }
  });
}

function renderSLAAssigneeChart(data) {
  const byAssignee = {};
  data.forEach(r => {
    const name = r['Assigned To'] || 'Tidak ada';
    if (!byAssignee[name]) byAssignee[name] = [];
    byAssignee[name].push(parseSLA(r.SLA));
  });
  const avg = Object.entries(byAssignee).map(([k, vals]) => ({
    name: k.length > 25 ? k.slice(0, 23) + '…' : k,
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    count: vals.length,
  })).sort((a, b) => b.count - a.count).slice(0, 15);

  destroyChart('slaAssignee');
  const ctx = document.getElementById('slaAssigneeChart').getContext('2d');
  charts.slaAssignee = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: avg.map(x => x.name),
      datasets: [{
        label: 'Avg SLA (hari)',
        data: avg.map(x => +x.avg.toFixed(2)),
        backgroundColor: avg.map(x => x.avg <= 1 ? '#10b98188' : x.avg <= 3 ? '#f59e0b88' : '#ef444488'),
        borderColor: avg.map(x => x.avg <= 1 ? PALETTE.emerald : x.avg <= 3 ? PALETTE.amber : '#ef4444'),
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      }
    }
  });
}

function renderSLAProductChart(data) {
  const byProduct = {};
  data.forEach(r => {
    const p = r['Product Source'] || 'Lainnya';
    if (!byProduct[p]) byProduct[p] = [];
    byProduct[p].push(parseSLA(r.SLA));
  });
  const entries = Object.entries(byProduct).map(([k, vals]) => ({
    name: k,
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
  })).sort((a, b) => a.avg - b.avg);

  destroyChart('slaProduct');
  const ctx = document.getElementById('slaProductChart').getContext('2d');
  charts.slaProduct = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(x => x.name),
      datasets: [{
        label: 'Avg SLA (hari)',
        data: entries.map(x => +x.avg.toFixed(2)),
        backgroundColor: MULTI.slice(0, entries.length).map(c => c + '99'),
        borderColor: MULTI.slice(0, entries.length),
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
      }
    }
  });
}

// ===== BRANCH SECTION =====
function renderBranchSection() {
  const top20 = topN(countBy(filteredData, 'Branch Name'), 20);
  const top10Labels = top20.slice(0, 10).map(x => x[0]);

  renderBranchBar(top20);
  renderBranchStatus(top10Labels);
  renderBranchCat(top10Labels);
  renderBranchRC(top10Labels);
}

function renderBranchBar(top20) {
  destroyChart('branchBar');
  const ctx = document.getElementById('branchBarChart').getContext('2d');
  charts.branchBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top20.map(x => x[0]),
      datasets: [{
        label: 'Jumlah Tiket',
        data: top20.map(x => x[1]),
        backgroundColor: MULTI.map(c => c + '99'),
        borderColor: MULTI,
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      }
    }
  });
}

function renderBranchStatus(top10Labels) {
  const statuses = [...new Set(filteredData.map(r => r.Status).filter(Boolean))];
  const datasets = statuses.map((st, i) => ({
    label: st,
    data: top10Labels.map(b => filteredData.filter(r => r['Branch Name'] === b && r.Status === st).length),
    backgroundColor: MULTI[i % MULTI.length] + '99',
    borderColor: MULTI[i % MULTI.length],
    borderWidth: 2,
    borderRadius: 4,
  }));

  destroyChart('branchStatus');
  const ctx = document.getElementById('branchStatusChart').getContext('2d');
  charts.branchStatus = new Chart(ctx, {
    type: 'bar',
    data: { labels: top10Labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
      }
    }
  });
}

function renderBranchCat(top10Labels) {
  const cats = topN(countBy(filteredData, 'Category'), 5).map(x => x[0]);
  const datasets = cats.map((cat, i) => ({
    label: cat.length > 20 ? cat.slice(0, 18) + '…' : cat,
    data: top10Labels.map(b => filteredData.filter(r => r['Branch Name'] === b && r.Category === cat).length),
    backgroundColor: MULTI[i % MULTI.length] + '99',
    borderColor: MULTI[i % MULTI.length],
    borderWidth: 2,
    borderRadius: 4,
  }));

  destroyChart('branchCat');
  const ctx = document.getElementById('branchCatChart').getContext('2d');
  charts.branchCat = new Chart(ctx, {
    type: 'bar',
    data: { labels: top10Labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
      }
    }
  });
}

function renderBranchRC(top10Labels) {
  const rcs = ['System', 'People', 'Process'];
  const datasets = rcs.map((rc, i) => ({
    label: rc,
    data: top10Labels.map(b => filteredData.filter(r => r['Branch Name'] === b && r['Root Cause'] === rc).length),
    backgroundColor: [PALETTE.secondary, PALETTE.orange, PALETTE.cyan][i] + '99',
    borderColor: [PALETTE.secondary, PALETTE.orange, PALETTE.cyan][i],
    borderWidth: 2,
    borderRadius: 4,
  }));

  destroyChart('branchRc');
  const ctx = document.getElementById('branchRcChart').getContext('2d');
  charts.branchRc = new Chart(ctx, {
    type: 'bar',
    data: { labels: top10Labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
      }
    }
  });
}

// ===== TABLE =====
function renderTable() {
  const search = tableSearchEl.value.toLowerCase();
  const status = tableStatusEl.value.toLowerCase();
  const rootCause = tableRootCauseEl.value;

  let rows = filteredData.filter(r => {
    if (status && (r.Status || '').toLowerCase() !== status) return false;
    if (rootCause && r['Root Cause'] !== rootCause) return false;
    if (search) {
      const combined = [r.Id, r.Summary, r['Branch Name'], r.Category, r['Product Source'], r['Assigned To']].join(' ').toLowerCase();
      if (!combined.includes(search)) return false;
    }
    return true;
  });

  // Sort
  rows.sort((a, b) => {
    let va = a[sortCol] || '';
    let vb = b[sortCol] || '';
    if (sortCol === 'Id') { va = parseInt(va) || 0; vb = parseInt(vb) || 0; }
    else if (sortCol === 'Date Submitted') { va = new Date(va); vb = new Date(vb); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  tableCountEl.textContent = `${rows.length} tiket`;
  const total = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  tableBodyEl.innerHTML = pageRows.map(r => {
    const date = r['Date Submitted'] ? r['Date Submitted'].split(' ')[0] : '-';
    const summary = (r.Summary || '-').length > 55 ? r.Summary.slice(0, 53) + '…' : (r.Summary || '-');
    const cat = (r.Category || '-').length > 25 ? r.Category.slice(0, 23) + '…' : (r.Category || '-');
    return `<tr>
      <td><strong style="color:var(--accent-primary)">#${r.Id}</strong></td>
      <td><span style="color:var(--text-secondary);font-size:0.78rem">${date}</span></td>
      <td title="${r.Summary || ''}">${summary}</td>
      <td><span style="font-size:0.78rem">${cat}</span></td>
      <td><span style="font-size:0.78rem;color:var(--accent-cyan)">${r['Product Source'] || '-'}</span></td>
      <td>${getStatusBadge(r.Status)}</td>
      <td>${getRootCauseBadge(r['Root Cause'])}</td>
      <td>${getSLADisplay(r.SLA)}</td>
      <td><span style="font-size:0.78rem">${r['Branch Name'] || '-'}</span></td>
    </tr>`;
  }).join('');

  renderPagination(total);
}

// Sortable table headers
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = col; sortDir = 'asc'; }
    renderTable();
  });
});

function renderPagination(total) {
  if (total <= 1) { paginationEl.innerHTML = ''; return; }
  const maxBtn = 7;
  let pages = [];

  if (total <= maxBtn) {
    pages = Array.from({ length: total }, (_, i) => i + 1);
  } else {
    pages = [1];
    if (currentPage > 3) pages.push('…');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(total - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < total - 2) pages.push('…');
    pages.push(total);
  }

  paginationEl.innerHTML = `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goPage(${currentPage - 1})">‹</button>
    ${pages.map(p => p === '…' ? `<span class="page-btn" style="cursor:default">…</span>` : `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`).join('')}
    <button class="page-btn" ${currentPage === total ? 'disabled' : ''} onclick="goPage(${currentPage + 1})">›</button>
  `;
}

window.goPage = (p) => { currentPage = p; renderTable(); };

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  loadData();
});
