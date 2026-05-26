/* ==========================================
   MANTIS DASHBOARD - APP LOGIC
   ========================================== */

// ===== DATA SOURCE URLS =====
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=1712613541&single=true&output=csv';
const TAG_CSV_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=1035358319&single=true&output=csv';
const DD_CSV_URL    = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRxmI-osn5Oq2XBN8igHn5RpcxyFlhU7E02VtUgV3CLrLjrTiG09LfaC9jvXIpPUeQgGP22IW2eT5WZ/pub?gid=408991878&single=true&output=csv';

// CORS Proxy fallback
const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://cors-anywhere.herokuapp.com/${url}`,
];

// Month helper
const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthNumToName = n => MONTH_ORDER[parseInt(n) - 1] || '';
const normBranch = s => (s || '').trim().toUpperCase();

function parseDDMonth(dateStr) {
  // Format: "17 October, 2025, 1:47"
  if (!dateStr) return null;
  const parts = dateStr.trim().split(' ');
  return parts[1] ? parts[1].replace(',', '') : null;
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
let allData     = [];
let tagData     = [];
let ddData      = [];
let filteredData    = [];
let filteredTagData = [];
let filteredDDData  = [];
let charts = {};
let currentPage = 1;
const PAGE_SIZE = 20;
let sortCol = 'Date Submitted';
let sortDir = 'desc';
let tableFilter = { search: '', status: '', rootCause: '' };

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

mobileMenuBtn.addEventListener('click', () => {
  sidebarEl.classList.toggle('mobile-open');
});

// ===== NAVIGATION =====
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.section);
    sidebarEl.classList.remove('mobile-open');
  });
});

function navigateTo(section) {
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`nav-${section}`).classList.add('active');
  document.getElementById(`section-${section}`).classList.add('active');
  const titles = {
    overview: 'Overview', tickets: 'Daftar Tiket',
    sla: 'Analisis SLA', branch: 'Analisis Cabang',
    tags: 'Analisis Tag', drawdown: 'Analisis Drawdown'
  };
  currentPageTitle.textContent = titles[section] || section;
  document.querySelector('.breadcrumb-icon').textContent =
    { overview:'📊', tickets:'🎫', sla:'⏱️', branch:'🗺️', tags:'🏷️', drawdown:'💰' }[section] || '📊';
}

// ===== FILTER POPULATE =====
function populateFilters() {
  const months   = [...new Set(allData.map(r => r.Month).filter(Boolean))].sort((a,b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
  const products = [...new Set(allData.map(r => r['Product Source']).filter(Boolean))].sort();

  filterMonth.innerHTML   = '<option value="">Semua Bulan</option>' + months.map(m   => `<option value="${m}">${m}</option>`).join('');
  filterProduct.innerHTML = '<option value="">Semua Produk</option>' + products.map(p => `<option value="${p}">${p}</option>`).join('');
}

// ===== GLOBAL FILTERS =====
function applyGlobalFilters() {
  const month   = filterMonth.value;
  const product = filterProduct.value;

  filteredData = allData.filter(r => {
    if (month   && r.Month !== month) return false;
    if (product && r['Product Source'] !== product) return false;
    return true;
  });

  filteredTagData = tagData.filter(r => {
    if (month   && monthNumToName(r.Month_Number) !== month) return false;
    if (product && r['Product Source'] !== product) return false;
    return true;
  });

  filteredDDData = ddData.filter(r => {
    if (month && parseDDMonth(r['Submit Date']) !== month) return false;
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
  arr.forEach(r => {
    const v = r[key] || 'Unknown';
    map[v] = (map[v] || 0) + 1;
  });
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
  const urlsToTry = isLocal
    ? CORS_PROXIES.map(fn => fn(url))
    : [url, ...CORS_PROXIES.map(fn => fn(url))];

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
    } catch(e) {
      console.warn(`⚠️ ${name} URL ${i+1} failed:`, e.message);
    }
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
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label:'Total Tiket', data:total, borderColor:PALETTE.primary, backgroundColor:PALETTE.primary+'30', tension:0.4, fill:true, pointRadius:5, borderWidth:2.5 },
        { label:'Resolved',    data:resolved, borderColor:PALETTE.emerald, backgroundColor:PALETTE.emerald+'20', tension:0.4, fill:true, pointRadius:4, borderWidth:2, borderDash:[5,3] },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top'} },
      scales:{
        x:{ grid:{display:false} },
        y:{ grid:{color:'rgba(255,255,255,0.04)'}, beginAtZero:true }
      }
    }
  });
}

function renderStatusChart() {
  const counts = countBy(filteredData,'Status');
  const entries = topN(counts, 10);
  destroyChart('status');
  const ctx = document.getElementById('statusChart').getContext('2d');
  charts.status = new Chart(ctx, {
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
  charts.category = new Chart(ctx, {
    type:'bar',
    data:{ labels:top.map(x=>x[0].length>30?x[0].slice(0,28)+'…':x[0]), datasets:[{ label:'Tiket', data:top.map(x=>x[1]), backgroundColor:PALETTE.primary+'99', borderColor:PALETTE.primary, borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{grid:{display:false},ticks:{font:{size:10}}}} }
  });
}

function renderRootCauseChart() {
  const counts = countBy(filteredData,'Root Cause');
  const entries = topN(counts,8);
  destroyChart('rootCause');
  const ctx = document.getElementById('rootCauseChart').getContext('2d');
  charts.rootCause = new Chart(ctx, {
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
  charts.product = new Chart(ctx, {
    type:'bar',
    data:{ labels:entries.map(x=>x[0]), datasets:[{ label:'Tiket', data:entries.map(x=>x[1]), backgroundColor:MULTI.map(c=>c+'99'), borderColor:MULTI, borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}} }
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
  if (tableFilter.status) data = data.filter(r => r.Status===tableFilter.status);
  if (tableFilter.rootCause) data = data.filter(r => r['Root Cause']===tableFilter.rootCause);

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
    const statusBadge = {
      resolved:'<span class="badge badge-resolved">resolved</span>',
      assigned:'<span class="badge badge-open">assigned</span>',
      acknowledged:'<span class="badge badge-pending">acknowledged</span>',
      feedback:'<span class="badge badge-pending">feedback</span>',
      closed:'<span class="badge">closed</span>',
    }[r.Status] || `<span class="badge">${r.Status||'-'}</span>`;

    return `<tr>
      <td><a href="https://mantis.simasfinance.co.id/view.php?id=${r.Id}" style="color:${PALETTE.primary}">#${r.Id}</a></td>
      <td style="white-space:nowrap;font-size:0.78rem">${(r['Date Submitted']||'').split(' ')[0]||'-'}</td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.Summary||''}">${r.Summary||'-'}</td>
      <td style="font-size:0.78rem">${r.Category||'-'}</td>
      <td><span class="badge" style="background:${PALETTE.primary}22;color:${PALETTE.primary}">${r['Product Source']||'-'}</span></td>
      <td>${statusBadge}</td>
      <td><span style="font-size:0.78rem">${r['Root Cause']||'-'}</span></td>
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
  for (let i=1; i<=Math.min(pages,7); i++) {
    html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
  }
  if (pages>7) html += `<span style="color:#94a3b8;padding:0 8px">… ${pages} halaman</span>`;
  paginationEl.innerHTML = html;
}

function goPage(p) { currentPage=p; renderTicketTable(); }

// ===== SLA SECTION =====
function renderSLA() {
  const resolved = filteredData.filter(r=>r.Status==='resolved');
  const slaVals  = resolved.map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));
  const met      = slaVals.filter(v=>v<=1).length;
  const warn     = slaVals.filter(v=>v>1&&v<=3).length;
  const breach   = slaVals.filter(v=>v>3).length;
  const onProgress = filteredData.filter(r=>r.Status==='assigned'||r.Status==='acknowledged').length;

  document.getElementById('slaMet').textContent       = met;
  document.getElementById('slaWarning').textContent   = warn;
  document.getElementById('slaBreached').textContent  = breach;
  document.getElementById('slaOnProgress').textContent= onProgress;

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
  const ctx = document.getElementById('slaDistChart').getContext('2d');
  charts.slaDist = new Chart(ctx, {
    type:'bar',
    data:{ labels:Object.keys(buckets), datasets:[{ label:'Jumlah Tiket', data:Object.values(buckets), backgroundColor:[PALETTE.emerald,PALETTE.cyan,PALETTE.amber,PALETTE.orange,PALETTE.rose,PALETTE.rose].map(c=>c+'bb'), borderColor:[PALETTE.emerald,PALETTE.cyan,PALETTE.amber,PALETTE.orange,PALETTE.rose,PALETTE.rose], borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}} }
  });
}

function renderSlaMonthChart() {
  const months = [...new Set(filteredData.map(r=>r.Month).filter(Boolean))].sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  const avgByMonth = months.map(m => {
    const vals = filteredData.filter(r=>r.Month===m&&r.Status==='resolved').map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));
    return vals.length ? avg(vals).toFixed(1) : 0;
  });
  destroyChart('slaMonth');
  const ctx = document.getElementById('slaMonthChart').getContext('2d');
  charts.slaMonth = new Chart(ctx, {
    type:'line',
    data:{ labels:months, datasets:[{ label:'Avg SLA (hari)', data:avgByMonth, borderColor:PALETTE.amber, backgroundColor:PALETTE.amber+'30', tension:0.4, fill:true, pointRadius:5, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}} }
  });
}

function renderSlaAssigneeChart(resolved) {
  const assigneeMap = {};
  resolved.forEach(r => {
    const a = r['Assigned To']||r.Assignee||'Unknown';
    if (!assigneeMap[a]) assigneeMap[a]={total:0,sum:0};
    const sla = parseFloat(r.SLA);
    if (!isNaN(sla)) { assigneeMap[a].total++; assigneeMap[a].sum+=sla; }
  });
  const top = Object.entries(assigneeMap).filter(([,v])=>v.total>=2).map(([k,v])=>[k,(v.sum/v.total).toFixed(1)]).sort((a,b)=>b[1]-a[1]).slice(0,15);
  destroyChart('slaAssignee');
  const ctx = document.getElementById('slaAssigneeChart').getContext('2d');
  charts.slaAssignee = new Chart(ctx, {
    type:'bar',
    data:{ labels:top.map(x=>x[0]), datasets:[{ label:'Avg SLA', data:top.map(x=>x[1]), backgroundColor:top.map((_,i)=>MULTI[i%MULTI.length]+'99'), borderColor:top.map((_,i)=>MULTI[i%MULTI.length]), borderWidth:2, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{grid:{display:false},ticks:{font:{size:10}}}} }
  });
}

function renderSlaProductChart() {
  const products = [...new Set(filteredData.map(r=>r['Product Source']).filter(Boolean))];
  const avgSla = products.map(p => {
    const vals = filteredData.filter(r=>r['Product Source']===p&&r.Status==='resolved').map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));
    return vals.length ? avg(vals).toFixed(1) : 0;
  });
  destroyChart('slaProduct');
  const ctx = document.getElementById('slaProductChart').getContext('2d');
  charts.slaProduct = new Chart(ctx, {
    type:'bar',
    data:{ labels:products, datasets:[{ label:'Avg SLA', data:avgSla, backgroundColor:MULTI.map(c=>c+'99'), borderColor:MULTI, borderWidth:2, borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}} }
  });
}

// ===== BRANCH SECTION =====
function renderBranch() {
  const branchField = r => r['Branch Name'] || r['Branch'] || '';

  const counts = countBy(filteredData.map(r=>({...r, _bn: branchField(r)})), '_bn');
  const top20 = topN(counts, 20);

  destroyChart('branchBar');
  const ctx1 = document.getElementById('branchBarChart').getContext('2d');
  charts.branchBar = new Chart(ctx1, {
    type:'bar',
    data:{ labels:top20.map(x=>x[0]), datasets:[{ label:'Tiket', data:top20.map(x=>x[1]), backgroundColor:PALETTE.primary+'99', borderColor:PALETTE.primary, borderWidth:2, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{grid:{display:false},ticks:{font:{size:10}}}} }
  });

  // Branch status stacked
  const top10 = topN(counts,10).map(x=>x[0]);
  const statuses = ['resolved','assigned','acknowledged','feedback'];
  const statusColors = [PALETTE.emerald,PALETTE.primary,PALETTE.amber,PALETTE.rose];
  destroyChart('branchStatus');
  const ctx2 = document.getElementById('branchStatusChart').getContext('2d');
  charts.branchStatus = new Chart(ctx2, {
    type:'bar',
    data:{ labels:top10, datasets:statuses.map((st,i)=>({ label:st, data:top10.map(b=>filteredData.filter(r=>branchField(r)===b&&r.Status===st).length), backgroundColor:statusColors[i]+'99', borderColor:statusColors[i], borderWidth:2, borderRadius:3 })) },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{position:'top',labels:{font:{size:10}}}}, scales:{x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}}} }
  });

  // Category by branch
  const cats = topN(countBy(filteredData,'Category'),5).map(x=>x[0]);
  destroyChart('branchCat');
  const ctx3 = document.getElementById('branchCatChart').getContext('2d');
  charts.branchCat = new Chart(ctx3, {
    type:'bar',
    data:{ labels:top10, datasets:cats.map((c,i)=>({ label:c.length>25?c.slice(0,23)+'…':c, data:top10.map(b=>filteredData.filter(r=>branchField(r)===b&&r.Category===c).length), backgroundColor:MULTI[i]+'99', borderColor:MULTI[i], borderWidth:2, borderRadius:3 })) },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{position:'top',labels:{font:{size:9}}}}, scales:{x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}}} }
  });

  // Root cause by branch
  const rcs = ['System','People','Process'];
  const rcColors = [PALETTE.primary,PALETTE.amber,PALETTE.emerald];
  destroyChart('branchRc');
  const ctx4 = document.getElementById('branchRcChart').getContext('2d');
  charts.branchRc = new Chart(ctx4, {
    type:'bar',
    data:{ labels:top10, datasets:rcs.map((rc,i)=>({ label:rc, data:top10.map(b=>filteredData.filter(r=>branchField(r)===b&&r['Root Cause']===rc).length), backgroundColor:rcColors[i]+'99', borderColor:rcColors[i], borderWidth:2, borderRadius:3 })) },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{position:'top'}}, scales:{x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}}} }
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
}

function renderTopTagsChart(data) {
  const counts = countBy(data, 'Tag');
  const top = topN(counts, 20);
  destroyChart('topTags');
  const ctx = document.getElementById('topTagsChart').getContext('2d');
  charts.topTags = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(x => x[0]),
      datasets: [{ label: 'Frekuensi', data: top.map(x => x[1]),
        backgroundColor: MULTI.slice(0, top.length).map(c => c + '99'),
        borderColor: MULTI.slice(0, top.length), borderWidth: 2, borderRadius: 5 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

function renderTagCategoryChart(data) {
  const catCounts = countBy(data, 'Category');
  const top = topN(catCounts, 10);
  destroyChart('tagCategory');
  const ctx = document.getElementById('tagCategoryChart').getContext('2d');
  charts.tagCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: top.map(x => x[0].length > 28 ? x[0].slice(0, 26) + '…' : x[0]),
      datasets: [{ data: top.map(x => x[1]), backgroundColor: MULTI.slice(0, top.length).map(c => c + 'cc'), borderColor: MULTI, borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
  });
}

function renderBranchTagChart(data) {
  const branchCounts = countBy(data, 'Branch Name');
  const top10Branches = topN(branchCounts, 10).map(x => x[0]);
  const tagCounts = countBy(data, 'Tag');
  const top5Tags = topN(tagCounts, 5).map(x => x[0]);

  destroyChart('branchTag');
  const ctx = document.getElementById('branchTagChart').getContext('2d');
  charts.branchTag = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10Branches,
      datasets: top5Tags.map((tag, i) => ({
        label: tag.length > 22 ? tag.slice(0, 20) + '…' : tag,
        data: top10Branches.map(b => data.filter(r => r['Branch Name'] === b && r.Tag === tag).length),
        backgroundColor: MULTI[i % MULTI.length] + '99',
        borderColor: MULTI[i % MULTI.length], borderWidth: 2, borderRadius: 4,
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { position: 'top', labels: { font: { size: 10 } } } },
      scales: {
        x: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

function renderTagMonthChart(data) {
  const months = [...new Set(data.map(r => monthNumToName(r.Month_Number)).filter(Boolean))]
    .sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
  const tagCounts = countBy(data, 'Tag');
  const top5Tags = topN(tagCounts, 5).map(x => x[0]);

  destroyChart('tagMonth');
  const ctx = document.getElementById('tagMonthChart').getContext('2d');
  charts.tagMonth = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: top5Tags.map((tag, i) => ({
        label: tag.length > 22 ? tag.slice(0, 20) + '…' : tag,
        data: months.map(m => data.filter(r => monthNumToName(r.Month_Number) === m && r.Tag === tag).length),
        borderColor: MULTI[i % MULTI.length],
        backgroundColor: MULTI[i % MULTI.length] + '30',
        tension: 0.4, fill: false, pointRadius: 4, borderWidth: 2,
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 10 } } } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ===== DRAWDOWN SECTION =====
function renderDrawdownSection() {
  const drawdowns = filteredDDData.filter(r => r.Status === 'MUF-Drawdown');
  if (filteredDDData.length === 0) return;

  // KPIs
  document.getElementById('ddTotal').textContent = drawdowns.length.toLocaleString();
  const branches = new Set(drawdowns.map(r => r['Branch Name']).filter(Boolean));
  document.getElementById('ddBranches').textContent = branches.size;

  const totalIssue = filteredData.length;
  const ratio = drawdowns.length > 0 ? (totalIssue / drawdowns.length * 100).toFixed(1) : '-';
  document.getElementById('ddRatio').textContent = ratio !== '-' ? ratio : '-';

  const branchDD = {};
  drawdowns.forEach(r => {
    const b = (r['Branch Name'] || 'Unknown').trim();
    branchDD[b] = (branchDD[b] || 0) + 1;
  });
  const topBranch = Object.entries(branchDD).sort((a,b) => b[1]-a[1])[0];
  document.getElementById('ddTopBranch').textContent = topBranch ? topBranch[0] : '-';

  renderDDVsIssueChart(drawdowns, branchDD);
  renderDDMonthChart();
  renderDDStatusChart();
  renderDDTable(drawdowns, branchDD);
}

function renderDDVsIssueChart(drawdowns, branchDD) {
  const top20 = Object.entries(branchDD).sort((a,b) => b[1]-a[1]).slice(0, 20);
  const labels = top20.map(x => x[0]);
  const ddCounts = top20.map(x => x[1]);
  const issueCounts = labels.map(b => {
    const normB = normBranch(b);
    return filteredData.filter(r => normBranch(r['Branch Name'] || r.Branch || '') === normB).length;
  });

  destroyChart('ddVsIssue');
  const ctx = document.getElementById('ddVsIssueChart').getContext('2d');
  charts.ddVsIssue = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'MUF-Drawdown', data: ddCounts, backgroundColor: PALETTE.emerald + '99', borderColor: PALETTE.emerald, borderWidth: 2, borderRadius: 4 },
        { label: 'Issue/Tiket', data: issueCounts, backgroundColor: PALETTE.rose + '99', borderColor: PALETTE.rose, borderWidth: 2, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderDDMonthChart() {
  const allMonths = [...new Set(filteredDDData.map(r => parseDDMonth(r['Submit Date'])).filter(Boolean))];
  const sortedMonths = MONTH_ORDER.filter(m => allMonths.includes(m));

  const ddByMonth    = sortedMonths.map(m => filteredDDData.filter(r => parseDDMonth(r['Submit Date']) === m && r.Status === 'MUF-Drawdown').length);
  const totalByMonth = sortedMonths.map(m => filteredDDData.filter(r => parseDDMonth(r['Submit Date']) === m).length);

  destroyChart('ddMonth');
  const ctx = document.getElementById('ddMonthChart').getContext('2d');
  charts.ddMonth = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedMonths,
      datasets: [
        { label: 'Total Aplikasi', data: totalByMonth, backgroundColor: PALETTE.primary + '55', borderColor: PALETTE.primary, borderWidth: 2, borderRadius: 6, order: 2 },
        { label: 'MUF-Drawdown', data: ddByMonth, type: 'line', borderColor: PALETTE.emerald, backgroundColor: PALETTE.emerald + '30', tension: 0.4, fill: true, pointRadius: 5, borderWidth: 2.5, order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

function renderDDStatusChart() {
  const counts = countBy(filteredDDData.filter(r => r.Status), 'Status');
  const entries = topN(counts, 12);
  destroyChart('ddStatus');
  const ctx = document.getElementById('ddStatusChart').getContext('2d');
  charts.ddStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(x => x[0]),
      datasets: [{ data: entries.map(x => x[1]), backgroundColor: MULTI.slice(0, entries.length).map(c => c + 'cc'), borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
  });
}

function renderDDTable(drawdowns, branchDD) {
  const top20 = Object.entries(branchDD).sort((a,b) => b[1]-a[1]).slice(0, 20);

  const tableData = top20.map(([branch, ddCount], i) => {
    const normB = normBranch(branch);
    const issueCount = filteredData.filter(r => normBranch(r['Branch Name'] || r.Branch || '') === normB).length;
    const ratio = ddCount > 0 ? (issueCount / ddCount * 100).toFixed(1) : '0';
    const monthsWithDD = [...new Set(drawdowns.filter(r=>r['Branch Name']===branch).map(r=>parseDDMonth(r['Submit Date'])).filter(Boolean))];
    const avgIssue = monthsWithDD.length > 0 ? (issueCount / monthsWithDD.length).toFixed(1) : issueCount;
    return { rank: i+1, branch, ddCount, issueCount, ratio, avgIssue };
  });

  window._ddTableData = tableData;

  const tbody = document.getElementById('ddTableBody');
  tbody.innerHTML = tableData.map(row => {
    const ratioNum = parseFloat(row.ratio);
    const ratioClass = ratioNum > 20 ? 'sla-bad' : ratioNum > 10 ? 'sla-warn' : 'sla-good';
    return `<tr>
      <td><strong style="color:${PALETTE.primary}">#${row.rank}</strong></td>
      <td><strong>${row.branch}</strong></td>
      <td><span style="color:${PALETTE.emerald};font-weight:700;font-size:1rem">${row.ddCount}</span></td>
      <td><span style="color:${PALETTE.rose};font-weight:700;font-size:1rem">${row.issueCount}</span></td>
      <td><span class="${ratioClass}">${row.ratio}</span></td>
      <td>${row.avgIssue}</td>
    </tr>`;
  }).join('');
}

document.getElementById('exportDDCSV').addEventListener('click', () => exportDDTable('csv'));
document.getElementById('exportDDXLSX').addEventListener('click', () => exportDDTable('xlsx'));

function exportDDTable(format) {
  const data = (window._ddTableData || []).map(row => ({
    'Rank': row.rank, 'Cabang': row.branch,
    'Total Drawdown': row.ddCount, 'Total Issue': row.issueCount,
    'Issue per 100 DD': row.ratio, 'Avg Issue/Bulan': row.avgIssue,
  }));
  if (format === 'csv') exportCSV(data, 'drawdown-vs-issue.csv');
  else exportXLSX(data, 'drawdown-vs-issue.xlsx');
}

// ===== EXPORT FUNCTIONS =====
function getExportData() {
  return filteredData.map(r => ({
    'ID': r.Id || '',
    'Date Submitted': (r['Date Submitted']||'').split(' ')[0] || '',
    'Summary': r.Summary || '',
    'Category': r.Category || '',
    'Product Source': r['Product Source'] || '',
    'Status': r.Status || '',
    'Root Cause': r['Root Cause'] || '',
    'Assigned To': r['Assigned To'] || '',
    'Branch': r['Branch Name'] || r.Branch || '',
    'Month': r.Month || '',
    'SLA (hari)': r.SLA || '',
  }));
}

function exportCSV(data, filename) {
  const rows = data || getExportData();
  if (!rows.length) { alert('Tidak ada data untuk diexport.'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => {
      const val = String(row[h] || '').replace(/"/g, '""');
      return (val.includes(',') || val.includes('"') || val.includes('\n')) ? `"${val}"` : val;
    }).join(','))
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `mantis-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportXLSX(data, filename) {
  if (typeof XLSX === 'undefined') { alert('SheetJS belum dimuat. Mohon tunggu beberapa detik.'); return; }
  const rows = data || getExportData();
  if (!rows.length) { alert('Tidak ada data untuk diexport.'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename || `mantis-${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportPDF(data, filename) {
  const jsPDFLib = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFLib) { alert('jsPDF belum dimuat. Mohon tunggu beberapa detik.'); return; }
  const rows = (data || getExportData()).slice(0, 1000);
  if (!rows.length) { alert('Tidak ada data untuk diexport.'); return; }

  const doc = new jsPDFLib({ orientation: 'landscape' });
  const headers = Object.keys(rows[0]);

  doc.setFontSize(13);
  doc.setTextColor(99, 102, 241);
  doc.text('Mantis Dashboard Report', 14, 14);
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const filterInfo = `Bulan: ${filterMonth.value || 'Semua'} | Produk: ${filterProduct.value || 'Semua'} | Generated: ${new Date().toLocaleString('id-ID')}`;
  doc.text(filterInfo, 14, 21);

  doc.autoTable({
    head: [headers],
    body: rows.map(row => headers.map(h => String(row[h] || ''))),
    startY: 26,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 246, 250] },
    margin: { left: 10, right: 10 },
  });

  doc.save(filename || `mantis-report-${new Date().toISOString().slice(0,10)}.pdf`);
}

// Main export button listeners
document.getElementById('exportCSV').addEventListener('click', () => exportCSV());
document.getElementById('exportXLSX').addEventListener('click', () => exportXLSX());
document.getElementById('exportPDF').addEventListener('click', () => exportPDF());

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  loadData();
});
