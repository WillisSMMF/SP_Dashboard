/* ==========================================
   MANTIS DASHBOARD - APP LOGIC
   ========================================== */

// ===== DATA SOURCE URLS =====
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=1712613541&single=true&output=csv';
const TAG_CSV_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=1035358319&single=true&output=csv';
const DD_CSV_URL    = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=408991878&single=true&output=csv';

const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://cors-anywhere.herokuapp.com/${url}`,
];

// ===== MONTH HELPERS =====
const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthNumToName = n => MONTH_ORDER[parseInt(n) - 1] || '';
const normBranch = s => (s || '').trim().toUpperCase();

// Parse "17 October, 2025, 1:47" → { month:'October', year:2025, sortKey:'2025-10' }
function parseDDDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.trim().split(' ');
  const month = parts[1] ? parts[1].replace(',', '') : null;
  const year  = parts[2] ? parseInt(parts[2].replace(',', '')) : null;
  if (!month || !year) return null;
  const mIdx = MONTH_ORDER.indexOf(month);
  if (mIdx < 0) return null;
  return {
    month,
    year,
    sortKey: `${year}-${String(mIdx + 1).padStart(2, '0')}`,
    label: `${month} ${year}`
  };
}
// Legacy compat
function parseDDMonth(dateStr) {
  const d = parseDDDate(dateStr);
  return d ? d.month : null;
}

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
  primary:   '#6366f1', secondary: '#8b5cf6', cyan: '#22d3ee',
  emerald:   '#10b981', amber:     '#f59e0b', rose: '#f43f5e',
  sky:       '#38bdf8', lime:      '#a3e635', orange:'#fb923c', pink:'#f472b6',
};
const MULTI = [
  '#6366f1','#22d3ee','#10b981','#f59e0b','#f43f5e',
  '#8b5cf6','#38bdf8','#a3e635','#fb923c','#f472b6',
  '#4ade80','#facc15','#60a5fa','#c084fc','#34d399',
  '#fca5a5','#6ee7b7','#93c5fd','#fbbf24','#a78bfa',
];

// ===== STATE =====
let allData = [], tagData = [], ddData = [];
let filteredData = [], filteredTagData = [], filteredDDData = [];
let charts = {};
let currentPage = 1;
const PAGE_SIZE = 20;
let sortCol = 'Date Submitted', sortDir = 'desc';
let tableFilter = { search: '', status: '', rootCause: '' };
let tagTableSortField = 'total'; // 'tag' | 'total'
let tagTableSortDir   = 'desc';

// ===== DOM REFERENCES =====
const loadingOverlay   = document.getElementById('loadingOverlay');
const refreshBtn       = document.getElementById('refreshBtn');
const filterMonth      = document.getElementById('filterMonth');
const filterProduct    = document.getElementById('filterProduct');
const lastUpdateEl     = document.getElementById('lastUpdate');
const tableSearchEl    = document.getElementById('tableSearch');
const tableStatusEl    = document.getElementById('tableStatus');
const tableRootCauseEl = document.getElementById('tableRootCause');
const tableCountEl     = document.getElementById('tableCount');
const tableBodyEl      = document.getElementById('ticketTableBody');
const paginationEl     = document.getElementById('pagination');
const sidebarEl        = document.getElementById('sidebar');
const mainEl           = document.getElementById('main');
const sidebarToggleEl  = document.getElementById('sidebarToggle');
const mobileMenuBtn    = document.getElementById('mobileMenuBtn');
const currentPageTitle = document.getElementById('currentPageTitle');

// ===== SIDEBAR =====
sidebarToggleEl.addEventListener('click', () => {
  sidebarEl.classList.toggle('collapsed');
  mainEl.classList.toggle('sidebar-collapsed');
});
mobileMenuBtn.addEventListener('click', () => sidebarEl.classList.toggle('mobile-open'));

// ===== NAVIGATION =====
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.section);
    sidebarEl.classList.remove('mobile-open');
  });
});

function navigateTo(section, statusFilter) {
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const navEl = document.getElementById(`nav-${section}`);
  const secEl = document.getElementById(`section-${section}`);
  if (navEl) navEl.classList.add('active');
  if (secEl) secEl.classList.add('active');

  const titles = {
    overview:'Overview', tickets:'Daftar Tiket', sla:'Analisis SLA',
    branch:'Analisis Cabang', tags:'Analisis Tag', drawdown:'Analisis Drawdown'
  };
  currentPageTitle.textContent = titles[section] || section;
  document.querySelector('.breadcrumb-icon').textContent =
    { overview:'📊', tickets:'🎫', sla:'⏱️', branch:'🗺️', tags:'🏷️', drawdown:'💰' }[section] || '📊';

  // Apply table status filter if requested
  if (section === 'tickets' && statusFilter !== undefined) {
    tableStatusEl.value = statusFilter;
    tableFilter.status  = statusFilter;
    currentPage = 1;
    renderTicketTable();
  }
}

// ===== FILTER POPULATE =====
function populateFilters() {
  const months   = [...new Set(allData.map(r => r.Month).filter(Boolean))]
    .sort((a,b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
  const products = [...new Set(allData.map(r => r['Product Source']).filter(Boolean))].sort();
  filterMonth.innerHTML   = '<option value="">Semua Bulan</option>' + months.map(m => `<option value="${m}">${m}</option>`).join('');
  filterProduct.innerHTML = '<option value="">Semua Produk</option>' + products.map(p => `<option value="${p}">${p}</option>`).join('');
}

// ===== GLOBAL FILTERS =====
function applyGlobalFilters() {
  const month = filterMonth.value, product = filterProduct.value;
  filteredData = allData.filter(r => {
    if (month && r.Month !== month) return false;
    if (product && r['Product Source'] !== product) return false;
    return true;
  });
  filteredTagData = tagData.filter(r => {
    if (month && monthNumToName(r.Month_Number) !== month) return false;
    if (product && r['Product Source'] !== product) return false;
    return true;
  });
  filteredDDData = ddData.filter(r => {
    if (month) {
      const d = parseDDDate(r['Submit Date']);
      if (!d || d.month !== month) return false;
    }
    return true;
  });
  currentPage = 1;
  renderAll();
}
filterMonth.addEventListener('change', applyGlobalFilters);
filterProduct.addEventListener('change', applyGlobalFilters);

// ===== HELPERS =====
function countBy(arr, key) {
  const map = {};
  arr.forEach(r => { const v = r[key] || 'Unknown'; map[v] = (map[v]||0)+1; });
  return map;
}
function topN(obj, n) {
  return Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0, n);
}
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}
function avg(arr) {
  return arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0;
}

// ===== DATA LOADING =====
async function parseCSV(url, name) {
  const isLocal = location.protocol === 'file:';
  const urlsToTry = isLocal ? CORS_PROXIES.map(fn => fn(url)) : [url, ...CORS_PROXIES.map(fn => fn(url))];
  for (let i = 0; i < urlsToTry.length; i++) {
    try {
      const result = await new Promise((resolve, reject) => {
        Papa.parse(urlsToTry[i], {
          download: true, header: true, skipEmptyLines: true,
          complete(r) {
            const rows = r.data.filter(row => Object.values(row).some(v => v && String(v).trim() !== ''));
            if (rows.length === 0) { reject(new Error('Empty')); return; }
            resolve(rows);
          },
          error: reject
        });
      });
      console.log(`✅ ${name} loaded via URL ${i+1}: ${result.length} rows`);
      return result;
    } catch(e) { console.warn(`⚠️ ${name} URL ${i+1} failed:`, e.message); }
  }
  throw new Error(`Gagal memuat ${name} dari semua URL`);
}

async function loadData() {
  showLoading(true);
  refreshBtn.classList.add('spinning');
  try {
    const [main, tags, dd] = await Promise.all([
      parseCSV(SHEET_CSV_URL, 'Data_Source'),
      parseCSV(TAG_CSV_URL,   'Helper_Tag'),
      parseCSV(DD_CSV_URL,    'DD_SimFast'),
    ]);
    allData  = main.filter(r => r.Id && r.Id.trim() !== '');
    tagData  = tags.filter(r => r.Id);
    ddData   = dd.filter(r => r['Branch Name'] || r.Status);
    showLoading(false);
    refreshBtn.classList.remove('spinning');
    lastUpdateEl.textContent = 'Update: ' + new Date().toLocaleTimeString('id-ID');
    document.querySelector('.ds-val').textContent = '3 Sheets ✓';
    populateFilters();
    applyGlobalFilters();
  } catch(err) {
    showLoading(false);
    refreshBtn.classList.remove('spinning');
    document.getElementById('loadingOverlay').classList.remove('hidden');
    document.getElementById('loadingOverlay').innerHTML = `
      <div style="text-align:center;padding:32px;max-width:480px">
        <div style="font-size:2.5rem;margin-bottom:16px">⚠️</div>
        <h3 style="color:#f43f5e;margin-bottom:8px">Gagal Memuat Data</h3>
        <p style="color:#94a3b8;font-size:0.875rem;margin-bottom:20px">
          ${err.message}<br><br>
          <strong style="color:#f1f5f9">Solusi Tercepat:</strong><br>
          Upload folder ke <a href="https://app.netlify.com/drop" target="_blank" style="color:#6366f1">Netlify Drop</a>
          atau akses via GitHub Pages agar CORS tidak diblokir.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button onclick="loadData()" style="padding:9px 20px;background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600">↻ Coba Lagi</button>
          <a href="https://app.netlify.com/drop" target="_blank" style="padding:9px 20px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;text-decoration:none">🚀 Netlify Drop</a>
        </div>
      </div>`;
  }
}

function showLoading(show) {
  if (show) {
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.innerHTML = `<div class="loading-spinner"></div><p class="loading-text">Memuat 3 sheet dari Google Sheets...</p>`;
  } else {
    loadingOverlay.classList.add('hidden');
  }
}
refreshBtn.addEventListener('click', loadData);

// ===== RENDER ALL =====
function renderAll() {
  renderOverview();
  renderTicketTable();
  renderSLA();
  renderBranch();
  renderTagSection();
  renderDrawdownSection();
}

// ===== OVERVIEW =====
function renderOverview() {
  const total    = filteredData.length;
  const resolved = filteredData.filter(r => r.Status === 'resolved').length;
  const open     = filteredData.filter(r => ['assigned','acknowledged','feedback'].includes(r.Status)).length;
  const slaVals  = filteredData.map(r => parseFloat(r.SLA)).filter(v => !isNaN(v));
  const avgSla   = slaVals.length ? (slaVals.reduce((a,b)=>a+b,0)/slaVals.length).toFixed(1) : '-';

  document.getElementById('kpiTotal').textContent    = total.toLocaleString();
  document.getElementById('kpiResolved').textContent = resolved.toLocaleString();
  document.getElementById('kpiOpen').textContent     = open.toLocaleString();
  document.getElementById('kpiSla').textContent      = avgSla;
  document.getElementById('kpiResolvedPct').textContent = total ? `${((resolved/total)*100).toFixed(1)}%` : '';
  document.getElementById('kpiOpenPct').textContent     = total ? `${((open/total)*100).toFixed(1)}%` : '';
  document.getElementById('kpiSlaLabel').textContent    = avgSla < 1 ? '✅ Baik' : avgSla < 3 ? '⚠️ Perlu Perhatian' : '🚨 Kritis';

  // ── KPI Click handlers ──────────────────────────────────────────────
  // Total Tiket → Tiket section, semua status
  document.getElementById('kpi-total').onclick = () => {
    tableFilter.status = '';
    navigateTo('tickets', '');
  };
  // Resolved → Tiket section, filter resolved
  document.getElementById('kpi-resolved').onclick = () => {
    tableFilter.status = 'resolved';
    navigateTo('tickets', 'resolved');
  };
  // Open/On Progress → Tiket section, filter __open__ (exclude resolved & closed)
  document.getElementById('kpi-open').onclick = () => {
    tableFilter.status = '__open__';
    navigateTo('tickets', '__open__');
  };
  // ────────────────────────────────────────────────────────────────────

  renderTrendChart();
  renderStatusChart();
  renderCategoryChart();
  renderRootCauseChart();
  renderProductChart();
}

function renderTrendChart() {
  const months = [...new Set(filteredData.map(r=>r.Month).filter(Boolean))]
    .sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  const total    = months.map(m=>filteredData.filter(r=>r.Month===m).length);
  const resolved = months.map(m=>filteredData.filter(r=>r.Month===m&&r.Status==='resolved').length);
  destroyChart('trend');
  const ctx = document.getElementById('trendChart').getContext('2d');
  charts.trend = new Chart(ctx, {
    type:'line',
    data:{ labels:months, datasets:[
      { label:'Total Tiket', data:total, borderColor:PALETTE.primary, backgroundColor:PALETTE.primary+'30', tension:0.4, fill:true, pointRadius:5, borderWidth:2.5 },
      { label:'Resolved', data:resolved, borderColor:PALETTE.emerald, backgroundColor:PALETTE.emerald+'20', tension:0.4, fill:true, pointRadius:4, borderWidth:2, borderDash:[5,3] }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top'}}, scales:{ x:{grid:{display:false}}, y:{grid:{color:'rgba(255,255,255,0.04)'},beginAtZero:true} } }
  });
}

function renderStatusChart() {
  const counts = countBy(filteredData,'Status');
  const entries = topN(counts,10);
  destroyChart('status');
  const ctx = document.getElementById('statusChart').getContext('2d');
  charts.status = new Chart(ctx,{
    type:'doughnut',
    data:{ labels:entries.map(x=>x[0]), datasets:[{ data:entries.map(x=>x[1]), backgroundColor:MULTI.map(c=>c+'cc'), borderColor:MULTI, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{legend:{position:'bottom',labels:{font:{size:10}}}} }
  });
}

function renderCategoryChart() {
  const counts = countBy(filteredData,'Category');
  const top = topN(counts,10);
  destroyChart('category');
  const ctx = document.getElementById('categoryChart').getContext('2d');
  charts.category = new Chart(ctx,{
    type:'bar',
    data:{ labels:top.map(x=>x[0].length>30?x[0].slice(0,28)+'…':x[0]), datasets:[{ label:'Tiket', data:top.map(x=>x[1]), backgroundColor:PALETTE.primary+'99', borderColor:PALETTE.primary, borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{grid:{display:false},ticks:{font:{size:10}}} } }
  });
}

function renderRootCauseChart() {
  const counts = countBy(filteredData,'Root Cause');
  const entries = topN(counts,8);
  destroyChart('rootCause');
  const ctx = document.getElementById('rootCauseChart').getContext('2d');
  charts.rootCause = new Chart(ctx,{
    type:'doughnut',
    data:{ labels:entries.map(x=>x[0]), datasets:[{ data:entries.map(x=>x[1]), backgroundColor:[PALETTE.primary,PALETTE.emerald,PALETTE.amber,PALETTE.rose,PALETTE.cyan,PALETTE.pink,PALETTE.sky,PALETTE.orange].map(c=>c+'cc'), borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'55%', plugins:{legend:{position:'bottom',labels:{font:{size:10}}}} }
  });
}

function renderProductChart() {
  const counts = countBy(filteredData,'Product Source');
  const entries = topN(counts,10);
  destroyChart('product');
  const ctx = document.getElementById('productChart').getContext('2d');
  charts.product = new Chart(ctx,{
    type:'bar',
    data:{ labels:entries.map(x=>x[0]), datasets:[{ label:'Tiket', data:entries.map(x=>x[1]), backgroundColor:MULTI.map(c=>c+'99'), borderColor:MULTI, borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false},ticks:{font:{size:10}}}, y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}} } }
  });
}

// ===== TICKETS TABLE =====
tableSearchEl.addEventListener('input', () => { tableFilter.search = tableSearchEl.value.toLowerCase(); currentPage=1; renderTicketTable(); });
tableStatusEl.addEventListener('change', () => { tableFilter.status = tableStatusEl.value; currentPage=1; renderTicketTable(); });
tableRootCauseEl.addEventListener('change', () => { tableFilter.rootCause = tableRootCauseEl.value; currentPage=1; renderTicketTable(); });

document.getElementById('ticketTable').addEventListener('click', e => {
  const th = e.target.closest('th.sortable');
  if (!th) return;
  if (sortCol === th.dataset.col) sortDir = sortDir==='asc'?'desc':'asc';
  else { sortCol = th.dataset.col; sortDir = 'desc'; }
  renderTicketTable();
});

function renderTicketTable() {
  let data = [...filteredData];
  if (tableFilter.search) data = data.filter(r => Object.values(r).some(v=>String(v).toLowerCase().includes(tableFilter.search)));

  // Status filter — special value __open__ = semua kecuali resolved & closed
  if (tableFilter.status === '__open__') {
    data = data.filter(r => !['resolved','closed'].includes((r.Status||'').toLowerCase()));
  } else if (tableFilter.status) {
    data = data.filter(r => (r.Status||'').toLowerCase() === tableFilter.status.toLowerCase());
  }

  if (tableFilter.rootCause) data = data.filter(r => r['Root Cause'] === tableFilter.rootCause);

  data.sort((a,b) => {
    let av = a[sortCol]||'', bv = b[sortCol]||'';
    if (sortCol==='Date Submitted'||sortCol==='Id') { av=parseFloat(av)||av; bv=parseFloat(bv)||bv; }
    return sortDir==='asc' ? (av>bv?1:-1) : (av<bv?1:-1);
  });

  tableCountEl.textContent = `${data.length} tiket`;
  const page = data.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);

  tableBodyEl.innerHTML = page.map(r => {
    const sla = parseFloat(r.SLA);
    const slaClass = isNaN(sla) ? '' : sla<=1?'sla-good':sla<=3?'sla-warn':'sla-bad';
    const statusMap = {
      resolved: `<span class="badge badge-resolved">resolved</span>`,
      assigned: `<span class="badge badge-open">assigned</span>`,
      acknowledged: `<span class="badge badge-pending">acknowledged</span>`,
      feedback: `<span class="badge badge-pending">feedback</span>`,
      closed: `<span class="badge" style="background:rgba(148,163,184,0.15);color:#94a3b8">closed</span>`,
    };
    const statusBadge = statusMap[(r.Status||'').toLowerCase()] || `<span class="badge">${r.Status||'-'}</span>`;
    return `<tr>
      <td><a href="https://mantis.simasfinance.co.id/view.php?id=${r.Id}" style="color:${PALETTE.primary}">#${r.Id}</a></td>
      <td style="white-space:nowrap;font-size:0.78rem">${(r['Date Submitted']||'').split(' ')[0]||'-'}</td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.Summary||''}">${r.Summary||'-'}</td>
      <td style="font-size:0.78rem">${r.Category||'-'}</td>
      <td><span class="badge" style="background:${PALETTE.primary}22;color:${PALETTE.primary}">${r['Product Source']||'-'}</span></td>
      <td>${statusBadge}</td>
      <td style="font-size:0.78rem">${r['Root Cause']||'-'}</td>
      <td><span class="${slaClass}">${isNaN(sla)?'-':sla+' hr'}</span></td>
      <td style="font-size:0.78rem">${r['Branch Name']||r.Branch||'-'}</td>
    </tr>`;
  }).join('');

  renderPagination(data.length);
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { paginationEl.innerHTML=''; return; }
  let html = '';
  for (let i=1; i<=Math.min(pages,7); i++) html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
  if (pages>7) html += `<span style="color:#94a3b8;padding:0 8px">… ${pages} halaman</span>`;
  paginationEl.innerHTML = html;
}
function goPage(p) { currentPage=p; renderTicketTable(); }

// ===== SLA SECTION =====
function renderSLA() {
  const resolved = filteredData.filter(r=>r.Status==='resolved');
  const slaVals  = resolved.map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));
  document.getElementById('slaMet').textContent       = slaVals.filter(v=>v<=1).length;
  document.getElementById('slaWarning').textContent   = slaVals.filter(v=>v>1&&v<=3).length;
  document.getElementById('slaBreached').textContent  = slaVals.filter(v=>v>3).length;
  document.getElementById('slaOnProgress').textContent= filteredData.filter(r=>r.Status==='assigned'||r.Status==='acknowledged').length;
  renderSlaDistChart(slaVals);
  renderSlaMonthChart();
  renderSlaAssigneeChart(resolved);
  renderSlaProductChart();
}

function renderSlaDistChart(slaVals) {
  const buckets = {'0-1':0,'1-2':0,'2-3':0,'3-5':0,'5-10':0,'>10':0};
  slaVals.forEach(v => {
    if(v<=1) buckets['0-1']++;
    else if(v<=2) buckets['1-2']++;
    else if(v<=3) buckets['2-3']++;
    else if(v<=5) buckets['3-5']++;
    else if(v<=10) buckets['5-10']++;
    else buckets['>10']++;
  });
  destroyChart('slaDist');
  charts.slaDist = new Chart(document.getElementById('slaDistChart').getContext('2d'),{
    type:'bar',
    data:{ labels:Object.keys(buckets), datasets:[{ label:'Jumlah Tiket', data:Object.values(buckets), backgroundColor:[PALETTE.emerald,PALETTE.cyan,PALETTE.amber,PALETTE.orange,PALETTE.rose,PALETTE.rose].map(c=>c+'bb'), borderColor:[PALETTE.emerald,PALETTE.cyan,PALETTE.amber,PALETTE.orange,PALETTE.rose,PALETTE.rose], borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}}, y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}} } }
  });
}

function renderSlaMonthChart() {
  const months = [...new Set(filteredData.map(r=>r.Month).filter(Boolean))].sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  const avgByMonth = months.map(m => {
    const vals = filteredData.filter(r=>r.Month===m&&r.Status==='resolved').map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));
    return vals.length ? avg(vals).toFixed(1) : 0;
  });
  destroyChart('slaMonth');
  charts.slaMonth = new Chart(document.getElementById('slaMonthChart').getContext('2d'),{
    type:'line',
    data:{ labels:months, datasets:[{ label:'Avg SLA (hari)', data:avgByMonth, borderColor:PALETTE.amber, backgroundColor:PALETTE.amber+'30', tension:0.4, fill:true, pointRadius:5, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}}, y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}} } }
  });
}

function renderSlaAssigneeChart(resolved) {
  const m = {};
  resolved.forEach(r => {
    const a = r['Assigned To']||r.Assignee||'Unknown';
    if (!m[a]) m[a]={total:0,sum:0};
    const sla=parseFloat(r.SLA); if(!isNaN(sla)){m[a].total++;m[a].sum+=sla;}
  });
  const top = Object.entries(m).filter(([,v])=>v.total>=2).map(([k,v])=>[k,(v.sum/v.total).toFixed(1)]).sort((a,b)=>b[1]-a[1]).slice(0,15);
  destroyChart('slaAssignee');
  charts.slaAssignee = new Chart(document.getElementById('slaAssigneeChart').getContext('2d'),{
    type:'bar',
    data:{ labels:top.map(x=>x[0]), datasets:[{ label:'Avg SLA', data:top.map(x=>x[1]), backgroundColor:top.map((_,i)=>MULTI[i%MULTI.length]+'99'), borderColor:top.map((_,i)=>MULTI[i%MULTI.length]), borderWidth:2, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{grid:{display:false},ticks:{font:{size:10}}} } }
  });
}

function renderSlaProductChart() {
  const products = [...new Set(filteredData.map(r=>r['Product Source']).filter(Boolean))];
  const avgSla = products.map(p => {
    const vals = filteredData.filter(r=>r['Product Source']===p&&r.Status==='resolved').map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));
    return vals.length ? avg(vals).toFixed(1) : 0;
  });
  destroyChart('slaProduct');
  charts.slaProduct = new Chart(document.getElementById('slaProductChart').getContext('2d'),{
    type:'bar',
    data:{ labels:products, datasets:[{ label:'Avg SLA', data:avgSla, backgroundColor:MULTI.map(c=>c+'99'), borderColor:MULTI, borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false},ticks:{font:{size:10}}}, y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}} } }
  });
}

// ===== BRANCH SECTION =====
function renderBranch() {
  const branchField = r => r['Branch Name'] || r['Branch'] || '';
  const counts = countBy(filteredData.map(r=>({...r, _bn:branchField(r)})), '_bn');
  const top20  = topN(counts, 20);
  const top20names = top20.map(x=>x[0]);
  const top10names = top20.slice(0,10).map(x=>x[0]);

  // Top 20 bar
  destroyChart('branchBar');
  charts.branchBar = new Chart(document.getElementById('branchBarChart').getContext('2d'),{
    type:'bar',
    data:{ labels:top20names, datasets:[{ label:'Tiket', data:top20.map(x=>x[1]), backgroundColor:PALETTE.primary+'99', borderColor:PALETTE.primary, borderWidth:2, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{grid:{display:false},ticks:{font:{size:10}}} } }
  });

  // Status stacked (top10)
  const statuses    = ['resolved','assigned','acknowledged','feedback','closed'];
  const statusColors= [PALETTE.emerald,PALETTE.primary,PALETTE.amber,PALETTE.rose,'#94a3b8'];
  destroyChart('branchStatus');
  charts.branchStatus = new Chart(document.getElementById('branchStatusChart').getContext('2d'),{
    type:'bar',
    data:{ labels:top10names, datasets:statuses.map((st,i)=>({ label:st, data:top10names.map(b=>filteredData.filter(r=>branchField(r)===b&&(r.Status||'').toLowerCase()===st).length), backgroundColor:statusColors[i]+'99', borderColor:statusColors[i], borderWidth:2, borderRadius:3 })) },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{position:'top',labels:{font:{size:10}}}}, scales:{ x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}} } }
  });

  // ── Kategori per Cabang: Top 20 branches + Others category ──────────
  const top5cats = topN(countBy(filteredData,'Category'),5).map(x=>x[0]);
  const catDatasets = top5cats.map((c,i) => ({
    label: c.length>25?c.slice(0,23)+'…':c,
    data: top20names.map(b => filteredData.filter(r=>branchField(r)===b&&r.Category===c).length),
    backgroundColor: MULTI[i]+'99', borderColor:MULTI[i], borderWidth:2, borderRadius:3
  }));
  // Others = semua kategori selain top5
  catDatasets.push({
    label: 'Others',
    data: top20names.map(b => {
      const branchRows = filteredData.filter(r=>branchField(r)===b);
      return branchRows.filter(r=>!top5cats.includes(r.Category)).length;
    }),
    backgroundColor: '#94a3b8'+'88', borderColor:'#94a3b8', borderWidth:2, borderRadius:3
  });
  destroyChart('branchCat');
  charts.branchCat = new Chart(document.getElementById('branchCatChart').getContext('2d'),{
    type:'bar',
    data:{ labels:top20names, datasets:catDatasets },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{position:'top',labels:{font:{size:9}}}}, scales:{ x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}} } }
  });

  // Root cause (top10)
  const rcs=['System','People','Process'], rcColors=[PALETTE.primary,PALETTE.amber,PALETTE.emerald];
  destroyChart('branchRc');
  charts.branchRc = new Chart(document.getElementById('branchRcChart').getContext('2d'),{
    type:'bar',
    data:{ labels:top10names, datasets:rcs.map((rc,i)=>({ label:rc, data:top10names.map(b=>filteredData.filter(r=>branchField(r)===b&&r['Root Cause']===rc).length), backgroundColor:rcColors[i]+'99', borderColor:rcColors[i], borderWidth:2, borderRadius:3 })) },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{position:'top'}}, scales:{ x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}} } }
  });
}

// ===== TAG SECTION =====
function renderTagSection() {
  const withTag = filteredTagData.filter(r => r.Tag && r.Tag.trim() !== '');
  if (withTag.length === 0) return;
  renderTopTagsChart(withTag);
  renderTagCategoryChart(withTag);
  renderBranchTagChart(withTag);
  renderTagMonthChart(withTag);
  renderTagBranchTable(withTag);
}

function renderTopTagsChart(data) {
  const counts = countBy(data, 'Tag');
  const top = topN(counts, 20);
  destroyChart('topTags');
  charts.topTags = new Chart(document.getElementById('topTagsChart').getContext('2d'),{
    type:'bar',
    data:{ labels:top.map(x=>x[0]), datasets:[{ label:'Frekuensi', data:top.map(x=>x[1]), backgroundColor:MULTI.slice(0,top.length).map(c=>c+'99'), borderColor:MULTI.slice(0,top.length), borderWidth:2, borderRadius:5 }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{grid:{display:false},ticks:{font:{size:10}}} } }
  });
}

function renderTagCategoryChart(data) {
  const top = topN(countBy(data,'Category'),10);
  destroyChart('tagCategory');
  charts.tagCategory = new Chart(document.getElementById('tagCategoryChart').getContext('2d'),{
    type:'doughnut',
    data:{ labels:top.map(x=>x[0].length>28?x[0].slice(0,26)+'…':x[0]), datasets:[{ data:top.map(x=>x[1]), backgroundColor:MULTI.slice(0,top.length).map(c=>c+'cc'), borderColor:MULTI, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'55%', plugins:{legend:{position:'bottom',labels:{font:{size:10}}}} }
  });
}

// ── Branch × Tag: Top 20 cabang dari filteredData (sama dg branchBarChart) + Others tag ──
function renderBranchTagChart(data) {
  // Top 20 cabang berdasarkan jumlah issue (bukan tag) — sama dengan grafik bar utama
  const branchField = r => r['Branch Name'] || r['Branch'] || '';
  const issueCounts = countBy(filteredData.map(r=>({...r, _bn:branchField(r)})), '_bn');
  const top20Branches = topN(issueCounts, 20).map(x=>x[0]);

  // Top 5 tag global
  const top5Tags = topN(countBy(data,'Tag'),5).map(x=>x[0]);

  const datasets = top5Tags.map((tag,i) => ({
    label: tag.length>22?tag.slice(0,20)+'…':tag,
    data: top20Branches.map(b => data.filter(r => normBranch(r['Branch Name']||r['Branch']||'')===normBranch(b) && r.Tag===tag).length),
    backgroundColor: MULTI[i%MULTI.length]+'99', borderColor:MULTI[i%MULTI.length], borderWidth:2, borderRadius:4
  }));

  // Others = semua tag selain top5, PLUS tiket dari filteredData yang tidak ada di tagData (no tag)
  datasets.push({
    label: 'Others / No Tag',
    data: top20Branches.map(b => {
      const nb = normBranch(b);
      // total issue di cabang ini
      const totalIssue = filteredData.filter(r => normBranch(branchField(r))===nb).length;
      // tag entries di cabang ini yang termasuk top5
      const tagged5 = data.filter(r => normBranch(r['Branch Name']||r['Branch']||'')===nb && top5Tags.includes(r.Tag)).length;
      return Math.max(0, totalIssue - tagged5);
    }),
    backgroundColor: '#94a3b8'+'88', borderColor:'#94a3b8', borderWidth:2, borderRadius:4
  });

  destroyChart('branchTag');
  charts.branchTag = new Chart(document.getElementById('branchTagChart').getContext('2d'),{
    type:'bar',
    data:{ labels:top20Branches, datasets },
    options:{
      responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{legend:{position:'top',labels:{font:{size:10}}}},
      scales:{ x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}} }
    }
  });
}

function renderTagMonthChart(data) {
  const months = [...new Set(data.map(r=>monthNumToName(r.Month_Number)).filter(Boolean))].sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  const top5Tags = topN(countBy(data,'Tag'),5).map(x=>x[0]);
  destroyChart('tagMonth');
  charts.tagMonth = new Chart(document.getElementById('tagMonthChart').getContext('2d'),{
    type:'line',
    data:{ labels:months, datasets:top5Tags.map((tag,i)=>({ label:tag.length>22?tag.slice(0,20)+'…':tag, data:months.map(m=>data.filter(r=>monthNumToName(r.Month_Number)===m&&r.Tag===tag).length), borderColor:MULTI[i%MULTI.length], backgroundColor:MULTI[i%MULTI.length]+'30', tension:0.4, fill:false, pointRadius:4, borderWidth:2 })) },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{font:{size:10}}}}, scales:{ x:{grid:{display:false}}, y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}} } }
  });
}

// ── Tag Branch Table ────────────────────────────────────────────────────
function renderTagBranchTable(tagRows) {
  // Build tag → { branch → count } map from tagRows (all statuses)
  const tagMap = {};
  tagRows.forEach(r => {
    const tag = (r.Tag||'').trim(); if (!tag) return;
    const branch = (r['Branch Name']||r['Branch']||'Unknown').trim();
    if (!tagMap[tag]) tagMap[tag] = {};
    tagMap[tag][branch] = (tagMap[tag][branch]||0) + 1;
  });

  // Build flat rows sorted by total desc
  window._tagBranchRawData = Object.entries(tagMap).map(([tag, branchObj]) => {
    const total = Object.values(branchObj).reduce((a,b)=>a+b,0);
    const topBranches = Object.entries(branchObj).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return { tag, total, topBranches };
  });

  // Init sort state
  tagTableSortField = 'total';
  tagTableSortDir   = 'desc';

  _applyTagTableSortAndFilter('');

  // Search
  const searchEl = document.getElementById('tagTableSearch');
  if (searchEl) searchEl.oninput = () => _applyTagTableSortAndFilter(searchEl.value.toLowerCase().trim());

  // Sort headers
  const sortTagHdr = document.getElementById('tagTableSortHeader');
  const sortTotHdr = document.getElementById('tagTotalSortHeader');
  if (sortTagHdr) sortTagHdr.onclick = () => {
    if (tagTableSortField==='tag') tagTableSortDir = tagTableSortDir==='asc'?'desc':'asc'; else { tagTableSortField='tag'; tagTableSortDir='asc'; }
    _applyTagTableSortAndFilter((document.getElementById('tagTableSearch')||{}).value||'');
  };
  if (sortTotHdr) sortTotHdr.onclick = () => {
    if (tagTableSortField==='total') tagTableSortDir = tagTableSortDir==='asc'?'desc':'asc'; else { tagTableSortField='total'; tagTableSortDir='desc'; }
    _applyTagTableSortAndFilter((document.getElementById('tagTableSearch')||{}).value||'');
  };
}

function _applyTagTableSortAndFilter(query) {
  let rows = (window._tagBranchRawData || []).slice();

  if (query) rows = rows.filter(row =>
    row.tag.toLowerCase().includes(query) ||
    row.topBranches.some(([b]) => b.toLowerCase().includes(query))
  );

  rows.sort((a,b) => {
    if (tagTableSortField==='tag') return tagTableSortDir==='asc' ? a.tag.localeCompare(b.tag) : b.tag.localeCompare(a.tag);
    return tagTableSortDir==='asc' ? a.total-b.total : b.total-a.total;
  });

  const tbody = document.getElementById('tagBranchTableBody');
  if (!tbody) return;
  tbody.innerHTML = rows.map((row, i) => {
    const cells = row.topBranches.slice(0,5);
    while (cells.length<5) cells.push(['—', '']);
    const branchCols = cells.map(([b,n]) => `<td style="font-size:0.78rem;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b}</td><td style="font-weight:700;color:${PALETTE.cyan};text-align:right">${n||''}</td>`).join('');
    return `<tr>
      <td><strong style="color:${PALETTE.primary}">${i+1}</strong></td>
      <td><span style="background:${PALETTE.primary}22;color:${PALETTE.primary};padding:3px 9px;border-radius:12px;font-size:0.8rem;white-space:nowrap">${row.tag}</span></td>
      <td style="font-weight:700;color:${PALETTE.emerald};text-align:right;font-size:1rem">${row.total}</td>
      ${branchCols}
    </tr>`;
  }).join('');
}

// ===== DRAWDOWN SECTION =====
function renderDrawdownSection() {
  const drawdowns = filteredDDData.filter(r => r.Status === 'MUF-Drawdown');
  if (filteredDDData.length === 0) return;

  document.getElementById('ddTotal').textContent    = drawdowns.length.toLocaleString();
  const branches = new Set(drawdowns.map(r=>r['Branch Name']).filter(Boolean));
  document.getElementById('ddBranches').textContent = branches.size;

  // Global rasio: total issue / total drawdown
  const globalRatio = drawdowns.length>0 ? (filteredData.length / drawdowns.length).toFixed(3) : '-';
  document.getElementById('ddRatio').textContent = globalRatio;

  const branchDD = {};
  drawdowns.forEach(r => { const b=(r['Branch Name']||'Unknown').trim(); branchDD[b]=(branchDD[b]||0)+1; });
  const topBranch = Object.entries(branchDD).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('ddTopBranch').textContent = topBranch ? topBranch[0] : '-';

  renderDDVsIssueChart(drawdowns, branchDD);
  renderDDMonthChart(drawdowns);
  renderDDStatusChart();
  renderDDTable(drawdowns, branchDD);
  renderDDBestBranchChart(drawdowns, branchDD);
}

function renderDDVsIssueChart(drawdowns, branchDD) {
  const top20 = Object.entries(branchDD).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const labels = top20.map(x=>x[0]);
  const ddCounts = top20.map(x=>x[1]);
  const issueCounts = labels.map(b => {
    const nb = normBranch(b);
    return filteredData.filter(r=>normBranch(r['Branch Name']||r.Branch||'')===nb).length;
  });
  destroyChart('ddVsIssue');
  charts.ddVsIssue = new Chart(document.getElementById('ddVsIssueChart').getContext('2d'),{
    type:'bar',
    data:{ labels, datasets:[
      { label:'MUF-Drawdown', data:ddCounts, backgroundColor:PALETTE.emerald+'99', borderColor:PALETTE.emerald, borderWidth:2, borderRadius:4 },
      { label:'Issue/Tiket',  data:issueCounts, backgroundColor:PALETTE.rose+'99', borderColor:PALETTE.rose, borderWidth:2, borderRadius:4 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{position:'top'}}, scales:{ x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{grid:{display:false},ticks:{font:{size:11}}} } }
  });
}

// ── DD Month Chart: X-axis diurutkan berdasarkan tahun + bulan ──────────
function renderDDMonthChart(drawdowns) {
  // Kumpulkan semua period unik, sort by sortKey (YYYY-MM)
  const periodMap = {};
  filteredDDData.forEach(r => {
    const d = parseDDDate(r['Submit Date']);
    if (!d) return;
    if (!periodMap[d.sortKey]) periodMap[d.sortKey] = { label:d.label, sortKey:d.sortKey };
  });
  const periods = Object.values(periodMap).sort((a,b)=>a.sortKey.localeCompare(b.sortKey));
  const labels       = periods.map(p=>p.label);
  const ddByPeriod   = periods.map(p => {
    return filteredDDData.filter(r => {
      const d = parseDDDate(r['Submit Date']);
      return d && d.sortKey===p.sortKey && r.Status==='MUF-Drawdown';
    }).length;
  });
  const totalByPeriod= periods.map(p => {
    return filteredDDData.filter(r => {
      const d = parseDDDate(r['Submit Date']);
      return d && d.sortKey===p.sortKey;
    }).length;
  });

  destroyChart('ddMonth');
  charts.ddMonth = new Chart(document.getElementById('ddMonthChart').getContext('2d'),{
    type:'bar',
    data:{ labels, datasets:[
      { label:'Total Aplikasi', data:totalByPeriod, backgroundColor:PALETTE.primary+'55', borderColor:PALETTE.primary, borderWidth:2, borderRadius:6, order:2 },
      { label:'MUF-Drawdown',  data:ddByPeriod,    type:'line', borderColor:PALETTE.emerald, backgroundColor:PALETTE.emerald+'30', tension:0.4, fill:true, pointRadius:5, borderWidth:2.5, order:1 }
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{position:'top'},
        tooltip:{
          callbacks:{
            // Tambahkan rasio DD di tooltip
            afterBody(items) {
              const idx = items[0].dataIndex;
              const dd  = ddByPeriod[idx];
              const tot = totalByPeriod[idx];
              const ratio = tot>0 ? (dd/tot*100).toFixed(1) : '0';
              return [`Rasio DD: ${ratio}% (${dd}/${tot})`];
            }
          }
        }
      },
      scales:{ x:{grid:{display:false}}, y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}} }
    }
  });
}

function renderDDStatusChart() {
  const counts  = countBy(filteredDDData.filter(r=>r.Status),'Status');
  const entries = topN(counts,12);
  destroyChart('ddStatus');
  charts.ddStatus = new Chart(document.getElementById('ddStatusChart').getContext('2d'),{
    type:'doughnut',
    data:{ labels:entries.map(x=>x[0]), datasets:[{ data:entries.map(x=>x[1]), backgroundColor:MULTI.slice(0,entries.length).map(c=>c+'cc'), borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{legend:{position:'bottom',labels:{font:{size:10}}}} }
  });
}

// ── DD Table: Rasio Issue = Issue÷Drawdown, Avg Issue/Bulan dihapus ──────
function renderDDTable(drawdowns, branchDD) {
  const top20 = Object.entries(branchDD).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const tableData = top20.map(([branch, ddCount], i) => {
    const nb = normBranch(branch);
    const issueCount = filteredData.filter(r=>normBranch(r['Branch Name']||r.Branch||'')===nb).length;
    const ratio = ddCount>0 ? (issueCount/ddCount).toFixed(4) : '0.0000';
    return { rank:i+1, branch, ddCount, issueCount, ratio };
  });
  window._ddTableData = tableData;

  document.getElementById('ddTableBody').innerHTML = tableData.map(row => {
    const rn = parseFloat(row.ratio);
    const cls = rn>0.3?'sla-bad':rn>0.1?'sla-warn':'sla-good';
    return `<tr>
      <td><strong style="color:${PALETTE.primary}">#${row.rank}</strong></td>
      <td><strong>${row.branch}</strong></td>
      <td><span style="color:${PALETTE.emerald};font-weight:700;font-size:1rem">${row.ddCount}</span></td>
      <td><span style="color:${PALETTE.rose};font-weight:700;font-size:1rem">${row.issueCount}</span></td>
      <td><span class="${cls}">${row.ratio}</span></td>
    </tr>`;
  }).join('');
}

// ── Top 20 Best Branch ─────────────────────────────────────────────────
function renderDDBestBranchChart(drawdowns, branchDD) {
  // Hitung rasio (Issue÷DD) untuk semua cabang yang ada drawdown-nya
  const allBranchData = Object.entries(branchDD).map(([branch, ddCount]) => {
    const nb = normBranch(branch);
    const issueCount = filteredData.filter(r=>normBranch(r['Branch Name']||r.Branch||'')===nb).length;
    const ratio = ddCount>0 ? issueCount/ddCount : Infinity;
    return { branch, ddCount, issueCount, ratio };
  });

  // Best = rasio terkecil; jika sama, urutkan drawdown terbanyak duluan
  const best20 = allBranchData
    .filter(x => x.ratio !== Infinity)
    .sort((a,b) => a.ratio!==b.ratio ? a.ratio-b.ratio : b.ddCount-a.ddCount)
    .slice(0,20);

  // Chart
  destroyChart('ddBestBranch');
  charts.ddBestBranch = new Chart(document.getElementById('ddBestBranchChart').getContext('2d'),{
    type:'bar',
    data:{ labels:best20.map(x=>x.branch), datasets:[
      { label:'MUF-Drawdown', data:best20.map(x=>x.ddCount), backgroundColor:PALETTE.emerald+'99', borderColor:PALETTE.emerald, borderWidth:2, borderRadius:4 },
      { label:'Issue/Tiket',  data:best20.map(x=>x.issueCount), backgroundColor:PALETTE.rose+'99', borderColor:PALETTE.rose, borderWidth:2, borderRadius:4 }
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{
        legend:{position:'top'},
        tooltip:{
          callbacks:{
            afterBody(items) {
              const idx = items[0].dataIndex;
              const row = best20[idx];
              return [`Rasio Issue: ${row.ratio.toFixed(4)} (${row.issueCount}÷${row.ddCount})`];
            }
          }
        }
      },
      scales:{ x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}, y:{grid:{display:false},ticks:{font:{size:11}}} }
    }
  });

  // List tabel best branch
  const medals = ['🥇','🥈','🥉'];
  document.getElementById('ddBestTableBody').innerHTML = best20.map((row,i) => {
    const rn = row.ratio;
    const cls = rn===0?'sla-good':rn<0.05?'sla-good':rn<0.15?'sla-warn':'sla-bad';
    const perf = rn===0 ? '⭐⭐⭐ Zero Issue!' : rn<0.05 ? '⭐⭐⭐ Sangat Baik' : rn<0.1 ? '⭐⭐ Baik' : rn<0.2 ? '⭐ Cukup' : 'Perlu Perhatian';
    const medal = medals[i] || `#${i+1}`;
    return `<tr>
      <td style="font-size:1.1rem">${medal}</td>
      <td><strong>${row.branch}</strong></td>
      <td><span style="color:${PALETTE.emerald};font-weight:700">${row.ddCount}</span></td>
      <td><span style="color:${PALETTE.rose};font-weight:700">${row.issueCount}</span></td>
      <td><span class="${cls}">${rn.toFixed(4)}</span></td>
      <td style="font-size:0.82rem">${perf}</td>
    </tr>`;
  }).join('');
}

document.getElementById('exportDDCSV').addEventListener('click', () => exportDDTable('csv'));
document.getElementById('exportDDXLSX').addEventListener('click', () => exportDDTable('xlsx'));

function exportDDTable(format) {
  const data = (window._ddTableData||[]).map(row => ({
    'Rank': row.rank, 'Cabang': row.branch,
    'Total Drawdown': row.ddCount, 'Total Issue': row.issueCount,
    'Rasio Issue (Issue÷DD)': row.ratio,
  }));
  if (format==='csv') exportCSV(data,'drawdown-vs-issue.csv');
  else exportXLSX(data,'drawdown-vs-issue.xlsx');
}

// ===== EXPORT FUNCTIONS =====
function getExportData() {
  return filteredData.map(r => ({
    'ID': r.Id||'', 'Date Submitted': (r['Date Submitted']||'').split(' ')[0]||'',
    'Summary': r.Summary||'', 'Category': r.Category||'',
    'Product Source': r['Product Source']||'', 'Status': r.Status||'',
    'Root Cause': r['Root Cause']||'', 'Assigned To': r['Assigned To']||'',
    'Branch': r['Branch Name']||r.Branch||'', 'Month': r.Month||'', 'SLA (hari)': r.SLA||'',
  }));
}

function exportCSV(data, filename) {
  const rows = data||getExportData();
  if (!rows.length) { alert('Tidak ada data untuk diexport.'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(row=>headers.map(h=>{ const v=String(row[h]||'').replace(/"/g,'""'); return (v.includes(',')||v.includes('"')||v.includes('\n'))?`"${v}"`:v; }).join(','))].join('\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename||`mantis-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function exportXLSX(data, filename) {
  if (typeof XLSX==='undefined') { alert('SheetJS belum dimuat.'); return; }
  const rows = data||getExportData();
  if (!rows.length) { alert('Tidak ada data.'); return; }
  const ws=XLSX.utils.json_to_sheet(rows), wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Data');
  XLSX.writeFile(wb,filename||`mantis-${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportPDF(data, filename) {
  const jsPDFLib=(window.jspdf&&window.jspdf.jsPDF)||window.jsPDF;
  if (!jsPDFLib) { alert('jsPDF belum dimuat.'); return; }
  const rows=(data||getExportData()).slice(0,1000);
  if (!rows.length) { alert('Tidak ada data.'); return; }
  const doc=new jsPDFLib({orientation:'landscape'});
  const headers=Object.keys(rows[0]);
  doc.setFontSize(13); doc.setTextColor(99,102,241);
  doc.text('Mantis Dashboard Report',14,14);
  doc.setFontSize(8); doc.setTextColor(148,163,184);
  doc.text(`Bulan: ${filterMonth.value||'Semua'} | Produk: ${filterProduct.value||'Semua'} | Generated: ${new Date().toLocaleString('id-ID')}`,14,21);
  doc.autoTable({ head:[headers], body:rows.map(row=>headers.map(h=>String(row[h]||''))), startY:26, styles:{fontSize:7,cellPadding:2}, headStyles:{fillColor:[99,102,241],textColor:255,fontStyle:'bold'}, alternateRowStyles:{fillColor:[245,246,250]}, margin:{left:10,right:10} });
  doc.save(filename||`mantis-report-${new Date().toISOString().slice(0,10)}.pdf`);
}

document.getElementById('exportCSV').addEventListener('click',  () => exportCSV());
document.getElementById('exportXLSX').addEventListener('click', () => exportXLSX());
document.getElementById('exportPDF').addEventListener('click',  () => exportPDF());

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => { loadData(); });
