/* ==========================================
   MANTIS DASHBOARD - APP LOGIC (UPDATED MULTI-SHEET)
   ========================================== */

// URL Google Sheet yang dipublish sebagai CSV
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=408991878&single=true&output=csv';
const HELPER_TAG_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=1035358319&single=true&output=csv';

// CORS Proxy fallback — digunakan saat membuka dari file:// lokal
const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://cors-anywhere.herokuapp.com/${url}`,
];

// ===== CHART.JS DEFAULTS =====
if (window.Chart) {
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
}

const PALETTE = {
  primary:   '#6366f1', secondary: '#8b5cf6', cyan: '#22d3ee', emerald: '#10b981',
  amber:     '#f59e0b', rose: '#f43f5e', sky: '#38bdf8', lime: '#a3e635',
  orange:    '#fb923c', pink: '#f472b6',
};

const MULTI = [
  '#6366f1','#22d3ee','#10b981','#f59e0b','#f43f5e',
  '#8b5cf6','#38bdf8','#a3e635','#fb923c','#f472b6'
];

// ===== STATE =====
let allData = [];
let filteredData = [];
let charts = {};
let currentPage = 1;
const PAGE_SIZE = 20;
let sortCol = 'Date Submitted';
let sortDir = 'desc';

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

// ===== EVENT LISTENERS SAFETY SETUP =====
if (sidebarToggleEl && sidebarEl && mainEl) {
  sidebarToggleEl.addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
    mainEl.classList.toggle('sidebar-collapsed');
  });
}
if (mobileMenuBtn && sidebarEl) {
  mobileMenuBtn.addEventListener('click', () => {
    sidebarEl.classList.toggle('mobile-open');
  });
}

const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const section = item.dataset.section || item.id.replace('nav-', '');
    navigateTo(section);
    if (sidebarEl) sidebarEl.classList.remove('mobile-open');
  });
});

function navigateTo(section) {
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  
  const targetNav = document.getElementById(`nav-${section}`);
  const targetSec = document.getElementById(`section-${section}`);
  if (targetNav) targetNav.classList.add('active');
  if (targetSec) targetSec.classList.add('active');
  
  const titles = { overview: 'Overview', tickets: 'Daftar Tiket', sla: 'Analisis SLA', branch: 'Analisis Cabang', tag: 'Analisis Tag' };
  if (currentPageTitle) currentPageTitle.textContent = titles[section] || section;
}

// Helper fetch data tunggal dengan penanganan proxy fallback
async function parseCSVData(rawUrl) {
  const isLocal = location.protocol === 'file:';
  const urlsToTry = isLocal ? CORS_PROXIES.map(fn => fn(rawUrl)) : [rawUrl, ...CORS_PROXIES.map(fn => fn(rawUrl))];

  for (let i = 0; i < urlsToTry.length; i++) {
    try {
      return await new Promise((resolve, reject) => {
        Papa.parse(urlsToTry[i], {
          download: true,
          header: true,
          skipEmptyLines: true,
          complete: results => resolve(results.data),
          error: err => reject(err)
        });
      });
    } catch (err) {
      if (i === urlsToTry.length - 1) throw err;
    }
  }
}

// ===== MULTI-SHEET DATA LOADING =====
async function loadData() {
  showLoading(true);
  if (refreshBtn) refreshBtn.classList.add('spinning');

  try {
    // Ambil data dari kedua sheet secara paralel
    const [mainRows, tagRows] = await Promise.all([
      parseCSVData(SHEET_CSV_URL),
      parseCSVData(HELPER_TAG_CSV_URL).catch(() => []) // Jangan gagalkan sistem jika data tag gagal dimuat
    ]);

    // Mapping helper tag berdasarkan tiket ID
    const tagMap = {};
    tagRows.forEach(row => {
      const id = row.Id || row.id;
      const tag = row.Tag || row.tag || row.Helper_Tag;
      if (id && tag) {
        if (!tagMap[id]) tagMap[id] = [];
        tagMap[id].push(tag.trim());
      }
    });

    // Gabungkan tag ke data utama
    allData = mainRows.filter(r => r.Id && r.Id.trim() !== '').map(ticket => {
      ticket.Tags = tagMap[ticket.Id] || [];
      return ticket;
    });

    showLoading(false);
    if (refreshBtn) refreshBtn.classList.remove('spinning');
    if (lastUpdateEl) lastUpdateEl.textContent = 'Update: ' + new Date().toLocaleTimeString('id-ID');
    
    const dsValEl = document.querySelector('.ds-val');
    if (dsValEl) dsValEl.textContent = 'Google Sheets Multi-Tab ✓';

    populateFilters();
    applyGlobalFilters();
  } catch (err) {
    console.error(err);
    showLoading(false);
    if (refreshBtn) refreshBtn.classList.remove('spinning');
    if (loadingOverlay) {
      loadingOverlay.classList.remove('hidden');
      loadingOverlay.innerHTML = `<div style="text-align:center;padding:32px;"><h3 style="color:#f43f5e">Gagal Sinkronisasi Data Google Sheets</h3><button onclick="loadData()" style="margin-top:12px;padding:8px 16px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;">Coba Lagi</button></div>`;
    }
  }
}

function showLoading(show) {
  if (loadingOverlay) loadingOverlay.classList.toggle('hidden', !show);
}

function populateFilters() {
  if (!filterMonth || !filterProduct) return;
  const months = [...new Set(allData.map(r => r.Month).filter(Boolean))];
  filterMonth.innerHTML = '<option value="">Semua Bulan</option>';
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m; filterMonth.appendChild(opt);
  });

  const products = [...new Set(allData.map(r => r['Product Source']).filter(Boolean))].sort();
  filterProduct.innerHTML = '<option value="">Semua Produk</option>';
  products.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p; filterProduct.appendChild(opt);
  });
}

if (filterMonth) filterMonth.addEventListener('change', applyGlobalFilters);
if (filterProduct) filterProduct.addEventListener('change', applyGlobalFilters);
if (tableSearchEl) tableSearchEl.addEventListener('input', () => { currentPage = 1; renderTable(); });
if (tableStatusEl) tableStatusEl.addEventListener('change', () => { currentPage = 1; renderTable(); });
if (tableRootCauseEl) tableRootCauseEl.addEventListener('change', () => { currentPage = 1; renderTable(); });
if (refreshBtn) refreshBtn.addEventListener('click', loadData);

function applyGlobalFilters() {
  const month = filterMonth ? filterMonth.value : '';
  const product = filterProduct ? filterProduct.value : '';
  filteredData = allData.filter(r => {
    if (month && r.Month !== month) return false;
    if (product && r['Product Source'] !== product) return false;
    return true;
  });
  renderAll();
}

function renderAll() {
  renderKPIs();
  renderTrendChart();
  renderStatusChart();
  renderCategoryChart();
  renderRootCauseChart();
  renderProductChart();
  renderSLASection();
  renderBranchSection();
  renderTagSection(); // Render tab baru
  currentPage = 1;
  renderTable();
}

// ===== SYSTEM RENDER VISUAL PLUGINS =====
function parseSLA(val) { if (!val) return null; const n = parseFloat(val); return isNaN(n) ? null : n; }
function getStatusBadge(st) { return `<span class="badge badge-open">${st || '-'}</span>`; }
function getRootCauseBadge(rc) { return `<span class="badge badge-system">${rc || '-'}</span>`; }
function getSLADisplay(val) { const n = parseSLA(val); return n === null ? 'On Progress' : `${n}d`; }
function countBy(data, key) { const c = {}; data.forEach(r => { const v = r[key] || 'N/A'; c[v] = (c[v] || 0) + 1; }); return c; }
function topN(obj, n) { return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n); }
function destroyChart(n) { if (charts[n]) { charts[n].destroy(); delete charts[n]; } }

function renderKPIs() {
  const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  setVal('kpiTotal', filteredData.length.toLocaleString());
  setVal('kpiResolved', filteredData.filter(r => r.Status === 'resolved').length.toLocaleString());
  setVal('kpiOpen', filteredData.filter(r => r.Status !== 'resolved').length.toLocaleString());
}

function renderTrendChart() {
  destroyChart('trend'); if(!document.getElementById('trendChart')) return;
  const months = [...new Set(filteredData.map(r => r.Month).filter(Boolean))];
  charts.trend = new Chart(document.getElementById('trendChart').getContext('2d'), {
    type: 'bar',
    data: { labels: months, datasets: [{ label: 'Tiket', data: months.map(m => filteredData.filter(r => r.Month === m).length), backgroundColor: PALETTE.primary }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderStatusChart() {
  destroyChart('status'); if(!document.getElementById('statusChart')) return;
  const counts = countBy(filteredData, 'Status');
  charts.status = new Chart(document.getElementById('statusChart').getContext('2d'), {
    type: 'doughnut', data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: MULTI }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderCategoryChart() {
  destroyChart('category'); if(!document.getElementById('categoryChart')) return;
  const top = topN(countBy(filteredData, 'Category'), 5);
  charts.category = new Chart(document.getElementById('categoryChart').getContext('2d'), {
    type: 'bar', data: { labels: top.map(x=>x[0]), datasets: [{ data: top.map(x=>x[1]), backgroundColor: PALETTE.cyan }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
  });
}

function renderRootCauseChart() {
  destroyChart('rootCause'); if(!document.getElementById('rootCauseChart')) return;
  const counts = countBy(filteredData, 'Root Cause');
  charts.rootCause = new Chart(document.getElementById('rootCauseChart').getContext('2d'), {
    type: 'pie', data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: MULTI }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderProductChart() {
  destroyChart('product'); if(!document.getElementById('productChart')) return;
  const top = topN(countBy(filteredData, 'Product Source'), 5);
  charts.product = new Chart(document.getElementById('productChart').getContext('2d'), {
    type: 'bar', data: { labels: top.map(x=>x[0]), datasets: [{ data: top.map(x=>x[1]), backgroundColor: PALETTE.amber }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderSLASection() {
  destroyChart('slaDist'); if(!document.getElementById('slaDistChart')) return;
  const resolved = filteredData.filter(r => r.Status === 'resolved');
  const buckets = { '≤1d': resolved.filter(r=>parseSLA(r.SLA)<=1).length, '>1d': resolved.filter(r=>parseSLA(r.SLA)>1).length };
  charts.slaDist = new Chart(document.getElementById('slaDistChart').getContext('2d'), {
    type: 'bar', data: { labels: Object.keys(buckets), datasets: [{ data: Object.values(buckets), backgroundColor: PALETTE.emerald }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderBranchSection() {
  destroyChart('branchBar'); if(!document.getElementById('branchBarChart')) return;
  const top = topN(countBy(filteredData, 'Branch Name'), 5);
  charts.branchBar = new Chart(document.getElementById('branchBarChart').getContext('2d'), {
    type: 'bar', data: { labels: top.map(x=>x[0]), datasets: [{ data: top.map(x=>x[1]), backgroundColor: PALETTE.secondary }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
  });
}

// ===== BARU: LOGIKA ANALISIS TAG UNTUK SHEET KEDUA =====
function renderTagSection() {
  destroyChart('tagBar'); if(!document.getElementById('tagBarChart')) return;
  
  const tagCounts = {};
  filteredData.forEach(ticket => {
    if (ticket.User_Tags || ticket.Tags) {
      (ticket.Tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    }
  });

  const topTags = topN(tagCounts, 10);
  charts.tagBar = new Chart(document.getElementById('tagBarChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: topTags.map(x => x[0]),
      datasets: [{ label: 'Kemunculan Tag', data: topTags.map(x => x[1]), backgroundColor: PALETTE.sky, borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderTable() {
  if (!tableBodyEl) return;
  const search = tableSearchEl ? tableSearchEl.value.toLowerCase() : '';
  
  let rows = filteredData.filter(r => {
    if (search) {
      const matches = [r.Id, r.Summary, r['Branch Name'], r.Category].join(' ').toLowerCase();
      if (!matches.includes(search)) return false;
    }
    return true;
  });

  if (tableCountEl) tableCountEl.textContent = `${rows.length} tiket`;
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  tableBodyEl.innerHTML = pageRows.map(r => `
    <tr>
      <td><strong>#${r.Id}</strong></td>
      <td>${r['Date Submitted'] || '-'}</td>
      <td>${r.Summary || '-'}</td>
      <td>${r.Category || '-'}</td>
      <td>${r['Product Source'] || '-'}</td>
      <td>${getStatusBadge(r.Status)}</td>
      <td>${getRootCauseBadge(r['Root Cause'])}</td>
      <td>${getSLADisplay(r.SLA)}</td>
      <td>${(r.Tags && r.Tags.length) ? r.Tags.map(t=>`<span class="tag-pill">${t}</span>`).join(' ') : '-'}</td>
      <td>${r['Branch Name'] || '-'}</td>
    </tr>
  `).join('');

  renderPagination(Math.ceil(rows.length / PAGE_SIZE));
}

function renderPagination(total) {
  if (!paginationEl) return;
  if (total <= 1) { paginationEl.innerHTML = ''; return; }
  paginationEl.innerHTML = `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goPage(${currentPage - 1})">‹</button>
    <button class="page-btn active">${currentPage}</button>
    <button class="page-btn" ${currentPage === total ? 'disabled' : ''} onclick="goPage(${currentPage + 1})">›</button>
  `;
}
window.goPage = (p) => { currentPage = p; renderTable(); };

window.addEventListener('DOMContentLoaded', loadData);
