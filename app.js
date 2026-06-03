/* ==========================================
   MANTIS DASHBOARD - APP LOGIC
   All fixes applied: responsive, export lock,
   top20 tags, DD ratio format, DD table cols,
   branch mapping, exclusions, Map section
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

// FIX #7: Daftar nama yang BUKAN cabang dan harus diexclude
const DD_EXCLUDE_BRANCHES = new Set([
  'IT','KPNO','DCSMG','DCBDG','MKT','PRODUCT SUPPORT','DIRECT MARKETING','SOFTWARE SUPPORT'
]);
function isExcludedBranch(name) {
  return DD_EXCLUDE_BRANCHES.has((name||'').trim().toUpperCase());
}

// ===== MONTH HELPERS =====
const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthNumToName = n => MONTH_ORDER[parseInt(n) - 1] || '';
const normBranch = s => (s || '').trim().toUpperCase();

// FIX #6: Fuzzy branch matching — strip common suffixes for matching
function matchBranches(branchA, branchB) {
  const clean = s => normBranch(s)
    .replace(/\bCAB\.?\s*/,'').replace(/\bKC\.?\s*/,'').replace(/\bKCP\.?\s*/,'')
    .replace(/\bSYARIAH\b/,'').replace(/\s+/g,' ').trim();
  if (normBranch(branchA) === normBranch(branchB)) return true;
  return clean(branchA) === clean(branchB);
}

// canonBranch: normalisasi nama cabang untuk matching konsisten lintas sheet
// Kudus / CAB KUDUS / KCP KUDUS / MUF-Cab Kudus → semua jadi "KUDUS"
function canonBranch(name){
  return (name||'').toUpperCase()
    .replace(/^MUF[-\s]+/,'')
    .replace(/\bCAB\.?\s*/g,'')
    .replace(/\bKC\.?\s*/g,'')
    .replace(/\bKCP\.?\s*/g,'')
    .replace(/\bSYARIAH\b/g,'')
    .replace(/[-_]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

// Parse "17 October, 2025, 1:47" → { month, year, sortKey, label }
function parseDDDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.trim().split(' ');
  const month = parts[1] ? parts[1].replace(',','') : null;
  const year  = parts[2] ? parseInt(parts[2].replace(',','')) : null;
  if (!month || !year) return null;
  const mIdx = MONTH_ORDER.indexOf(month);
  if (mIdx < 0) return null;
  return { month, year, sortKey:`${year}-${String(mIdx+1).padStart(2,'0')}`, label:`${month} ${year}` };
}
function parseDDMonth(dateStr) { const d=parseDDDate(dateStr); return d?d.month:null; }

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
  primary:'#6366f1', secondary:'#8b5cf6', cyan:'#22d3ee',
  emerald:'#10b981', amber:'#f59e0b', rose:'#f43f5e',
  sky:'#38bdf8', lime:'#a3e635', orange:'#fb923c', pink:'#f472b6',
};
const MULTI = [
  '#6366f1','#22d3ee','#10b981','#f59e0b','#f43f5e',
  '#8b5cf6','#38bdf8','#a3e635','#fb923c','#f472b6',
  '#4ade80','#facc15','#60a5fa','#c084fc','#34d399',
  '#fca5a5','#6ee7b7','#93c5fd','#fbbf24','#a78bfa',
  '#67e8f9','#bbf7d0','#fed7aa','#fecdd3','#ddd6fe',
];

// ===== STATE =====
let allData=[], tagData=[], ddData=[];
let filteredData=[], filteredTagData=[], filteredDDData=[];
let charts={};
let currentPage=1;
const PAGE_SIZE=20;
let sortCol='Date Submitted', sortDir='desc';
let tableFilter={search:'',status:'',rootCause:''};
let tagTableSortField='total', tagTableSortDir='desc';

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

const SECTION_ICONS = { overview:'📊', tickets:'🎫', sla:'⏱️', branch:'🗺️', tags:'🏷️', drawdown:'💰', map:'🌍' };
const SECTION_TITLES = { overview:'Overview', tickets:'Daftar Tiket', sla:'Analisis SLA', branch:'Analisis Cabang', tags:'Analisis Tag', drawdown:'Analisis Drawdown', map:'Peta Cabang (Experiment)' };

function navigateTo(section, statusFilter) {
  navItems.forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const navEl = document.getElementById(`nav-${section}`);
  const secEl = document.getElementById(`section-${section}`);
  if (navEl) navEl.classList.add('active');
  if (secEl) secEl.classList.add('active');
  currentPageTitle.textContent = SECTION_TITLES[section] || section;
  document.querySelector('.breadcrumb-icon').textContent = SECTION_ICONS[section] || '📊';
  if (section==='tickets' && statusFilter!==undefined) {
    tableStatusEl.value=statusFilter; tableFilter.status=statusFilter; currentPage=1; renderTicketTable();
  }
  if (section==='map') renderMapSection();
}

// ===== FILTER POPULATE =====
function populateFilters() {
  const months=[...new Set(allData.map(r=>r.Month).filter(Boolean))].sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  const products=[...new Set(allData.map(r=>r['Product Source']).filter(Boolean))].sort();
  filterMonth.innerHTML='<option value="">Semua Bulan</option>'+months.map(m=>`<option value="${m}">${m}</option>`).join('');
  filterProduct.innerHTML='<option value="">Semua Produk</option>'+products.map(p=>`<option value="${p}">${p}</option>`).join('');
}

// ===== GLOBAL FILTERS =====
function applyGlobalFilters() {
  const month=filterMonth.value, product=filterProduct.value;
  filteredData=allData.filter(r=>{
    if(month&&r.Month!==month)return false;
    if(product&&r['Product Source']!==product)return false;
    return true;
  });
  filteredTagData=tagData.filter(r=>{
    if(month&&monthNumToName(r.Month_Number)!==month)return false;
    if(product&&r['Product Source']!==product)return false;
    return true;
  });
  filteredDDData=ddData.filter(r=>{
    if(month){const d=parseDDDate(r['Submit Date']); if(!d||d.month!==month)return false;}
    return true;
  });
  currentPage=1;
  renderAll();
}
filterMonth.addEventListener('change',applyGlobalFilters);
filterProduct.addEventListener('change',applyGlobalFilters);

// ===== HELPERS =====
function countBy(arr,key){
  const map={};
  arr.forEach(r=>{const v=r[key]||'Unknown';map[v]=(map[v]||0)+1;});
  return map;
}
function topN(obj,n){return Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n);}
function destroyChart(key){if(charts[key]){charts[key].destroy();delete charts[key];}}
function avg(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;}
const branchField = r => r['Branch Name']||r['Branch']||'';

// FIX #2: Get current filtered data snapshot for export (respects all active filters)
function getExportData() {
  // This always uses the currently-filtered data, consistent with what's on screen
  let data=[...filteredData];
  if(tableFilter.search) data=data.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(tableFilter.search)));
  if(tableFilter.status==='__open__') data=data.filter(r=>!['resolved','closed'].includes((r.Status||'').toLowerCase()));
  else if(tableFilter.status) data=data.filter(r=>(r.Status||'').toLowerCase()===tableFilter.status.toLowerCase());
  if(tableFilter.rootCause) data=data.filter(r=>r['Root Cause']===tableFilter.rootCause);
  return data.map(r=>({
    'ID':r.Id||'','Date Submitted':(r['Date Submitted']||'').split(' ')[0]||'',
    'Summary':r.Summary||'','Category':r.Category||'',
    'Product Source':r['Product Source']||'','Status':r.Status||'',
    'Root Cause':r['Root Cause']||'','Assigned To':r['Assigned To']||'',
    'Branch':r['Branch Name']||r.Branch||'','Month':r.Month||'','SLA (hari)':r.SLA||'',
  }));
}

// ===== DATA LOADING =====
async function parseCSV(url,name){
  const isLocal=location.protocol==='file:';
  const urlsToTry=isLocal?CORS_PROXIES.map(fn=>fn(url)):[url,...CORS_PROXIES.map(fn=>fn(url))];
  for(let i=0;i<urlsToTry.length;i++){
    try{
      const result=await new Promise((resolve,reject)=>{
        Papa.parse(urlsToTry[i],{download:true,header:true,skipEmptyLines:true,
          complete(r){
            const rows=r.data.filter(row=>Object.values(row).some(v=>v&&String(v).trim()!==''));
            if(rows.length===0){reject(new Error('Empty'));return;}
            resolve(rows);
          },error:reject});
      });
      console.log(`✅ ${name} loaded via URL ${i+1}: ${result.length} rows`);
      return result;
    }catch(e){console.warn(`⚠️ ${name} URL ${i+1} failed:`,e.message);}
  }
  throw new Error(`Gagal memuat ${name} dari semua URL`);
}

async function loadData(){
  showLoading(true);
  refreshBtn.classList.add('spinning');
  try{
    const [main,tags,dd]=await Promise.all([parseCSV(SHEET_CSV_URL,'Data_Source'),parseCSV(TAG_CSV_URL,'Helper_Tag'),parseCSV(DD_CSV_URL,'DD_SimFast')]);
    allData=main.filter(r=>r.Id&&r.Id.trim()!=='');
    tagData=tags.filter(r=>r.Id);
    // FIX #7: Filter out excluded branches from DD data
    ddData=dd.filter(r=>(r['Branch Name']||r.Status)&&!isExcludedBranch(r['Branch Name']));
    showLoading(false);
    refreshBtn.classList.remove('spinning');
    lastUpdateEl.textContent='Update: '+new Date().toLocaleTimeString('id-ID');
    document.querySelector('.ds-val').textContent='3 Sheets ✓';
    populateFilters();
    applyGlobalFilters();
  }catch(err){
    showLoading(false);
    refreshBtn.classList.remove('spinning');
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.innerHTML=`<div style="text-align:center;padding:32px;max-width:480px">
      <div style="font-size:2.5rem;margin-bottom:16px">⚠️</div>
      <h3 style="color:#f43f5e;margin-bottom:8px">Gagal Memuat Data</h3>
      <p style="color:#94a3b8;font-size:0.875rem;margin-bottom:20px">${err.message}<br><br>
        <strong style="color:#f1f5f9">Solusi:</strong> Upload ke <a href="https://app.netlify.com/drop" target="_blank" style="color:#6366f1">Netlify Drop</a> atau GitHub Pages.
      </p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button onclick="loadData()" style="padding:9px 20px;background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600">↻ Coba Lagi</button>
        <a href="https://app.netlify.com/drop" target="_blank" style="padding:9px 20px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;text-decoration:none">🚀 Netlify Drop</a>
      </div></div>`;
  }
}

function showLoading(show){
  if(show){loadingOverlay.classList.remove('hidden');loadingOverlay.innerHTML=`<div class="loading-spinner"></div><p class="loading-text">Memuat 3 sheet dari Google Sheets...</p>`;}
  else{loadingOverlay.classList.add('hidden');}
}
refreshBtn.addEventListener('click',loadData);

// ===== RENDER ALL =====
function renderAll(){
  renderOverview();
  renderTicketTable();
  renderSLA();
  renderBranch();
  renderTagSection();
  renderDrawdownSection();
  // Map only renders on demand when tab is active
}

// ===== OVERVIEW =====
function renderOverview(){
  const total=filteredData.length;
  const resolved=filteredData.filter(r=>r.Status==='resolved').length;
  const open=filteredData.filter(r=>['assigned','acknowledged','feedback'].includes(r.Status)).length;
  const slaVals=filteredData.map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));
  const avgSla=slaVals.length?(slaVals.reduce((a,b)=>a+b,0)/slaVals.length).toFixed(1):'-';
  document.getElementById('kpiTotal').textContent=total.toLocaleString();
  document.getElementById('kpiResolved').textContent=resolved.toLocaleString();
  document.getElementById('kpiOpen').textContent=open.toLocaleString();
  document.getElementById('kpiSla').textContent=avgSla;
  document.getElementById('kpiResolvedPct').textContent=total?`${((resolved/total)*100).toFixed(1)}%`:'';
  document.getElementById('kpiOpenPct').textContent=total?`${((open/total)*100).toFixed(1)}%`:'';
  document.getElementById('kpiSlaLabel').textContent=avgSla<1?'✅ Baik':avgSla<3?'⚠️ Perlu Perhatian':'🚨 Kritis';
  document.getElementById('kpi-total').onclick=()=>{tableFilter.status='';navigateTo('tickets','');};
  document.getElementById('kpi-resolved').onclick=()=>{tableFilter.status='resolved';navigateTo('tickets','resolved');};
  document.getElementById('kpi-open').onclick=()=>{tableFilter.status='__open__';navigateTo('tickets','__open__');};
  renderTrendChart(); renderStatusChart(); renderCategoryChart(); renderRootCauseChart(); renderProductChart();
}

function renderTrendChart(){
  const months=[...new Set(filteredData.map(r=>r.Month).filter(Boolean))].sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  destroyChart('trend');
  charts.trend=new Chart(document.getElementById('trendChart').getContext('2d'),{type:'line',
    data:{labels:months,datasets:[
      {label:'Total Tiket',data:months.map(m=>filteredData.filter(r=>r.Month===m).length),borderColor:PALETTE.primary,backgroundColor:PALETTE.primary+'30',tension:0.4,fill:true,pointRadius:5,borderWidth:2.5},
      {label:'Resolved',data:months.map(m=>filteredData.filter(r=>r.Month===m&&r.Status==='resolved').length),borderColor:PALETTE.emerald,backgroundColor:PALETTE.emerald+'20',tension:0.4,fill:true,pointRadius:4,borderWidth:2,borderDash:[5,3]}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{grid:{display:false}},y:{grid:{color:'rgba(255,255,255,0.04)'},beginAtZero:true}}}});
}
function renderStatusChart(){
  const entries=topN(countBy(filteredData,'Status'),10);
  destroyChart('status');
  charts.status=new Chart(document.getElementById('statusChart').getContext('2d'),{type:'doughnut',
    data:{labels:entries.map(x=>x[0]),datasets:[{data:entries.map(x=>x[1]),backgroundColor:MULTI.map(c=>c+'cc'),borderColor:MULTI,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:10}}}}}});
}
function renderCategoryChart(){
  const top=topN(countBy(filteredData,'Category'),10);
  destroyChart('category');
  charts.category=new Chart(document.getElementById('categoryChart').getContext('2d'),{type:'bar',
    data:{labels:top.map(x=>x[0].length>30?x[0].slice(0,28)+'…':x[0]),datasets:[{label:'Tiket',data:top.map(x=>x[1]),backgroundColor:PALETTE.primary+'99',borderColor:PALETTE.primary,borderWidth:2,borderRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{grid:{display:false},ticks:{font:{size:10}}}}}});
}
function renderRootCauseChart(){
  const entries=topN(countBy(filteredData,'Root Cause'),8);
  destroyChart('rootCause');
  charts.rootCause=new Chart(document.getElementById('rootCauseChart').getContext('2d'),{type:'doughnut',
    data:{labels:entries.map(x=>x[0]),datasets:[{data:entries.map(x=>x[1]),backgroundColor:[PALETTE.primary,PALETTE.emerald,PALETTE.amber,PALETTE.rose,PALETTE.cyan,PALETTE.pink,PALETTE.sky,PALETTE.orange].map(c=>c+'cc'),borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'bottom',labels:{font:{size:10}}}}}});
}
function renderProductChart(){
  const entries=topN(countBy(filteredData,'Product Source'),10);
  destroyChart('product');
  charts.product=new Chart(document.getElementById('productChart').getContext('2d'),{type:'bar',
    data:{labels:entries.map(x=>x[0]),datasets:[{label:'Tiket',data:entries.map(x=>x[1]),backgroundColor:MULTI.map(c=>c+'99'),borderColor:MULTI,borderWidth:2,borderRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}}}});
}

// ===== TICKETS TABLE =====
tableSearchEl.addEventListener('input',()=>{tableFilter.search=tableSearchEl.value.toLowerCase();currentPage=1;renderTicketTable();});
tableStatusEl.addEventListener('change',()=>{tableFilter.status=tableStatusEl.value;currentPage=1;renderTicketTable();});
tableRootCauseEl.addEventListener('change',()=>{tableFilter.rootCause=tableRootCauseEl.value;currentPage=1;renderTicketTable();});
document.getElementById('ticketTable').addEventListener('click',e=>{
  const th=e.target.closest('th.sortable');if(!th)return;
  if(sortCol===th.dataset.col)sortDir=sortDir==='asc'?'desc':'asc';else{sortCol=th.dataset.col;sortDir='desc';}
  renderTicketTable();
});

function renderTicketTable(){
  let data=[...filteredData];
  if(tableFilter.search)data=data.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(tableFilter.search)));
  if(tableFilter.status==='__open__')data=data.filter(r=>!['resolved','closed'].includes((r.Status||'').toLowerCase()));
  else if(tableFilter.status)data=data.filter(r=>(r.Status||'').toLowerCase()===tableFilter.status.toLowerCase());
  if(tableFilter.rootCause)data=data.filter(r=>r['Root Cause']===tableFilter.rootCause);
  data.sort((a,b)=>{
    let av=a[sortCol]||'',bv=b[sortCol]||'';
    if(sortCol==='Date Submitted'||sortCol==='Id'){av=parseFloat(av)||av;bv=parseFloat(bv)||bv;}
    return sortDir==='asc'?(av>bv?1:-1):(av<bv?1:-1);
  });
  tableCountEl.textContent=`${data.length} tiket`;
  const page=data.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const statusMap={
    resolved:`<span class="badge badge-resolved">resolved</span>`,
    assigned:`<span class="badge badge-open">assigned</span>`,
    acknowledged:`<span class="badge badge-pending">acknowledged</span>`,
    feedback:`<span class="badge badge-pending">feedback</span>`,
    closed:`<span class="badge" style="background:rgba(148,163,184,0.15);color:#94a3b8">closed</span>`,
  };
  tableBodyEl.innerHTML=page.map(r=>{
    const sla=parseFloat(r.SLA);
    const slaClass=isNaN(sla)?'':sla<=1?'sla-good':sla<=3?'sla-warn':'sla-bad';
    const statusBadge=statusMap[(r.Status||'').toLowerCase()]||`<span class="badge">${r.Status||'-'}</span>`;
    return `<tr>
      <td><a href="https://mantis.simasfinance.co.id/view.php?id=${r.Id}" style="color:${PALETTE.primary}">#${r.Id}</a></td>
      <td style="white-space:nowrap;font-size:0.78rem">${(r['Date Submitted']||'').split(' ')[0]||'-'}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.Summary||''}">${r.Summary||'-'}</td>
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
function renderPagination(total){
  const pages=Math.ceil(total/PAGE_SIZE);
  if(pages<=1){paginationEl.innerHTML='';return;}
  let html='';
  for(let i=1;i<=Math.min(pages,7);i++)html+=`<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
  if(pages>7)html+=`<span style="color:#94a3b8;padding:0 8px">… ${pages} hal.</span>`;
  paginationEl.innerHTML=html;
}
function goPage(p){currentPage=p;renderTicketTable();}

// ===== SLA SECTION =====
function renderSLA(){
  const resolved=filteredData.filter(r=>r.Status==='resolved');
  const slaVals=resolved.map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));
  document.getElementById('slaMet').textContent=slaVals.filter(v=>v<=1).length;
  document.getElementById('slaWarning').textContent=slaVals.filter(v=>v>1&&v<=3).length;
  document.getElementById('slaBreached').textContent=slaVals.filter(v=>v>3).length;
  document.getElementById('slaOnProgress').textContent=filteredData.filter(r=>r.Status==='assigned'||r.Status==='acknowledged').length;
  renderSlaDistChart(slaVals); renderSlaMonthChart(); renderSlaAssigneeChart(resolved); renderSlaProductChart();
}
function renderSlaDistChart(slaVals){
  const buckets={'0-1':0,'1-2':0,'2-3':0,'3-5':0,'5-10':0,'>10':0};
  slaVals.forEach(v=>{if(v<=1)buckets['0-1']++;else if(v<=2)buckets['1-2']++;else if(v<=3)buckets['2-3']++;else if(v<=5)buckets['3-5']++;else if(v<=10)buckets['5-10']++;else buckets['>10']++;});
  destroyChart('slaDist');
  charts.slaDist=new Chart(document.getElementById('slaDistChart').getContext('2d'),{type:'bar',
    data:{labels:Object.keys(buckets),datasets:[{label:'Jumlah Tiket',data:Object.values(buckets),backgroundColor:[PALETTE.emerald,PALETTE.cyan,PALETTE.amber,PALETTE.orange,PALETTE.rose,PALETTE.rose].map(c=>c+'bb'),borderColor:[PALETTE.emerald,PALETTE.cyan,PALETTE.amber,PALETTE.orange,PALETTE.rose,PALETTE.rose],borderWidth:2,borderRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}}}});
}
function renderSlaMonthChart(){
  const months=[...new Set(filteredData.map(r=>r.Month).filter(Boolean))].sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  const avgByMonth=months.map(m=>{const vals=filteredData.filter(r=>r.Month===m&&r.Status==='resolved').map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));return vals.length?avg(vals).toFixed(1):0;});
  destroyChart('slaMonth');
  charts.slaMonth=new Chart(document.getElementById('slaMonthChart').getContext('2d'),{type:'line',
    data:{labels:months,datasets:[{label:'Avg SLA (hari)',data:avgByMonth,borderColor:PALETTE.amber,backgroundColor:PALETTE.amber+'30',tension:0.4,fill:true,pointRadius:5,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}}}});
}
function renderSlaAssigneeChart(resolved){
  const m={};
  resolved.forEach(r=>{const a=r['Assigned To']||r.Assignee||'Unknown';if(!m[a])m[a]={total:0,sum:0};const sla=parseFloat(r.SLA);if(!isNaN(sla)){m[a].total++;m[a].sum+=sla;}});
  const top=Object.entries(m).filter(([,v])=>v.total>=2).map(([k,v])=>[k,(v.sum/v.total).toFixed(1)]).sort((a,b)=>b[1]-a[1]).slice(0,15);
  destroyChart('slaAssignee');
  charts.slaAssignee=new Chart(document.getElementById('slaAssigneeChart').getContext('2d'),{type:'bar',
    data:{labels:top.map(x=>x[0]),datasets:[{label:'Avg SLA',data:top.map(x=>x[1]),backgroundColor:top.map((_,i)=>MULTI[i%MULTI.length]+'99'),borderColor:top.map((_,i)=>MULTI[i%MULTI.length]),borderWidth:2,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{grid:{display:false},ticks:{font:{size:10}}}}}});
}
function renderSlaProductChart(){
  const products=[...new Set(filteredData.map(r=>r['Product Source']).filter(Boolean))];
  const avgSla=products.map(p=>{const vals=filteredData.filter(r=>r['Product Source']===p&&r.Status==='resolved').map(r=>parseFloat(r.SLA)).filter(v=>!isNaN(v));return vals.length?avg(vals).toFixed(1):0;});
  destroyChart('slaProduct');
  charts.slaProduct=new Chart(document.getElementById('slaProductChart').getContext('2d'),{type:'bar',
    data:{labels:products,datasets:[{label:'Avg SLA',data:avgSla,backgroundColor:MULTI.map(c=>c+'99'),borderColor:MULTI,borderWidth:2,borderRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}}}});
}

// ===== BRANCH SECTION =====
// Shared datalabels plugin (inline, no CDN needed)
const dataLabelsPlugin = {
  id:'inlineLabels',
  afterDatasetsDraw(chart){
    const ctx=chart.ctx;
    chart.data.datasets.forEach((ds,di)=>{
      const meta=chart.getDatasetMeta(di);
      if(meta.hidden)return;
      meta.data.forEach((bar,bi)=>{
        const val=ds.data[bi];
        if(!val||val===0)return;
        ctx.save();
        ctx.font='bold 10px Inter,sans-serif';
        ctx.fillStyle='rgba(255,255,255,0.9)';
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        const {x,y,width,height}=bar.getProps(['x','y','width','height'],true);
        // For horizontal bar: place label inside bar if wide enough
        if(chart.config.options.indexAxis==='y'){
          const labelX=bar.x-val.toString().length*3.5-4;
          if(bar.x-bar.base>20)ctx.fillText(val,Math.max(bar.base+val.toString().length*3.5+4,labelX+val.toString().length*3.5+4),bar.y);
        } else {
          if(bar.base-bar.y>14)ctx.fillText(val,bar.x,bar.y+10);
        }
        ctx.restore();
      });
    });
  }
};

// Navigate to Tiket with combined filters
function navToTickets(opts={}){
  // opts: { branch, category, rootCause }
  tableFilter.status='';
  tableFilter.search='';
  tableFilter.rootCause=opts.rootCause||'';
  // Store branch/category filter for ticket table
  window._branchFilter=opts.branch||'';
  window._categoryFilter=opts.category||'';
  navigateTo('tickets','');
  // Apply after render
  setTimeout(()=>{
    if(opts.branch||opts.category){
      const q=[opts.branch,opts.category].filter(Boolean).join(' ').toLowerCase();
      tableSearchEl.value=q;
      tableFilter.search=q;
      renderTicketTable();
    }
  },50);
}

function renderBranch(){
  const counts=countBy(filteredData.map(r=>({...r,_bn:branchField(r)})),'_bn');
  const top20=topN(counts,20);
  const top20names=top20.map(x=>x[0]);
  const top10names=top20.slice(0,10).map(x=>x[0]);

  // ── 1. Breakdown Kategori per Cabang (replaces branchBar) ──────────
  const top5cats=topN(countBy(filteredData,'Category'),5).map(x=>x[0]);
  const catDatasets=top5cats.map((c,i)=>({
    label:c.length>22?c.slice(0,20)+'…':c,
    data:top20names.map(b=>filteredData.filter(r=>branchField(r)===b&&r.Category===c).length),
    backgroundColor:MULTI[i]+'bb',borderColor:MULTI[i],borderWidth:2,borderRadius:3
  }));
  catDatasets.push({
    label:'Others',
    data:top20names.map(b=>filteredData.filter(r=>branchField(r)===b&&!top5cats.includes(r.Category)).length),
    backgroundColor:'#94a3b8'+'88',borderColor:'#94a3b8',borderWidth:2,borderRadius:3
  });

  // Compute totals per branch for label overlay
  const branchTotals=top20names.map(b=>filteredData.filter(r=>branchField(r)===b).length);

  destroyChart('branchCat');
  const ctxCat=document.getElementById('branchCatChart').getContext('2d');
  charts.branchCat=new Chart(ctxCat,{
    type:'bar',
    plugins:[{
      id:'totalLabel',
      afterDatasetsDraw(chart){
        const ctx2=chart.ctx;
        const meta=chart.getDatasetMeta(chart.data.datasets.length-1);
        meta.data.forEach((bar,bi)=>{
          const total=branchTotals[bi];
          if(!total)return;
          ctx2.save();
          ctx2.font='bold 11px Inter,sans-serif';
          ctx2.fillStyle='#f1f5f9';
          ctx2.textAlign='left';
          ctx2.textBaseline='middle';
          ctx2.fillText(total, bar.x+5, bar.y);
          ctx2.restore();
        });
      }
    }],
    data:{labels:top20names,datasets:catDatasets},
    options:{
      responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{position:'top',labels:{font:{size:9}}},
        tooltip:{callbacks:{
          footer(items){return 'Total: '+branchTotals[items[0].dataIndex];}
        }}
      },
      scales:{x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}}},
      onClick(evt,els){
        if(!els.length)return;
        const b=top20names[els[0].index];
        navToTickets({branch:b});
      }
    }
  });

  // ── 2. Root Cause per Cabang (TOP 10, replaces branchStatus position) ──
  const rcs=['System','People','Process'],rcColors=[PALETTE.primary,PALETTE.amber,PALETTE.emerald];
  destroyChart('branchRc');
  const ctxRc=document.getElementById('branchRcChart').getContext('2d');
  charts.branchRc=new Chart(ctxRc,{
    type:'bar',
    plugins:[{
      id:'rcInlineLabel',
      afterDatasetsDraw(chart){
        const ctx2=chart.ctx;
        chart.data.datasets.forEach((ds,di)=>{
          const meta=chart.getDatasetMeta(di);
          if(meta.hidden)return;
          meta.data.forEach((bar,bi)=>{
            const val=ds.data[bi];
            if(!val)return;
            const w=bar.x-bar.base;
            if(w<18)return;
            ctx2.save();
            ctx2.font='bold 10px Inter,sans-serif';
            ctx2.fillStyle='rgba(255,255,255,0.9)';
            ctx2.textAlign='center';
            ctx2.textBaseline='middle';
            ctx2.fillText(val,bar.base+w/2,bar.y);
            ctx2.restore();
          });
        });
      }
    }],
    data:{
      labels:top10names,
      datasets:rcs.map((rc,i)=>({
        label:rc,
        data:top10names.map(b=>filteredData.filter(r=>branchField(r)===b&&r['Root Cause']===rc).length),
        backgroundColor:rcColors[i]+'99',borderColor:rcColors[i],borderWidth:2,borderRadius:3
      }))
    },
    options:{
      responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{position:'top'}},
      scales:{x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}}},
      onClick(evt,els){
        if(!els.length)return;
        const b=top10names[els[0].index];
        const rc=rcs[els[0].datasetIndex];
        navToTickets({branch:b,rootCause:rc});
      }
    }
  });

  // ── 3+4. Overview Kategori & Branch (removed per request) ──────────────
}

// ===== OVERVIEW KATEGORI (Req #3 & #4) =====
let catOvState = { selectedCats:[], selectedMonths:[], allCats:[], allMonths:[] };

function renderCategoryOverview(){
  const allMonths=[...new Set(filteredData.map(r=>r.Month).filter(Boolean))].sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  const catCounts=countBy(filteredData,'Category');
  const allCatsSorted=topN(catCounts,999).map(x=>x[0]);
  const top5=allCatsSorted.slice(0,5);

  // Init state if first time or data changed
  if(catOvState.allCats.join()!==allCatsSorted.join()||catOvState.allMonths.join()!==allMonths.join()){
    catOvState.allCats=allCatsSorted;
    catOvState.allMonths=allMonths;
    catOvState.selectedCats=[...top5,'Others'];
    catOvState.selectedMonths=[...allMonths];
  }

  _buildCatOvDropdowns();
  _drawCatOvChart();
  _drawCatOvTable();
}

function _buildCatOvDropdowns(){
  const catDd=document.getElementById('catOvCatDrop');
  const monDd=document.getElementById('catOvMonDrop');
  if(!catDd||!monDd)return;

  const {allCats,allMonths,selectedCats,selectedMonths}=catOvState;

  catDd.innerHTML=`
    <div class="ov-dd-scroll">
      <label class="ov-cb-row"><input type="checkbox" id="catOvAllCat" ${selectedCats.length===allCats.length+1?'checked':''}> <span>ALL</span></label>
      ${allCats.map(c=>`<label class="ov-cb-row"><input type="checkbox" class="catOvCatCb" value="${c}" ${selectedCats.includes(c)?'checked':''}> <span>${c.length>35?c.slice(0,33)+'…':c}</span></label>`).join('')}
      <label class="ov-cb-row"><input type="checkbox" class="catOvCatCb" value="Others" ${selectedCats.includes('Others')?'checked':''}> <span>Others</span></label>
    </div>`;

  monDd.innerHTML=`
    <div class="ov-dd-scroll">
      <label class="ov-cb-row"><input type="checkbox" id="catOvAllMon" ${selectedMonths.length===allMonths.length?'checked':''}> <span>ALL</span></label>
      ${allMonths.map(m=>`<label class="ov-cb-row"><input type="checkbox" class="catOvMonCb" value="${m}" ${selectedMonths.includes(m)?'checked':''}> <span>${m}</span></label>`).join('')}
    </div>`;

  // ALL category toggle
  document.getElementById('catOvAllCat').onchange=function(){
    const cbs=document.querySelectorAll('.catOvCatCb');
    if(this.checked){catOvState.selectedCats=[...catOvState.allCats,'Others'];}
    else{catOvState.selectedCats=[];}
    cbs.forEach(cb=>cb.checked=this.checked);
    _drawCatOvChart();_drawCatOvTable();
  };
  document.querySelectorAll('.catOvCatCb').forEach(cb=>{
    cb.onchange=()=>{
      catOvState.selectedCats=Array.from(document.querySelectorAll('.catOvCatCb:checked')).map(x=>x.value);
      _drawCatOvChart();_drawCatOvTable();
    };
  });

  // ALL month toggle
  document.getElementById('catOvAllMon').onchange=function(){
    const cbs=document.querySelectorAll('.catOvMonCb');
    if(this.checked){catOvState.selectedMonths=[...catOvState.allMonths];}
    else{catOvState.selectedMonths=[];}
    cbs.forEach(cb=>cb.checked=this.checked);
    _drawCatOvChart();_drawCatOvTable();
  };
  document.querySelectorAll('.catOvMonCb').forEach(cb=>{
    cb.onchange=()=>{
      catOvState.selectedMonths=Array.from(document.querySelectorAll('.catOvMonCb:checked')).map(x=>x.value);
      _drawCatOvChart();_drawCatOvTable();
    };
  });
}

function _getCatOvData(){
  const {selectedCats,selectedMonths,allCats}=catOvState;
  const top5=allCats.slice(0,5);
  const months=selectedMonths.length?selectedMonths:catOvState.allMonths;
  const cats=selectedCats.filter(c=>c!=='Others');
  return months.map(month=>{
    const monthRows=filteredData.filter(r=>r.Month===month);
    const obj={month};
    cats.forEach(c=>{ obj[c]=monthRows.filter(r=>r.Category===c).length; });
    if(selectedCats.includes('Others')){
      obj['Others']=monthRows.filter(r=>!cats.includes(r.Category)).length;
    }
    return obj;
  });
}

function _drawCatOvChart(){
  const {selectedCats}=catOvState;
  const data=_getCatOvData();
  const cats=selectedCats.filter(c=>c!=='Others');
  const showOthers=selectedCats.includes('Others');

  const datasets=[
    ...cats.map((c,i)=>({
      label:c.length>20?c.slice(0,18)+'…':c,
      data:data.map(d=>d[c]||0),
      backgroundColor:MULTI[i%MULTI.length]+'99',borderColor:MULTI[i%MULTI.length],borderWidth:2,borderRadius:4
    })),
    ...(showOthers?[{label:'Others',data:data.map(d=>d['Others']||0),backgroundColor:'#94a3b8'+'88',borderColor:'#94a3b8',borderWidth:2,borderRadius:4}]:[])
  ];

  destroyChart('catOv');
  const ctx=document.getElementById('catOvChart');if(!ctx)return;
  charts.catOv=new Chart(ctx.getContext('2d'),{
    type:'bar',
    plugins:[{
      id:'catOvLabel',
      afterDatasetsDraw(chart){
        const ctx2=chart.ctx;
        chart.data.datasets.forEach((ds,di)=>{
          const meta=chart.getDatasetMeta(di);
          if(meta.hidden)return;
          meta.data.forEach((bar,bi)=>{
            const val=ds.data[bi];if(!val)return;
            const h=bar.base-bar.y;if(h<14)return;
            ctx2.save();ctx2.font='bold 10px Inter,sans-serif';
            ctx2.fillStyle='rgba(255,255,255,0.92)';ctx2.textAlign='center';ctx2.textBaseline='middle';
            ctx2.fillText(val,bar.x,bar.y+h/2);ctx2.restore();
          });
        });
      }
    }],
    data:{labels:data.map(d=>d.month),datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'top',labels:{font:{size:10}}},
        tooltip:{mode:'index',intersect:false}
      },
      scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}}
    }
  });
}

function _drawCatOvTable(){
  const {selectedCats,selectedMonths,allCats}=catOvState;
  const months=selectedMonths.length?selectedMonths:catOvState.allMonths;
  const cats=selectedCats.filter(c=>c!=='Others');
  const showOthers=selectedCats.includes('Others');
  const allSelected=[...cats,...(showOthers?['Others']:[])];

  const tbody=document.getElementById('catOvTableBody');if(!tbody)return;
  const rows=[];

  allSelected.forEach(cat=>{
    const branches=[...new Set(filteredData.filter(r=>cat==='Others'?!allCats.slice(0,5).includes(r.Category):r.Category===cat).map(r=>branchField(r)).filter(Boolean))];

    branches.forEach(branch=>{
      months.forEach(month=>{
        const monthBranchRows=filteredData.filter(r=>r.Month===month&&branchField(r)===branch&&(cat==='Others'?!allCats.slice(0,5).includes(r.Category):r.Category===cat));
        if(!monthBranchRows.length)return;
        const rcMap=countBy(monthBranchRows,'Root Cause');
        const topRc=topN(rcMap,1)[0];
        // Tags
        const tagRowsHere=filteredTagData.filter(r=>r.Month_Number&&monthNumToName(r.Month_Number)===month&&normBranch(r['Branch Name']||r['Branch']||'')===normBranch(branch));
        const tagMap=countBy(tagRowsHere.filter(r=>r.Tag&&r.Tag.trim()!==''),'Tag');
        const topTags=topN(tagMap,3).map(([t,n])=>`${t}(${n})`).join(', ')||'—';
        rows.push({cat,branch,month,count:monthBranchRows.length,rc:topRc?topRc[0]:'—',rcCount:topRc?topRc[1]:0,tags:topTags});
      });
    });
  });

  // Compute avg per cat-month
  const avgMap={};
  rows.forEach(r=>{
    const k=r.cat+'|'+r.month;
    if(!avgMap[k])avgMap[k]={total:0,branches:new Set()};
    avgMap[k].total+=r.count; avgMap[k].branches.add(r.branch);
  });

  // Group by cat for rowspan
  let html='';
  let lastCat='',lastMon='';
  rows.forEach((r,i)=>{
    const catSpan=rows.filter(x=>x.cat===r.cat).length;
    const monSpan=rows.filter(x=>x.cat===r.cat&&x.month===r.month).length;
    const k=r.cat+'|'+r.month;
    const avg2=avgMap[k]?(avgMap[k].total/avgMap[k].branches.size).toFixed(2):'—';
    let catCell='',monCell='';
    if(r.cat!==lastCat){catCell=`<td rowspan="${catSpan}" style="font-weight:700;color:${PALETTE.primary};vertical-align:top;border-right:1px solid rgba(255,255,255,0.08)">${r.cat}</td>`;lastCat=r.cat;lastMon='';}
    if(r.month!==lastMon||catCell){monCell=`<td rowspan="${monSpan}" style="font-weight:600;vertical-align:top;border-right:1px solid rgba(255,255,255,0.06)">${r.month}</td>`;lastMon=r.month;}
    html+=`<tr>
      ${catCell}${monCell}
      <td style="font-size:0.78rem">${r.branch}</td>
      <td style="font-weight:700;color:${PALETTE.rose};text-align:right">${r.count}</td>
      <td style="font-size:0.78rem">${r.rc}</td>
      <td style="text-align:right;color:${PALETTE.amber}">${r.rcCount}</td>
      <td style="text-align:right;color:${PALETTE.cyan};font-weight:600">${avg2}</td>
      <td style="font-size:0.76rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.tags}</td>
    </tr>`;
  });
  tbody.innerHTML=html||'<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:20px">Pilih kategori dan bulan di atas</td></tr>';
}

// ===== OVERVIEW BRANCH (Req #5 & #6) =====
let brOvState = { selectedBranches:[], selectedMonths:[], allBranches:[], allMonths:[] };

function renderBranchOverview(){
  const allMonths=[...new Set(filteredData.map(r=>r.Month).filter(Boolean))].sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  const brCounts=countBy(filteredData.map(r=>({...r,_bn:branchField(r)})),'_bn');
  const allBranchesSorted=topN(brCounts,999).map(x=>x[0]);
  const top10=allBranchesSorted.slice(0,10);

  if(brOvState.allBranches.join()!==allBranchesSorted.join()||brOvState.allMonths.join()!==allMonths.join()){
    brOvState.allBranches=allBranchesSorted;
    brOvState.allMonths=allMonths;
    brOvState.selectedBranches=[...top10];
    brOvState.selectedMonths=[...allMonths];
  }

  _buildBrOvDropdowns();
  _drawBrOvChart();
  _drawBrOvTable();
}

function _buildBrOvDropdowns(){
  const brDd=document.getElementById('brOvBrDrop');
  const monDd=document.getElementById('brOvMonDrop');
  if(!brDd||!monDd)return;
  const {allBranches,allMonths,selectedBranches,selectedMonths}=brOvState;

  brDd.innerHTML=`<div class="ov-dd-scroll">
    <label class="ov-cb-row"><input type="checkbox" id="brOvAllBr" ${selectedBranches.length===allBranches.length?'checked':''}> <span>ALL</span></label>
    ${allBranches.map(b=>`<label class="ov-cb-row"><input type="checkbox" class="brOvBrCb" value="${b}" ${selectedBranches.includes(b)?'checked':''}> <span>${b.length>30?b.slice(0,28)+'…':b}</span></label>`).join('')}
  </div>`;

  monDd.innerHTML=`<div class="ov-dd-scroll">
    <label class="ov-cb-row"><input type="checkbox" id="brOvAllMon" ${selectedMonths.length===allMonths.length?'checked':''}> <span>ALL</span></label>
    ${allMonths.map(m=>`<label class="ov-cb-row"><input type="checkbox" class="brOvMonCb" value="${m}" ${selectedMonths.includes(m)?'checked':''}> <span>${m}</span></label>`).join('')}
  </div>`;

  document.getElementById('brOvAllBr').onchange=function(){
    const cbs=document.querySelectorAll('.brOvBrCb');
    brOvState.selectedBranches=this.checked?[...brOvState.allBranches]:[];
    cbs.forEach(cb=>cb.checked=this.checked);
    _drawBrOvChart();_drawBrOvTable();
  };
  document.querySelectorAll('.brOvBrCb').forEach(cb=>{
    cb.onchange=()=>{
      brOvState.selectedBranches=Array.from(document.querySelectorAll('.brOvBrCb:checked')).map(x=>x.value);
      _drawBrOvChart();_drawBrOvTable();
    };
  });
  document.getElementById('brOvAllMon').onchange=function(){
    const cbs=document.querySelectorAll('.brOvMonCb');
    brOvState.selectedMonths=this.checked?[...brOvState.allMonths]:[];
    cbs.forEach(cb=>cb.checked=this.checked);
    _drawBrOvChart();_drawBrOvTable();
  };
  document.querySelectorAll('.brOvMonCb').forEach(cb=>{
    cb.onchange=()=>{
      brOvState.selectedMonths=Array.from(document.querySelectorAll('.brOvMonCb:checked')).map(x=>x.value);
      _drawBrOvChart();_drawBrOvTable();
    };
  });
}

function _drawBrOvChart(){
  const {selectedBranches,selectedMonths}=brOvState;
  const months=selectedMonths.length?selectedMonths:brOvState.allMonths;

  const datasets=selectedBranches.map((b,i)=>({
    label:b.length>18?b.slice(0,16)+'…':b,
    data:months.map(m=>filteredData.filter(r=>r.Month===m&&branchField(r)===b).length),
    backgroundColor:MULTI[i%MULTI.length]+'99',borderColor:MULTI[i%MULTI.length],borderWidth:2,borderRadius:4
  }));

  destroyChart('brOv');
  const ctx=document.getElementById('brOvChart');if(!ctx)return;
  charts.brOv=new Chart(ctx.getContext('2d'),{
    type:'bar',
    plugins:[{
      id:'brOvLabel',
      afterDatasetsDraw(chart){
        const ctx2=chart.ctx;
        chart.data.datasets.forEach((ds,di)=>{
          const meta=chart.getDatasetMeta(di);
          if(meta.hidden)return;
          meta.data.forEach((bar,bi)=>{
            const val=ds.data[bi];if(!val)return;
            const h=bar.base-bar.y;if(h<14)return;
            ctx2.save();ctx2.font='bold 10px Inter,sans-serif';
            ctx2.fillStyle='rgba(255,255,255,0.92)';ctx2.textAlign='center';ctx2.textBaseline='middle';
            ctx2.fillText(val,bar.x,bar.y+h/2);ctx2.restore();
          });
        });
      }
    }],
    data:{labels:months,datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'top',labels:{font:{size:9}}},tooltip:{mode:'index',intersect:false}},
      scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}}
    }
  });
}

function _drawBrOvTable(){
  const {selectedBranches,selectedMonths}=brOvState;
  const months=selectedMonths.length?selectedMonths:brOvState.allMonths;
  const tbody=document.getElementById('brOvTableBody');if(!tbody)return;

  let html='';
  selectedBranches.forEach(branch=>{
    const branchRows=filteredData.filter(r=>branchField(r)===branch&&selectedMonths.includes(r.Month));
    const top10cats=topN(countBy(branchRows,'Category'),10).map(([c,n])=>c);

    // Issue per month
    const issuePerMonth=months.map(m=>filteredData.filter(r=>branchField(r)===branch&&r.Month===m).length);
    const totalIssue=issuePerMonth.reduce((a,b)=>a+b,0);
    const avgIssue=months.length?(totalIssue/months.length).toFixed(2):'—';

    // RC per month
    const rcPerMonth=months.map(m=>{
      const rcMap=countBy(filteredData.filter(r=>branchField(r)===branch&&r.Month===m),'Root Cause');
      return topN(rcMap,1)[0]||['—',0];
    });
    const totalRc=rcPerMonth.reduce((a,b)=>a+b[1],0);
    const avgRc=months.length?(totalRc/months.length).toFixed(2):'—';

    const branchSpan=Math.max(1,months.length);
    months.forEach((month,mi)=>{
      const monthIssue=issuePerMonth[mi];
      const monthRc=rcPerMonth[mi];
      let branchCell='';
      if(mi===0){
        branchCell=`<td rowspan="${branchSpan}" style="font-weight:700;color:${PALETTE.primary};vertical-align:top;border-right:1px solid rgba(255,255,255,0.08)">
          ${branch}
          <div style="font-size:0.72rem;color:#64748b;margin-top:4px">${top10cats.slice(0,3).join(', ')}</div>
        </td>`;
      }
      html+=`<tr>
        ${branchCell}
        <td style="font-size:0.78rem;font-weight:600">${month}</td>
        <td style="font-weight:700;color:${PALETTE.rose};text-align:right">${monthIssue}</td>
        <td style="text-align:right;color:${PALETTE.emerald};font-weight:600">${mi===0?avgIssue:'—'}</td>
        <td style="font-size:0.78rem">${monthRc[0]}</td>
        <td style="text-align:right;color:${PALETTE.amber}">${monthRc[1]}</td>
        <td style="text-align:right;color:${PALETTE.cyan};font-weight:600">${mi===0?avgRc:'—'}</td>
      </tr>`;
    });
  });

  tbody.innerHTML=html||'<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">Pilih cabang dan bulan di atas</td></tr>';
}

// ===== TAG SECTION =====
function renderTagSection(){
  const withTag=filteredTagData.filter(r=>r.Tag&&r.Tag.trim()!=='');
  if(withTag.length===0)return;
  renderTopTagsChart(withTag);
  renderTagCategoryChart(withTag);
  renderBranchTagChart(withTag); // FIX #3
  renderTagMonthChart(withTag);
  renderTagBranchTable(withTag);
}
function renderTopTagsChart(data){
  const top=topN(countBy(data,'Tag'),20);
  destroyChart('topTags');
  charts.topTags=new Chart(document.getElementById('topTagsChart').getContext('2d'),{type:'bar',
    data:{labels:top.map(x=>x[0]),datasets:[{label:'Frekuensi',data:top.map(x=>x[1]),backgroundColor:MULTI.slice(0,top.length).map(c=>c+'99'),borderColor:MULTI.slice(0,top.length),borderWidth:2,borderRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{grid:{display:false},ticks:{font:{size:10}}}}}});
}
function renderTagCategoryChart(data){
  const top=topN(countBy(data,'Category'),10);
  destroyChart('tagCategory');
  charts.tagCategory=new Chart(document.getElementById('tagCategoryChart').getContext('2d'),{type:'doughnut',
    data:{labels:top.map(x=>x[0].length>28?x[0].slice(0,26)+'…':x[0]),datasets:[{data:top.map(x=>x[1]),backgroundColor:MULTI.slice(0,top.length).map(c=>c+'cc'),borderColor:MULTI,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'bottom',labels:{font:{size:10}}}}}});
}

// FIX #3: Top 20 cabang × Top 20 tag + Others (1 unit fixed width)
function renderBranchTagChart(data){
  const issueCounts=countBy(filteredData.map(r=>({...r,_bn:branchField(r)})),'_bn');
  const top20Branches=topN(issueCounts,20).map(x=>x[0]);
  const top20Tags=topN(countBy(data,'Tag'),20).map(x=>x[0]);
  const datasets=top20Tags.map((tag,i)=>({
    label:tag.length>20?tag.slice(0,18)+'…':tag,
    data:top20Branches.map(b=>data.filter(r=>normBranch(r['Branch Name']||r['Branch']||'')===normBranch(b)&&r.Tag===tag).length),
    backgroundColor:MULTI[i%MULTI.length]+'99',borderColor:MULTI[i%MULTI.length],borderWidth:1,borderRadius:2
  }));
  // Others: fixed width = 1 unit per bar (symbolic, tidak proporsional)
  datasets.push({
    label:'Others',
    data:top20Branches.map(()=>1),
    backgroundColor:'#64748b'+'66',borderColor:'#64748b',borderWidth:1,borderRadius:2
  });
  destroyChart('branchTag');
  charts.branchTag=new Chart(document.getElementById('branchTagChart').getContext('2d'),{type:'bar',
    data:{labels:top20Branches,datasets},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{position:'top',labels:{font:{size:9},boxWidth:10}},
        tooltip:{callbacks:{label(ctx){if(ctx.dataset.label==='Others')return ' Others (tidak terdeteksi tag)';return ` ${ctx.dataset.label}: ${ctx.parsed.x}`;}}}},
      scales:{x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}}}}});
}
function renderTagMonthChart(data){
  const months=[...new Set(data.map(r=>monthNumToName(r.Month_Number)).filter(Boolean))].sort((a,b)=>MONTH_ORDER.indexOf(a)-MONTH_ORDER.indexOf(b));
  const top5Tags=topN(countBy(data,'Tag'),5).map(x=>x[0]);
  destroyChart('tagMonth');
  charts.tagMonth=new Chart(document.getElementById('tagMonthChart').getContext('2d'),{type:'line',
    data:{labels:months,datasets:top5Tags.map((tag,i)=>({label:tag.length>22?tag.slice(0,20)+'…':tag,data:months.map(m=>data.filter(r=>monthNumToName(r.Month_Number)===m&&r.Tag===tag).length),borderColor:MULTI[i%MULTI.length],backgroundColor:MULTI[i%MULTI.length]+'30',tension:0.4,fill:false,pointRadius:4,borderWidth:2}))},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:10}}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}}}});
}

function renderTagBranchTable(tagRows){
  const tagMap={};
  tagRows.forEach(r=>{
    const tag=(r.Tag||'').trim();if(!tag)return;
    const branch=(r['Branch Name']||r['Branch']||'Unknown').trim();
    if(!tagMap[tag])tagMap[tag]={};
    tagMap[tag][branch]=(tagMap[tag][branch]||0)+1;
  });
  window._tagBranchRawData=Object.entries(tagMap).map(([tag,branchObj])=>{
    const total=Object.values(branchObj).reduce((a,b)=>a+b,0);
    const topBranches=Object.entries(branchObj).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return{tag,total,topBranches};
  });
  tagTableSortField='total';tagTableSortDir='desc';
  _applyTagTableSortAndFilter('');
  const searchEl=document.getElementById('tagTableSearch');
  if(searchEl)searchEl.oninput=()=>_applyTagTableSortAndFilter(searchEl.value.toLowerCase().trim());
  const sortTagHdr=document.getElementById('tagTableSortHeader');
  const sortTotHdr=document.getElementById('tagTotalSortHeader');
  if(sortTagHdr)sortTagHdr.onclick=()=>{if(tagTableSortField==='tag')tagTableSortDir=tagTableSortDir==='asc'?'desc':'asc';else{tagTableSortField='tag';tagTableSortDir='asc';}_applyTagTableSortAndFilter((document.getElementById('tagTableSearch')||{}).value||'');};
  if(sortTotHdr)sortTotHdr.onclick=()=>{if(tagTableSortField==='total')tagTableSortDir=tagTableSortDir==='asc'?'desc':'asc';else{tagTableSortField='total';tagTableSortDir='desc';}_applyTagTableSortAndFilter((document.getElementById('tagTableSearch')||{}).value||'');};
}
function _applyTagTableSortAndFilter(query){
  let rows=(window._tagBranchRawData||[]).slice();
  if(query)rows=rows.filter(row=>row.tag.toLowerCase().includes(query)||row.topBranches.some(([b])=>b.toLowerCase().includes(query)));
  rows.sort((a,b)=>{if(tagTableSortField==='tag')return tagTableSortDir==='asc'?a.tag.localeCompare(b.tag):b.tag.localeCompare(a.tag);return tagTableSortDir==='asc'?a.total-b.total:b.total-a.total;});
  const tbody=document.getElementById('tagBranchTableBody');if(!tbody)return;
  tbody.innerHTML=rows.map((row,i)=>{
    const cells=row.topBranches.slice(0,5);while(cells.length<5)cells.push(['—','']);
    const branchCols=cells.map(([b,n])=>`<td style="font-size:0.78rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b}</td><td style="font-weight:700;color:${PALETTE.cyan};text-align:right">${n||''}</td>`).join('');
    return `<tr><td><strong style="color:${PALETTE.primary}">${i+1}</strong></td><td><span style="background:${PALETTE.primary}22;color:${PALETTE.primary};padding:3px 9px;border-radius:12px;font-size:0.8rem;white-space:nowrap">${row.tag}</span></td><td style="font-weight:700;color:${PALETTE.emerald};text-align:right;font-size:1rem">${row.total}</td>${branchCols}</tr>`;
  }).join('');
}

// ===== DRAWDOWN SECTION =====
// FIX #6: Get issue count / rows / tag rows untuk DD branch — pakai canonBranch
function getIssueCountForDDBranch(ddBranchName){
  const canon=canonBranch(ddBranchName);
  return filteredData.filter(r=>canonBranch(branchField(r))===canon).length;
}
function getIssueRowsForDDBranch(ddBranchName){
  const canon=canonBranch(ddBranchName);
  return filteredData.filter(r=>canonBranch(branchField(r))===canon);
}
function getTagRowsForDDBranch(ddBranchName){
  const canon=canonBranch(ddBranchName);
  return filteredTagData.filter(r=>canonBranch(r['Branch Name']||r['Branch']||'')===canon);
}

function renderDrawdownSection(){
  const drawdowns=filteredDDData.filter(r=>r.Status==='MUF-Drawdown');
  if(filteredDDData.length===0)return;
  document.getElementById('ddTotal').textContent=drawdowns.length.toLocaleString();
  const branches=new Set(drawdowns.map(r=>r['Branch Name']).filter(Boolean));
  document.getElementById('ddBranches').textContent=branches.size;
  const totalIssue=filteredData.length;
  const globalRatio=drawdowns.length>0?(totalIssue/drawdowns.length).toFixed(3):'-';
  document.getElementById('ddRatio').textContent=globalRatio;
  const branchDD={};
  drawdowns.forEach(r=>{const b=(r['Branch Name']||'Unknown').trim();branchDD[b]=(branchDD[b]||0)+1;});
  const topBranch=Object.entries(branchDD).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('ddTopBranch').textContent=topBranch?topBranch[0]:'-';
  renderDDVsIssueChart(branchDD);
  renderDDMonthChart();
  renderDDStatusChart();
  renderDDTable(branchDD);       // FIX #4 #5
  renderDDBestBranchChart(branchDD); // FIX #6
}

function renderDDVsIssueChart(branchDD){
  const top20=Object.entries(branchDD).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const labels=top20.map(x=>x[0]);
  const ddCounts=top20.map(x=>x[1]);
  const issueCounts=labels.map(b=>getIssueCountForDDBranch(b));
  destroyChart('ddVsIssue');
  charts.ddVsIssue=new Chart(document.getElementById('ddVsIssueChart').getContext('2d'),{type:'bar',
    data:{labels,datasets:[
      {label:'MUF-Drawdown',data:ddCounts,backgroundColor:PALETTE.emerald+'99',borderColor:PALETTE.emerald,borderWidth:2,borderRadius:4},
      {label:'Issue/Tiket',data:issueCounts,backgroundColor:PALETTE.rose+'99',borderColor:PALETTE.rose,borderWidth:2,borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{position:'top'},
        tooltip:{backgroundColor:'#1e293b',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,titleColor:'#f1f5f9',bodyColor:'#94a3b8'}
      },
      scales:{x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});
}

function renderDDMonthChart(){
  const periodMap={};
  filteredDDData.forEach(r=>{const d=parseDDDate(r['Submit Date']);if(!d)return;if(!periodMap[d.sortKey])periodMap[d.sortKey]={label:d.label,sortKey:d.sortKey};});
  const periods=Object.values(periodMap).sort((a,b)=>a.sortKey.localeCompare(b.sortKey));
  const labels=periods.map(p=>p.label);
  const ddByPeriod=periods.map(p=>filteredDDData.filter(r=>{const d=parseDDDate(r['Submit Date']);return d&&d.sortKey===p.sortKey&&r.Status==='MUF-Drawdown';}).length);
  const totalByPeriod=periods.map(p=>filteredDDData.filter(r=>{const d=parseDDDate(r['Submit Date']);return d&&d.sortKey===p.sortKey;}).length);
  destroyChart('ddMonth');
  charts.ddMonth=new Chart(document.getElementById('ddMonthChart').getContext('2d'),{type:'bar',
    data:{labels,datasets:[
      {label:'Total Aplikasi',data:totalByPeriod,backgroundColor:PALETTE.primary+'55',borderColor:PALETTE.primary,borderWidth:2,borderRadius:6,order:2},
      {label:'MUF-Drawdown',data:ddByPeriod,type:'line',borderColor:PALETTE.emerald,backgroundColor:PALETTE.emerald+'30',tension:0.4,fill:true,pointRadius:5,borderWidth:2.5,order:1}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'top'},tooltip:{callbacks:{afterBody(items){const idx=items[0].dataIndex;const dd=ddByPeriod[idx];const tot=totalByPeriod[idx];const ratio=tot>0?(dd/tot*100).toFixed(1):'0';return[`Rasio DD: ${ratio}% (${dd}/${tot})`];}}}},
      scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}}}});
}
function renderDDStatusChart(){
  const counts=countBy(filteredDDData.filter(r=>r.Status),'Status');
  const entries=topN(counts,12);
  destroyChart('ddStatus');
  charts.ddStatus=new Chart(document.getElementById('ddStatusChart').getContext('2d'),{type:'doughnut',
    data:{labels:entries.map(x=>x[0]),datasets:[{data:entries.map(x=>x[1]),backgroundColor:MULTI.slice(0,entries.length).map(c=>c+'cc'),borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:10}}}}}});
}

// FIX #4: Rasio format "1 DD : X issue" (2 desimal)
// FIX #5: Tambahkan kolom Issue Terbesar & Tag Terbanyak
function renderDDTable(branchDD){
  const top20=Object.entries(branchDD).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const tableData=top20.map(([branch,ddCount],i)=>{
    const issueRows=getIssueRowsForDDBranch(branch);
    const issueCount=issueRows.length;
    // FIX #4: rasio = issue/dd, format "1 : X.XX"
    const ratioNum=ddCount>0?issueCount/ddCount:0;
    const ratioStr=`1 : ${ratioNum.toFixed(2)}`;
    // FIX #5: Top category
    const catCount=countBy(issueRows,'Category');
    const topCat=topN(catCount,1)[0];
    const topCatStr=topCat?`${topCat[0]} (${topCat[1]})`:'—';
    // FIX #5: Top tag
    const tagRows=getTagRowsForDDBranch(branch);
    const tagCount=countBy(tagRows.filter(r=>r.Tag&&r.Tag.trim()!==''),'Tag');
    const topTag=topN(tagCount,1)[0];
    const topTagStr=topTag?`${topTag[0]} (${topTag[1]})`:'—';
    return{rank:i+1,branch,ddCount,issueCount,ratioStr,ratioNum,topCatStr,topTagStr};
  });
  window._ddTableData=tableData;
  document.getElementById('ddTableBody').innerHTML=tableData.map(row=>{
    const cls=row.ratioNum>0.3?'sla-bad':row.ratioNum>0.1?'sla-warn':'sla-good';
    return`<tr>
      <td><strong style="color:${PALETTE.primary}">#${row.rank}</strong></td>
      <td><strong>${row.branch}</strong></td>
      <td><span style="color:${PALETTE.emerald};font-weight:700">${row.ddCount}</span></td>
      <td><span style="color:${PALETTE.rose};font-weight:700">${row.issueCount}</span></td>
      <td><span class="${cls}" style="white-space:nowrap">${row.ratioStr}</span></td>
      <td style="font-size:0.78rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${row.topCatStr}">${row.topCatStr}</td>
      <td style="font-size:0.78rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${row.topTagStr}">${row.topTagStr}</td>
    </tr>`;
  }).join('');
}

// ── helpers stars ─────────────────────────────────────────────────────
function _ddStars(ratio){
  if(ratio===0||ratio<0.02)return 5;
  if(ratio<0.05)return 4;
  if(ratio<0.10)return 3;
  if(ratio<0.20)return 2;
  return 1;
}
function _ddStarHtml(stars,row){
  const starColors=['#f43f5e','#f59e0b','#f59e0b','#10b981','#10b981'];
  const filled='★'.repeat(stars)+'☆'.repeat(5-stars);
  const color=starColors[stars-1]||'#94a3b8';
  const pct=(row.ratio*100).toFixed(1);
  const tip=`${row.branch}\nDD: ${row.ddCount}  |  Issue: ${row.issueCount}\nRasio: ${pct}%`;
  return `<span class="star-tip" data-tip="${tip}" style="color:${color};font-size:1rem;letter-spacing:1px">${filled}</span>`;
}

// FIX #6 FINAL: Best branch — canonBranch aggregasi, label %, tooltip solid, tabel compact
function renderDDBestBranchChart(branchDD){
  // Aggregasi issue per canonical name (gabungkan varian nama)
  const canonIssueCounts={};
  const canonDisplayName={};
  filteredData.forEach(r=>{
    const raw=branchField(r); if(!raw)return;
    const c=canonBranch(raw);
    if(!canonDisplayName[c])canonDisplayName[c]=raw;
    canonIssueCounts[c]=(canonIssueCounts[c]||0)+1;
  });

  // Aggregasi DD per canonical name
  const canonDDCounts={};
  Object.entries(branchDD).forEach(([ddBr,cnt])=>{
    const c=canonBranch(ddBr);
    if(c) canonDDCounts[c]=(canonDDCounts[c]||0)+cnt;
  });

  // Gabungkan — hanya cabang yang ada DD-nya
  const allBranchData=Object.entries(canonIssueCounts).map(([c,issueCount])=>{
    const ddCount=canonDDCounts[c]||0;
    if(ddCount===0)return null;
    const ratio=issueCount/ddCount;
    return{branch:canonDisplayName[c]||c,ddCount,issueCount,ratio};
  }).filter(Boolean);

  // Sort: rasio terkecil dulu; sama → DD terbanyak
  const best20=allBranchData.sort((a,b)=>a.ratio!==b.ratio?a.ratio-b.ratio:b.ddCount-a.ddCount).slice(0,20);

  // Plugin: label % di kanan bar terpanjang
  const ratioLabelPlugin={
    id:'ddBestRatioLabel',
    afterDraw(chart){
      const ctx=chart.ctx, xScale=chart.scales.x;
      best20.forEach((row,i)=>{
        const xPx=xScale.getPixelForValue(Math.max(row.ddCount,row.issueCount));
        const meta=chart.getDatasetMeta(0); if(!meta.data[i])return;
        const yPx=meta.data[i].y;
        const rn=row.ratio;
        const color=rn===0||rn<0.05?'#10b981':rn<0.15?'#f59e0b':'#f43f5e';
        const pct=(rn*100).toFixed(1)+'%';
        ctx.save();
        ctx.font='bold 10px Inter,sans-serif';
        ctx.fillStyle=color;
        ctx.textAlign='left';
        ctx.textBaseline='middle';
        ctx.fillText(pct, xPx+7, yPx);
        ctx.restore();
      });
    }
  };

  destroyChart('ddBestBranch');
  charts.ddBestBranch=new Chart(document.getElementById('ddBestBranchChart').getContext('2d'),{
    type:'bar',
    plugins:[ratioLabelPlugin],
    data:{labels:best20.map(x=>x.branch),datasets:[
      {label:'MUF-Drawdown',data:best20.map(x=>x.ddCount),backgroundColor:PALETTE.emerald+'99',borderColor:PALETTE.emerald,borderWidth:2,borderRadius:4},
      {label:'Issue/Tiket',data:best20.map(x=>x.issueCount),backgroundColor:PALETTE.rose+'99',borderColor:PALETTE.rose,borderWidth:2,borderRadius:4}
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,indexAxis:'y',
      layout:{padding:{right:68}},
      plugins:{
        legend:{position:'top'},
        tooltip:{
          backgroundColor:'#1e293b',
          borderColor:'rgba(255,255,255,0.15)',
          borderWidth:1,
          padding:10,
          titleColor:'#f1f5f9',
          bodyColor:'#94a3b8',
          callbacks:{
            afterBody(items){
              const idx=items[0].dataIndex; const row=best20[idx];
              const pct=(row.ratio*100).toFixed(1);
              return[`Rasio: ${pct}%  (${row.issueCount} issue / ${row.ddCount} DD)`];
            }
          }
        }
      },
      scales:{
        x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},
        y:{grid:{display:false},ticks:{font:{size:10}}}
      }
    }
  });

  // Tabel compact: #, Cabang, Rasio%, Stars
  const medals=['🥇','🥈','🥉'];
  document.getElementById('ddBestTableBody').innerHTML=best20.map((row,i)=>{
    const pct=(row.ratio*100).toFixed(1);
    const stars=_ddStars(row.ratio);
    const starHtml=_ddStarHtml(stars,row);
    return`<tr>
      <td style="text-align:center;color:#64748b;font-size:0.78rem">${medals[i]||i+1}</td>
      <td style="font-size:0.78rem;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${row.branch}">${row.branch}</td>
      <td style="text-align:right;font-weight:700;font-size:0.82rem;white-space:nowrap;color:${row.ratio<0.05?'#10b981':row.ratio<0.15?'#f59e0b':'#f43f5e'}">${pct}%</td>
      <td style="text-align:center">${starHtml}</td>
    </tr>`;
  }).join('');
}

document.getElementById('exportDDCSV').addEventListener('click',()=>exportDDTable('csv'));
document.getElementById('exportDDXLSX').addEventListener('click',()=>exportDDTable('xlsx'));
function exportDDTable(format){
  // FIX #2: Export DD table data sesuai filter aktif
  const data=(window._ddTableData||[]).map(row=>({'Rank':row.rank,'Cabang':row.branch,'Total Drawdown':row.ddCount,'Total Issue':row.issueCount,'Rasio Issue':row.ratioStr,'Issue Terbesar':row.topCatStr,'Tag Terbanyak':row.topTagStr}));
  if(format==='csv')exportCSV(data,'drawdown-vs-issue.csv');
  else exportXLSX(data,'drawdown-vs-issue.xlsx');
}

// ===== MAP SECTION (FIX #8) =====
// Koordinat cabang-cabang MUF Indonesia (lat, lng)
const BRANCH_COORDS = {
  // Jawa
  'JAKARTA': [-6.2088, 106.8456], 'JAKARTA BARAT': [-6.1535, 106.7331], 'JAKARTA TIMUR': [-6.2251, 106.9004],
  'JAKARTA SELATAN': [-6.2615, 106.8106], 'JAKARTA UTARA': [-6.1381, 106.8602], 'JAKARTA PUSAT': [-6.1862, 106.8346],
  'BEKASI': [-6.2383, 106.9756], 'DEPOK': [-6.4025, 106.7942], 'BOGOR': [-6.5971, 106.8060],
  'TANGERANG': [-6.1702, 106.6400], 'TANGERANG SELATAN': [-6.2885, 106.7093],
  'BANDUNG': [-6.9175, 107.6191], 'BANDUNG BARAT': [-6.8411, 107.5075], 'CIMAHI': [-6.8722, 107.5414],
  'CIREBON': [-6.7320, 108.5523], 'SUKABUMI': [-6.9220, 106.9300], 'KARAWANG': [-6.3214, 107.3378],
  'PURWAKARTA': [-6.5566, 107.4378], 'SUBANG': [-6.5747, 107.7594], 'GARUT': [-7.2133, 107.9083],
  'TASIKMALAYA': [-7.3274, 108.2207], 'CIAMIS': [-7.3318, 108.3545],
  'SEMARANG': [-6.9932, 110.4203], 'SOLO': [-7.5755, 110.8243], 'SURAKARTA': [-7.5755, 110.8243],
  'YOGYAKARTA': [-7.7972, 110.3688], 'MAGELANG': [-7.4797, 110.2177], 'PURWOKERTO': [-7.4244, 109.2365],
  'TEGAL': [-6.8694, 109.1402], 'PEKALONGAN': [-6.8886, 109.6753], 'KUDUS': [-6.8040, 110.8360],
  'JEPARA': [-6.5893, 110.6686], 'DEMAK': [-6.8936, 110.6386], 'SALATIGA': [-7.3306, 110.5084],
  'SURABAYA': [-7.2575, 112.7521], 'MALANG': [-7.9797, 112.6304], 'SIDOARJO': [-7.4500, 112.7180],
  'GRESIK': [-7.1560, 112.6522], 'MOJOKERTO': [-7.4720, 112.4337], 'PASURUAN': [-7.6453, 112.9076],
  'KEDIRI': [-7.8480, 111.9698], 'MADIUN': [-7.6298, 111.5239], 'BLITAR': [-8.0954, 112.1609],
  'JEMBER': [-8.1724, 113.7025], 'BANYUWANGI': [-8.2193, 114.3691], 'JOMBANG': [-7.5455, 112.2384],
  'TUBAN': [-6.8950, 112.0513], 'LAMONGAN': [-7.1172, 112.4157], 'PROBOLINGGO': [-7.7543, 113.2159],
  // Sumatera
  'MEDAN': [3.5952, 98.6722], 'BINJAI': [3.6003, 98.4840], 'LUBUK PAKAM': [3.5408, 98.8674],
  'PEMATANG SIANTAR': [2.9595, 99.0687], 'TEBING TINGGI': [3.3274, 99.1622], 'RANTAU PRAPAT': [2.0988, 99.8304],
  'PADANG': [-0.9492, 100.3543], 'BUKITTINGGI': [-0.3054, 100.3694], 'PAYAKUMBUH': [-0.2265, 100.6384],
  'PEKANBARU': [0.5071, 101.4478], 'DUMAI': [1.6833, 101.4502], 'BANGKINANG': [0.3478, 100.9963],
  'BATAM': [1.0456, 104.0305], 'TANJUNG PINANG': [0.9120, 104.4455],
  'PALEMBANG': [-2.9761, 104.7754], 'LUBUKLINGGAU': [-3.3003, 102.8600], 'PRABUMULIH': [-3.4274, 104.2418],
  'BENGKULU': [-3.7928, 102.2608], 'JAMBI': [-1.6101, 103.6131],
  'BANDAR LAMPUNG': [-5.4292, 105.2618], 'METRO': [-5.1133, 105.3069], 'KOTABUMI': [-4.8257, 104.8938],
  'BANDA ACEH': [5.5483, 95.3238], 'LHOKSEUMAWE': [5.1801, 97.1500], 'LANGSA': [4.4683, 97.9700],
  // Kalimantan
  'BALIKPAPAN': [-1.2379, 116.8529], 'SAMARINDA': [-0.4948, 117.1436], 'BONTANG': [0.1322, 117.4988],
  'BANJARMASIN': [-3.3194, 114.5908], 'BANJARBARU': [-3.4426, 114.8317],
  'PONTIANAK': [-0.0263, 109.3425], 'SINGKAWANG': [0.9000, 108.9833],
  'PALANGKARAYA': [-2.2161, 113.9135],
  // Sulawesi
  'MAKASSAR': [-5.1477, 119.4327], 'GOWA': [-5.2876, 119.4312], 'MAROS': [-4.9916, 119.5792],
  'MANADO': [1.4748, 124.8421], 'BITUNG': [1.4404, 125.1905],
  'PALU': [-0.8917, 119.8707], 'KENDARI': [-3.9985, 122.5127], 'GORONTALO': [0.5500, 123.0640],
  // Bali & NTB & NTT
  'DENPASAR': [-8.6705, 115.2126], 'SINGARAJA': [-8.1122, 115.0888], 'GIANYAR': [-8.5362, 115.3314],
  'MATARAM': [-8.5832, 116.1185], 'SUMBAWA BESAR': [-8.4901, 117.4168],
  'KUPANG': [-10.1772, 123.6070],
  // Maluku & Papua
  'AMBON': [-3.6553, 128.1908], 'TERNATE': [0.7917, 127.3850],
  'JAYAPURA': [-2.5338, 140.7181], 'SORONG': [-0.8762, 131.2558], 'MANOKWARI': [-0.8615, 134.0623],
};

function findBranchCoords(branchName) {
  const nb = normBranch(branchName);
  if (BRANCH_COORDS[nb]) return BRANCH_COORDS[nb];
  // partial match
  const key = Object.keys(BRANCH_COORDS).find(k => nb.includes(k) || k.includes(nb));
  return key ? BRANCH_COORDS[key] : null;
}

let mapInstance = null;
let mapMarkers = [];
let mapCircles = [];
let mapInitialized = false;

function renderMapSection() {
  if (!document.getElementById('section-map').classList.contains('active')) return;
  setTimeout(() => {
    initLeafletMap();
    updateMapMarkers();
  }, 100);
}

function initLeafletMap() {
  if (mapInitialized) return;
  mapInitialized = true;

  // Dynamically load Leaflet if not already loaded
  if (!window.L) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { _buildMap(); updateMapMarkers(); };
    document.head.appendChild(script);
  } else {
    _buildMap();
  }
}

function _buildMap() {
  const container = document.getElementById('mapContainer');
  if (!container || mapInstance) return;
  mapInstance = L.map('mapContainer', { zoomControl: true, scrollWheelZoom: true }).setView([-2.5, 117.5], 5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19
  }).addTo(mapInstance);

  // FIX #8: Garis zona waktu WIB/WITA/WIT (putus-putus)
  const wibWitaBoundary = [[6,115],[-11,115]];
  const witaWitBoundary = [[6,120],[-11,120]];
  L.polyline(wibWitaBoundary, {color:'#94a3b8',weight:1.5,dashArray:'8,6',opacity:0.6}).addTo(mapInstance)
    .bindTooltip('WIB | WITA',{permanent:false,direction:'center',className:'tz-tooltip'});
  L.polyline(witaWitBoundary, {color:'#94a3b8',weight:1.5,dashArray:'8,6',opacity:0.6}).addTo(mapInstance)
    .bindTooltip('WITA | WIT',{permanent:false,direction:'center',className:'tz-tooltip'});
  // Labels
  L.marker([-0.5,108],{icon:L.divIcon({className:'tz-label',html:'<span>WIB</span>',iconSize:[40,20]})}).addTo(mapInstance);
  L.marker([-0.5,117.5],{icon:L.divIcon({className:'tz-label',html:'<span>WITA</span>',iconSize:[40,20]})}).addTo(mapInstance);
  L.marker([-0.5,127],{icon:L.divIcon({className:'tz-label',html:'<span>WIT</span>',iconSize:[40,20]})}).addTo(mapInstance);
}

function updateMapMarkers() {
  if (!window.L || !mapInstance) return;

  // Clear existing
  mapMarkers.forEach(m => m.remove());
  mapCircles.forEach(c => c.remove());
  mapMarkers = []; mapCircles = [];

  // Build data per branch (using filteredData)
  const drawdowns = filteredDDData.filter(r => r.Status === 'MUF-Drawdown');
  const branchDD = {};
  drawdowns.forEach(r => { const b = (r['Branch Name'] || '').trim(); if (b) branchDD[b] = (branchDD[b] || 0) + 1; });
  const totalDDData = {};
  filteredDDData.forEach(r => { const b = (r['Branch Name'] || '').trim(); if (b) totalDDData[b] = (totalDDData[b] || 0) + 1; });

  const issueCounts = countBy(filteredData.map(r => ({ ...r, _bn: branchField(r) })), '_bn');
  const top20IssueNames = topN(issueCounts, 20).map(x => x[0]);

  // All unique branches from Data_Source
  const allBranches = [...new Set(filteredData.map(r => branchField(r)).filter(Boolean))];

  allBranches.forEach(bName => {
    const coords = findBranchCoords(bName);
    if (!coords) return;

    const issueCount = issueCounts[bName] || 0;
    const ddCount = branchDD[bName] || 0;
    const totalTxn = totalDDData[bName] || 0;
    const isTop20 = top20IssueNames.includes(bName);

    // FIX #8: Red haze circle for top 20 issue branches
    if (isTop20) {
      const rank = top20IssueNames.indexOf(bName);
      const radius = Math.max(15000, Math.min(50000, issueCount * 2000));
      const opacity = 0.12 + (1 - rank / 20) * 0.1;
      const circle = L.circle(coords, {
        radius, color: '#f43f5e', fillColor: '#f43f5e',
        fillOpacity: opacity, weight: 1, opacity: 0.4
      }).addTo(mapInstance);
      mapCircles.push(circle);
    }

    // Dot marker
    const dotSize = Math.max(8, Math.min(22, 8 + issueCount / 8));
    const dotColor = issueCount > 50 ? '#f43f5e' : issueCount > 20 ? '#f59e0b' : '#10b981';
    const icon = L.divIcon({
      className: '', iconSize: [dotSize, dotSize], iconAnchor: [dotSize / 2, dotSize / 2],
      html: `<div style="width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${dotColor};border:2px solid rgba(255,255,255,0.6);box-shadow:0 0 6px ${dotColor}88;cursor:pointer"></div>`
    });
    const marker = L.marker(coords, { icon }).addTo(mapInstance);
    const tooltipHtml = `<div class="map-tooltip"><strong>${bName}</strong><hr style="margin:4px 0;border-color:rgba(255,255,255,0.1)"><span>💰 DD: <b>${ddCount}</b></span><br><span>📊 Transaksi: <b>${totalTxn}</b></span><br><span>🐞 Issue: <b>${issueCount}</b></span></div>`;
    marker.bindTooltip(tooltipHtml, { className: 'map-tooltip-wrap', direction: 'top', offset: [0, -dotSize / 2] });
    marker.on('click', () => showMapBranchDetail(bName, ddCount, totalTxn, issueCount));
    mapMarkers.push(marker);
  });
}

function showMapBranchDetail(bName, ddCount, totalTxn, issueCount) {
  const detailEl = document.getElementById('mapBranchDetail');
  if (!detailEl) return;
  detailEl.style.display = 'block';

  const issueRows = filteredData.filter(r => normBranch(branchField(r)) === normBranch(bName));
  const catCounts = countBy(issueRows, 'Category');
  const top20cats = topN(catCounts, 20);

  const tagRows = filteredTagData.filter(r => normBranch(r['Branch Name'] || r['Branch'] || '') === normBranch(bName));
  const tagCounts2 = countBy(tagRows.filter(r => r.Tag && r.Tag.trim() !== ''), 'Tag');
  const top20tags = topN(tagCounts2, 20);

  document.getElementById('mapDetailTitle').textContent = bName;
  document.getElementById('mapDetailDD').textContent = ddCount;
  document.getElementById('mapDetailTxn').textContent = totalTxn;
  document.getElementById('mapDetailIssue').textContent = issueCount;

  document.getElementById('mapDetailCatBody').innerHTML = top20cats.length
    ? top20cats.map(([c, n], i) => `<tr><td>${i + 1}</td><td>${c}</td><td><strong style="color:${PALETTE.rose}">${n}</strong></td></tr>`).join('')
    : '<tr><td colspan="3" style="color:#94a3b8;text-align:center">Tidak ada data</td></tr>';

  document.getElementById('mapDetailTagBody').innerHTML = top20tags.length
    ? top20tags.map(([t, n], i) => `<tr><td>${i + 1}</td><td><span style="background:${PALETTE.primary}22;color:${PALETTE.primary};padding:2px 8px;border-radius:12px;font-size:0.78rem">${t}</span></td><td><strong style="color:${PALETTE.cyan}">${n}</strong></td></tr>`).join('')
    : '<tr><td colspan="3" style="color:#94a3b8;text-align:center">Tidak ada tag</td></tr>';

  detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== EXPORT FUNCTIONS (FIX #2) =====
function exportCSV(data, filename) {
  const rows = data || getExportData();
  if (!rows.length) { alert('Tidak ada data.'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(row => headers.map(h => { const v = String(row[h] || '').replace(/"/g, '""'); return (v.includes(',') || v.includes('"') || v.includes('\n')) ? `"${v}"` : v; }).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename || `mantis-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}
function exportXLSX(data, filename) {
  if (typeof XLSX === 'undefined') { alert('SheetJS belum dimuat.'); return; }
  const rows = data || getExportData();
  if (!rows.length) { alert('Tidak ada data.'); return; }
  const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename || `mantis-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
function exportPDF(data, filename) {
  const jsPDFLib = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFLib) { alert('jsPDF belum dimuat.'); return; }
  const rows = (data || getExportData()).slice(0, 1000);
  if (!rows.length) { alert('Tidak ada data.'); return; }
  const doc = new jsPDFLib({ orientation: 'landscape' });
  const headers = Object.keys(rows[0]);
  doc.setFontSize(13); doc.setTextColor(99, 102, 241);
  doc.text('Mantis Dashboard Report', 14, 14);
  doc.setFontSize(8); doc.setTextColor(148, 163, 184);
  doc.text(`Bulan: ${filterMonth.value || 'Semua'} | Produk: ${filterProduct.value || 'Semua'} | Generated: ${new Date().toLocaleString('id-ID')}`, 14, 21);
  doc.autoTable({ head: [headers], body: rows.map(row => headers.map(h => String(row[h] || ''))), startY: 26, styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 246, 250] }, margin: { left: 10, right: 10 } });
  doc.save(filename || `mantis-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// FIX #2: Export buttons use getExportData() which respects all active filters
document.getElementById('exportCSV').addEventListener('click', () => exportCSV());
document.getElementById('exportXLSX').addEventListener('click', () => exportXLSX());
document.getElementById('exportPDF').addEventListener('click', () => exportPDF());

// ===== DROPDOWN TOGGLE =====
function toggleDrop(id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  // Close all others
  document.querySelectorAll('.ov-dd-panel.open').forEach(p => p.classList.remove('open'));
  if (!isOpen) panel.classList.add('open');
}
// Close dropdowns on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.ov-dd-wrap')) {
    document.querySelectorAll('.ov-dd-panel.open').forEach(p => p.classList.remove('open'));
  }
});

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => { loadData(); });
