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
// Master sheet — diisi dari Master.csv yang di-upload ke GitHub Pages
// ATAU ganti dengan URL publish Google Sheets jika sudah dipublish
const MASTER_CSV_URL= 'https://willissmmf.github.io/SP_Dashboard/Master.csv';

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

// ===== MASTER SHEET =====
let masterData=[];
const masterBranchMap=new Map(); // canonBranch → {gel,implementDate,wilayah,hasSimfast}
let filteredSFData=[];

const ID_MONTHS_MAP={'januari':0,'februari':1,'maret':2,'april':3,'mei':4,'juni':5,'juli':6,'agustus':7,'september':8,'oktober':9,'november':10,'desember':11,'january':0,'february':1,'march':2,'may':4,'june':5,'july':6,'august':7,'october':9,'december':11,'april':3,'september':8,'november':10};

function parseMasterDate(s){
  if(!s||!String(s).trim())return null;
  s=String(s).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1]);
  const parts=s.split(/[\s,]+/);
  if(parts.length>=3){const d=parseInt(parts[0]),mon=ID_MONTHS_MAP[parts[1].toLowerCase()],y=parseInt(parts[2]);if(!isNaN(d)&&mon!==undefined&&!isNaN(y))return new Date(y,mon,d);}
  const d=new Date(s);return isNaN(d.getTime())?null:d;
}

function parseIssueDate(s){
  if(!s)return null;
  if(s instanceof Date)return s;
  let m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  m=String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m)return new Date(+m[3],+m[1]-1,+m[2]);
  const d=new Date(s);return isNaN(d.getTime())?null:d;
}

function processMasterData(rows){
  masterBranchMap.clear();
  rows.forEach(r=>{
    const cab=(r['Cabang']||r['cabang']||'').trim();
    const gel=(r['Gel_SimFast']||r['Gel']||'').toString().trim();
    const impl=parseMasterDate(r['Implement']||r['implement']||'');
    const wil=(r['Wilayah']||r['wilayah']||'').trim();
    const hasSimfast=(r['Has_SimFast']||r['has_simfast']||'0')!=='0';
    if(!cab)return;
    masterBranchMap.set(canonBranch(cab),{branch:cab,gel,implementDate:impl,wilayah:wil,hasSimfast:hasSimfast&&impl!==null});
  });
}

function isSimfastBranch(branchName){
  const info=masterBranchMap.get(canonBranch(branchName));
  return !!(info&&info.hasSimfast);
}

function getMasterInfo(branchName){
  return masterBranchMap.get(canonBranch(branchName))||null;
}

function preprocessSimfastData(){
  const masterLoaded=masterBranchMap.size>0;
  allData.forEach(r=>{
    const prod=r['Product Source']||'';
    if(prod!=='SimFast'&&prod!=='Simascore'){r._sfActive=false;return;}
    if(!masterLoaded){
      // Fallback: tampilkan semua SimFast/Simascore tanpa filter implement date
      r._sfActive=true; r._sfGel='?'; r._sfWilayah='';
      return;
    }
    const issueDate=parseIssueDate(r['Date Submitted']);
    if(!issueDate){r._sfActive=false;return;}
    const info=getMasterInfo(branchField(r));
    if(!info||!info.implementDate){
      // Branch ada di data tapi tidak ada di master → tampilkan saja
      r._sfActive=true; r._sfGel='?'; r._sfWilayah='';
      return;
    }
    r._sfActive=issueDate>=info.implementDate;
    r._sfGel=info.gel;
    r._sfWilayah=info.wilayah;
  });
}

function _rebuildBranchForProduct(){
  // Always show ALL branches — Gel filter handles SimFast-specific filtering
  const allBranches=[...new Set(allData.map(r=>branchField(r)).filter(Boolean))].sort();
  filterState.branches=[];
  _buildBranchChecklist(allBranches,'');
}

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
Chart.defaults.plugins.tooltip.backgroundColor = '#1e293b';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.15)';
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
// Global filter state (multi-month, branch)
const filterState={ months:[], branches:[] };

// ===== HELPERS (early, needed by filters) =====
function getRowYear(r){
  const ds=r['Date Submitted']||r['date_submitted']||'';
  const m=ds.match(/\b(20\d{2})\b/); return m?m[1]:'';
}
function getRowMonthKey(r){
  // Key used for filtering & grouping: "2025 January" or just "January"
  const yr=getRowYear(r); return yr?`${yr} ${r.Month}`:r.Month||'';
}

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

// Filter listeners
filterProduct.addEventListener('change', applyGlobalFilters);

// ===== NAVIGATION =====
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.section);
    sidebarEl.classList.remove('mobile-open');
  });
});

const SECTION_ICONS = { overview:'📊', simfast:'🚀', tickets:'🎫', sla:'⏱️', branch:'🗺️', tags:'🏷️', drawdown:'💰', map:'🌍' };
const SECTION_TITLES = { overview:'Overview', simfast:'Overview SimFast', tickets:'Daftar Tiket', sla:'Analisis SLA', branch:'Analisis Cabang', tags:'Analisis Tag', drawdown:'Analisis Drawdown', map:'Peta Cabang (Experiment)' };

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
  if (section==='simfast') renderOverviewSimfast();
}

// ===== FILTER POPULATE =====
function populateFilters(){
  // Product dropdown (unchanged)
  const products=[...new Set(allData.map(r=>r['Product Source']).filter(Boolean))].sort();
  filterProduct.innerHTML='<option value="">Semua Produk</option>'+products.map(p=>`<option value="${p}">${p}</option>`).join('');

  // Month checklist (year+month labels, sorted chronologically)
  const monthKeySet=new Set();
  allData.forEach(r=>{ const k=getRowMonthKey(r); if(k) monthKeySet.add(k); });
  const allMonthKeys=[...monthKeySet].sort((a,b)=>{
    const parse=s=>{const p=s.split(' ');const yr=p.length>1?parseInt(p[0]):9999;const mo=MONTH_ORDER.indexOf(p[p.length-1]);return yr*100+mo;};
    return parse(a)-parse(b);
  });
  _buildMonthChecklist(allMonthKeys);

  // Branch dropdown
  const allBranches=[...new Set(allData.map(r=>branchField(r)).filter(Boolean))].sort();
  _buildBranchChecklist(allBranches, '');

  // Gel filter (setelah master data tersedia)
  _buildGelFilter();
}

function _buildMonthChecklist(allMonthKeys){
  const panel=document.getElementById('filterMonthPanel'); if(!panel)return;
  panel.innerHTML=`<div class="ov-dd-scroll" style="max-height:300px">
    <label class="ov-cb-row" style="border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;padding-bottom:6px">
      <input type="checkbox" id="fmAllCb" checked> <span style="font-weight:700">Semua Bulan</span>
    </label>`+
    allMonthKeys.map(k=>`<label class="ov-cb-row">
      <input type="checkbox" class="fmCb" value="${k}" checked>
      <span>${k}</span>
    </label>`).join('')+`</div>`;

  document.getElementById('fmAllCb').onchange=function(){
    if(this.checked){
      // Klik "Semua Bulan" ON → pilih semua, clear filter
      filterState.months=[];
      document.querySelectorAll('.fmCb').forEach(cb=>cb.checked=true);
    } else {
      // Klik "Semua Bulan" OFF → uncheck semua individual
      filterState.months=[];
      document.querySelectorAll('.fmCb').forEach(cb=>cb.checked=false);
    }
    _updateMonthLabel(allMonthKeys); applyGlobalFilters();
  };
  document.querySelectorAll('.fmCb').forEach(cb=>{
    cb.onchange=()=>{
      const checked=Array.from(document.querySelectorAll('.fmCb:checked')).map(x=>x.value);
      if(checked.length===0){
        // Tidak ada yg dipilih → reset ke semua
        filterState.months=[];
        document.querySelectorAll('.fmCb').forEach(c=>c.checked=true);
        const allCb=document.getElementById('fmAllCb'); if(allCb)allCb.checked=true;
      } else {
        // Ada yg dipilih — simpan, JANGAN auto-check "Semua Bulan"
        filterState.months=checked.length===allMonthKeys.length?[]:checked;
        // "Semua Bulan" checkbox: tidak diubah otomatis
      }
      _updateMonthLabel(allMonthKeys); applyGlobalFilters();
    };
  });
  _updateMonthLabel(allMonthKeys);
}

function _updateMonthLabel(allMonthKeys){
  const lbl=document.getElementById('filterMonthLabel'); if(!lbl)return;
  const n=filterState.months.length;
  lbl.textContent=n===0||n===allMonthKeys.length?'Semua Bulan':n===1?filterState.months[0]:`${n} Bulan Dipilih`;
}

function _buildBranchChecklist(allBranches, search){
  const list=document.getElementById('filterBranchList'); if(!list)return;
  const filtered=search?allBranches.filter(b=>b.toLowerCase().includes(search.toLowerCase())):allBranches;
  const selAll=filterState.branches.length===0;
  list.innerHTML=`<label class="ov-cb-row" style="border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:4px">
      <input type="checkbox" id="fbAllCb" ${selAll?'checked':''}> <span style="font-weight:600">Semua Cabang</span>
    </label>`+
    filtered.map(b=>`<label class="ov-cb-row">
      <input type="checkbox" class="fbCb" value="${b}" ${filterState.branches.length===0||filterState.branches.includes(b)?'checked':''}>
      <span style="font-size:0.78rem">${b.length>36?b.slice(0,34)+'…':b}</span>
    </label>`).join('');
  document.getElementById('fbAllCb').onchange=function(){
    filterState.branches=[];
    document.querySelectorAll('.fbCb').forEach(cb=>cb.checked=this.checked);
    _updateBranchLabel(); applyGlobalFilters();
  };
  document.querySelectorAll('.fbCb').forEach(cb=>{
    cb.onchange=()=>{
      filterState.branches=Array.from(document.querySelectorAll('.fbCb:checked')).map(x=>x.value);
      const allCb=document.getElementById('fbAllCb');
      if(allCb) allCb.checked=filterState.branches.length===allBranches.length;
      _updateBranchLabel(); applyGlobalFilters();
    };
  });
  _updateBranchLabel();
}

function _updateBranchLabel(){
  const lbl=document.getElementById('filterBranchLabel'); if(!lbl)return;
  const n=filterState.branches.length;
  lbl.textContent=n===0?'Semua Cabang':n===1?filterState.branches[0].split(' ').slice(-1)[0]:`${n} Cabang`;
}

// Exposed globally for branch search input
function filterBranchDropdown(val){
  const allBranches=[...new Set(allData.map(r=>branchField(r)).filter(Boolean))].sort();
  _buildBranchChecklist(allBranches, val);
}

// ── GEL FILTER ────────────────────────────────────────────────────────
let filterState_gels = []; // [] = semua gel

function _buildGelFilter(){
  const panel=document.getElementById('filterGelPanel');if(!panel)return;
  const gels=[...new Set([...masterBranchMap.values()]
    .filter(m=>m.hasSimfast&&m.gel!=='').map(m=>String(m.gel)))]
    .sort((a,b)=>+a-+b);

  if(!gels.length){
    panel.innerHTML='<div style="padding:10px 12px;color:#64748b;font-size:0.78rem">Master belum dimuat</div>';
    return;
  }

  panel.innerHTML=`<div class="ov-dd-scroll" style="max-height:280px">
    <div style="padding:8px 12px 4px;font-size:0.72rem;color:#64748b;font-weight:600;letter-spacing:0.04em">PILIH GELOMBANG</div>
    <label class="ov-cb-row" style="border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px">
      <input type="checkbox" id="gelAllCb" ${filterState_gels.length===0?'checked':''}><span style="font-weight:600">Semua Gel</span>
    </label>
    ${gels.map(g=>`<label class="ov-cb-row">
      <input type="checkbox" class="gelCb" value="${g}" ${filterState_gels.includes(g)?'checked':''}>
      <span>Gel ${g}</span>
    </label>`).join('')}
  </div>`;

  // ALL checkbox
  document.getElementById('gelAllCb').onchange=function(){
    if(this.checked){
      filterState_gels=[];
      document.querySelectorAll('.gelCb').forEach(cb=>cb.checked=true);
    } else {
      filterState_gels=[];
      document.querySelectorAll('.gelCb').forEach(cb=>cb.checked=false);
    }
    _applyGelFilter();
  };

  // Individual gel checkboxes
  document.querySelectorAll('.gelCb').forEach(cb=>{
    cb.onchange=()=>{
      const checked=Array.from(document.querySelectorAll('.gelCb:checked')).map(x=>x.value);
      filterState_gels=checked.length===gels.length?[]:checked;
      const allCb=document.getElementById('gelAllCb');
      if(allCb)allCb.checked=filterState_gels.length===0;
      _applyGelFilter();
    };
  });

  _updateGelLabel();
}

function _updateGelLabel(){
  const lbl=document.getElementById('filterGelLabel');if(!lbl)return;
  lbl.textContent=filterState_gels.length===0?'Semua Gel':
    filterState_gels.length===1?`Gel ${filterState_gels[0]}`:
    `${filterState_gels.length} Gel`;
}

function _applyGelFilter(){
  _updateGelLabel();
  const allBranches=[...new Set(allData.map(r=>branchField(r)).filter(Boolean))].sort();
  if(filterState_gels.length===0){
    // Reset branch filter
    filterState.branches=[];
    _buildBranchChecklist(allBranches,'');
  } else {
    // Gabungkan cabang dari semua gel yang dipilih
    const gelBranchCanons=new Set(
      [...masterBranchMap.values()]
        .filter(m=>filterState_gels.includes(String(m.gel))&&m.hasSimfast)
        .map(m=>canonBranch(m.branch))
    );
    const matched=allBranches.filter(b=>gelBranchCanons.has(canonBranch(b)));
    filterState.branches=matched;
    _buildBranchChecklist(allBranches,'');
    // Sync checkboxes
    document.querySelectorAll('.fbCb').forEach(cb=>{
      cb.checked=filterState.branches.includes(cb.value);
    });
    const allCb=document.getElementById('fbAllCb');
    if(allCb)allCb.checked=false;
    _updateBranchLabel();
  }
  applyGlobalFilters();
}

// ===== GLOBAL FILTERS =====
function applyGlobalFilters(){
  const selMonths=filterState.months; // [] = all
  const product=filterProduct.value;
  const selBranches=filterState.branches; // [] = all

  filteredData=allData.filter(r=>{
    if(selMonths.length){const k=getRowMonthKey(r);if(!selMonths.includes(k))return false;}
    if(product&&r['Product Source']!==product)return false;
    if(selBranches.length&&!selBranches.includes(branchField(r)))return false;
    return true;
  });
  filteredTagData=tagData.filter(r=>{
    if(selMonths.length){
      const yr=getRowYear(r);
      const k=yr?`${yr} ${monthNumToName(r.Month_Number)}`:monthNumToName(r.Month_Number);
      if(!selMonths.includes(k))return false;
    }
    if(product&&r['Product Source']!==product)return false;
    return true;
  });
  filteredDDData=ddData.filter(r=>{
    if(selMonths.length){
      const d=parseDDDate(r['Submit Date']);
      if(!d)return false;
      const k=d.year?`${d.year} ${d.month}`:d.month;
      if(!selMonths.includes(k))return false;
    }
    if(selBranches.length){
      const ddCanon=canonBranch(r['Branch Name']||'');
      if(!selBranches.some(b=>canonBranch(b)===ddCanon))return false;
    }
    return true;
  });
  // SimFast filtered data (date-aware, always SimFast+Simascore)
  filteredSFData=allData.filter(r=>{
    if(!r._sfActive)return false;
    if(selMonths.length){const k=getRowMonthKey(r);if(!selMonths.includes(k))return false;}
    if(selBranches.length&&!selBranches.includes(branchField(r)))return false;
    return true;
  });
  currentPage=1;
  renderAll();
}

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
    const masterFetch=parseCSV(MASTER_CSV_URL,'Master').catch(()=>[]);
    const [main,tags,dd,master]=await Promise.all([
      parseCSV(SHEET_CSV_URL,'Data_Source'),parseCSV(TAG_CSV_URL,'Helper_Tag'),
      parseCSV(DD_CSV_URL,'DD_SimFast'),masterFetch]);
    allData=main.filter(r=>r.Id&&r.Id.trim()!=='');
    tagData=tags.filter(r=>r.Id);
    ddData=dd.filter(r=>(r['Branch Name']||r.Status)&&!isExcludedBranch(r['Branch Name']));
    masterData=master;
    processMasterData(master);
    preprocessSimfastData();
    showLoading(false);
    refreshBtn.classList.remove('spinning');
    lastUpdateEl.textContent='Update: '+new Date().toLocaleTimeString('id-ID');
    document.querySelector('.ds-val').textContent=master.length>0?'4 Sheets ✓':'3 Sheets ✓ (Master: upload Master.csv ke GitHub)';
    populateFilters();
    // Default: SimFast dipilih saat pertama load
    if(!filterProduct.value){
      const sfOpt=Array.from(filterProduct.options).find(o=>o.value==='SimFast');
      if(sfOpt) filterProduct.value='SimFast';
    }
    _rebuildBranchForProduct();
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
  renderOverviewSimfast(); // SimFast section
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
  renderTrendChart(); renderStatusTable(); renderMonthBreakdownTable(); renderCategoryChart(); renderRootCauseChart(); renderProductChart();
}

function renderTrendChart(){
  // Use chronologically ordered months from filteredData
  const monthKeyMap={}; // monthKey → Month (plain name)
  filteredData.forEach(r=>{const k=getRowMonthKey(r);if(k)monthKeyMap[k]=r.Month;});
  const sortedKeys=Object.keys(monthKeyMap).sort((a,b)=>{
    const parse=s=>{const p=s.split(' ');const yr=p.length>1?parseInt(p[0]):9999;const mo=MONTH_ORDER.indexOf(p[p.length-1]);return yr*100+mo;};
    return parse(a)-parse(b);
  });
  const labels=sortedKeys; // display as "2025 January" etc.
  const totalData=sortedKeys.map(k=>filteredData.filter(r=>getRowMonthKey(r)===k).length);
  const mean=totalData.length?totalData.reduce((a,b)=>a+b,0)/totalData.length:0;
  const meanData=totalData.map(()=>parseFloat(mean.toFixed(1)));

  // Plugin: % change label above each bar (vs previous bar)
  const pctPlugin={
    id:'trendPct',
    afterDraw(chart){
      if(totalData.length<2)return;
      const ctx=chart.ctx;
      const meta=chart.getDatasetMeta(0); // bar dataset
      totalData.forEach((val,i)=>{
        if(i===0)return;
        const prev=totalData[i-1]; if(!prev)return;
        const pct=((val-prev)/prev*100).toFixed(1);
        const sign=val>prev?'+':'';
        const color=val>prev?'#f43f5e':val<prev?'#10b981':'#94a3b8';
        const bar=meta.data[i]; if(!bar)return;
        ctx.save();
        ctx.font='bold 10px Inter,sans-serif';
        ctx.fillStyle=color;
        ctx.textAlign='center';
        ctx.textBaseline='bottom';
        ctx.fillText(`${sign}${pct}%`,bar.x,bar.y-3);
        ctx.restore();
      });
    }
  };

  destroyChart('trend');
  charts.trend=new Chart(document.getElementById('trendChart').getContext('2d'),{
    type:'bar',
    plugins:[pctPlugin],
    data:{labels,datasets:[
      {label:'Total Tiket',data:totalData,backgroundColor:PALETTE.primary+'88',borderColor:PALETTE.primary,borderWidth:2,borderRadius:6,order:2},
      {label:`Rata-rata (${mean.toFixed(1)})`,data:meanData,type:'line',borderColor:PALETTE.amber,backgroundColor:'transparent',borderWidth:2,borderDash:[7,4],tension:0,pointRadius:0,order:1}
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{top:28}},
      plugins:{
        legend:{position:'top',labels:{padding:14}},
        tooltip:{
          callbacks:{
            afterBody(items){
              const i=items[0].dataIndex;
              if(i>0&&totalData[i-1]){
                const pct=((totalData[i]-totalData[i-1])/totalData[i-1]*100).toFixed(1);
                const sign=totalData[i]>=totalData[i-1]?'+':'';
                return[`Δ vs bulan lalu: ${sign}${pct}%`];
              }
              return[];
            }
          }
        }
      },
      scales:{
        x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}
      }
    }
  });
}

function renderStatusTable(){
  const entries=topN(countBy(filteredData,'Status'),10);
  const total=filteredData.length;
  const COLOR_MAP={
    resolved:PALETTE.emerald,assigned:PALETTE.primary,acknowledged:PALETTE.amber,
    feedback:PALETTE.cyan,closed:'#64748b',new:PALETTE.rose
  };
  document.getElementById('statusTableBody').innerHTML=entries.map(([status,count])=>{
    const pct=total>0?(count/total*100).toFixed(1):'0.0';
    const barW=total>0?Math.round(count/total*100):0;
    const color=COLOR_MAP[status.toLowerCase()]||PALETTE.orange;
    return`<tr>
      <td style="padding:5px 4px 5px 8px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span></td>
      <td style="padding:5px 8px;text-transform:capitalize;white-space:nowrap">${status}</td>
      <td style="text-align:right;font-weight:700;color:#f1f5f9;padding:5px 8px">${count}</td>
      <td style="padding:5px 8px 5px 4px">
        <div style="display:flex;align-items:center;gap:5px">
          <div style="flex:1;height:5px;background:rgba(255,255,255,0.07);border-radius:3px;min-width:40px">
            <div style="width:${barW}%;height:100%;background:${color};border-radius:3px"></div>
          </div>
          <span style="min-width:34px;text-align:right;color:${color};font-size:0.77rem;font-weight:600">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderMonthBreakdownTable(){
  const el=document.getElementById('monthBreakdownBody'); if(!el)return;
  const monthKeyMap={};
  filteredData.forEach(r=>{const k=getRowMonthKey(r);if(k)monthKeyMap[k]=r.Month;});
  const sortedKeys=Object.keys(monthKeyMap).sort((a,b)=>{
    const parse=s=>{const p=s.split(' ');const yr=p.length>1?parseInt(p[0]):9999;const mo=MONTH_ORDER.indexOf(p[p.length-1]);return yr*100+mo;};
    return parse(a)-parse(b);
  });
  if(!sortedKeys.length){el.innerHTML='<tr><td colspan="4" style="text-align:center;color:#64748b;padding:10px">-</td></tr>';return;}
  const counts=sortedKeys.map(k=>filteredData.filter(r=>getRowMonthKey(r)===k).length);
  const mean=counts.reduce((a,b)=>a+b,0)/counts.length;
  el.innerHTML=sortedKeys.map((k,i)=>{
    const count=counts[i];
    const prev=i>0?counts[i-1]:null;
    let momHtml='<span style="color:#475569">—</span>';
    if(prev!==null&&prev>0){
      const pct=((count-prev)/prev*100).toFixed(1);
      const sign=count>prev?'+':'';
      const c=count>prev?'#f43f5e':count<prev?'#10b981':'#94a3b8';
      momHtml=`<span style="color:${c};font-weight:600;white-space:nowrap">${sign}${pct}%</span>`;
    }
    const avgColor=count>mean?'#f43f5e':'#10b981';
    return`<tr>
      <td style="padding:5px 8px;white-space:nowrap;font-size:0.78rem">${k}</td>
      <td style="text-align:right;font-weight:700;color:#f1f5f9;padding:5px 6px">${count}</td>
      <td style="text-align:right;font-size:0.77rem;color:${avgColor};padding:5px 6px">${mean.toFixed(1)}</td>
      <td style="text-align:right;padding:5px 8px">${momHtml}</td>
    </tr>`;
  }).join('');
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
  if(tableFilter.search){
    const terms=tableFilter.search.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
    if(terms.length) data=data.filter(r=>{
      const vals=Object.values(r).map(v=>String(v).toLowerCase());
      return terms.every(term=>vals.some(v=>v.includes(term)));
    });
  }
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
  tableBodyEl.innerHTML=page.map((r,i)=>{
    const sla=parseFloat(r.SLA);
    const slaClass=isNaN(sla)?'':sla<=1?'sla-good':sla<=3?'sla-warn':'sla-bad';
    const statusBadge=statusMap[(r.Status||'').toLowerCase()]||`<span class="badge">${r.Status||'-'}</span>`;
    // Gel column: only for SimFast/Simascore
    const prod=r['Product Source']||'';
    let gelHtml='<td style="text-align:center">—</td>';
    if(prod==='SimFast'||prod==='Simascore'){
      if(r._sfGel!==undefined){
        gelHtml=`<td style="text-align:center"><span style="background:${PALETTE.primary}1a;color:${PALETTE.primary};padding:2px 7px;border-radius:10px;font-size:0.74rem;font-weight:700">Gel ${r._sfGel}</span></td>`;
      } else {
        const info=getMasterInfo(branchField(r));
        const gel=info&&info.gel!==''?info.gel:'?';
        gelHtml=`<td style="text-align:center"><span style="background:${PALETTE.primary}1a;color:${PALETTE.primary};padding:2px 7px;border-radius:10px;font-size:0.74rem;font-weight:700">Gel ${gel}</span></td>`;
      }
    }
    return `<tr>
      <td style="text-align:center;color:#64748b;font-size:0.75rem">${(currentPage-1)*PAGE_SIZE+i+1}</td>
      <td><a href="https://mantis.simasfinance.co.id/view.php?id=${r.Id}" style="color:${PALETTE.primary}">#${r.Id}</a></td>
      <td style="white-space:nowrap;font-size:0.78rem">${(r['Date Submitted']||'').split(' ')[0]||'-'}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.Summary||''}">${r.Summary||'-'}</td>
      <td style="font-size:0.78rem">${r.Category||'-'}</td>
      <td><span class="badge" style="background:${PALETTE.primary}22;color:${PALETTE.primary}">${r['Product Source']||'-'}</span></td>
      <td>${statusBadge}</td>
      <td style="font-size:0.78rem">${r['Root Cause']||'-'}</td>
      <td><span class="${slaClass}">${isNaN(sla)?'-':sla===1?'1 day':sla+' days'}</span></td>
      <td style="font-size:0.78rem">${r['Branch Name']||r.Branch||'-'}</td>
      ${gelHtml}
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

// ===== PAGER HELPER =====
const DD_PAGE=20;
let _ddVsIssuePage=1, _ddTablePage=1, _ddBestPage=1;
let _ddVsIssueBranchDD={}, _ddTableBranchDD={}, _ddBestBranchDD={};

function _renderPager(elId,cur,total,onGo){
  const el=document.getElementById(elId); if(!el)return;
  if(total<=1){el.innerHTML='';return;}
  let pagesHtml='';
  for(let p=1;p<=total;p++){
    pagesHtml+=`<button data-p="${p}" style="background:${p===cur?PALETTE.primary:'rgba(255,255,255,0.07)'};border:none;color:#f1f5f9;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:0.78rem;font-weight:${p===cur?700:400}">${p}</button>`;
  }
  el.innerHTML=`<div style="display:flex;gap:5px;align-items:center;justify-content:center;padding:8px 0;flex-wrap:wrap">
    <button data-dir="prev" style="background:rgba(255,255,255,0.07);border:none;color:${cur>1?'#f1f5f9':'#475569'};padding:4px 10px;border-radius:5px;cursor:${cur>1?'pointer':'default'};font-size:0.78rem">‹</button>
    ${pagesHtml}
    <button data-dir="next" style="background:rgba(255,255,255,0.07);border:none;color:${cur<total?'#f1f5f9':'#475569'};padding:4px 10px;border-radius:5px;cursor:${cur<total?'pointer':'default'};font-size:0.78rem">›</button>
    <span style="color:#64748b;font-size:0.75rem">hal ${cur}/${total}</span>
  </div>`;
  el.querySelectorAll('button[data-p]').forEach(b=>b.onclick=()=>onGo(parseInt(b.dataset.p)));
  const prev=el.querySelector('button[data-dir="prev"]'); if(prev&&cur>1)prev.onclick=()=>onGo(cur-1);
  const next=el.querySelector('button[data-dir="next"]'); if(next&&cur<total)next.onclick=()=>onGo(cur+1);
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
  renderDDTable(branchDD);
  renderDDBestBranchChart(branchDD);
  // store for paging
  _ddVsIssueBranchDD=branchDD; _ddTableBranchDD=branchDD; _ddBestBranchDD=branchDD;
  _ddVsIssuePage=1; _ddTablePage=1; _ddBestPage=1;
}

function renderDDVsIssueChart(branchDD){
  const all=Object.entries(branchDD).sort((a,b)=>b[1]-a[1]);
  const totalPages=Math.ceil(all.length/DD_PAGE);
  const _page=Math.min(_ddVsIssuePage,totalPages||1);
  const page=all.slice((_page-1)*DD_PAGE, _page*DD_PAGE);
  const labels=page.map(x=>x[0]);
  const ddCounts=page.map(x=>x[1]);
  const issueCounts=labels.map(b=>getIssueCountForDDBranch(b));
  // Dynamic height: 28px per row min 300px
  const h=Math.max(300,page.length*30);
  const wrap=document.getElementById('ddVsIssueChartWrap');
  if(wrap)wrap.style.height=h+'px';
  destroyChart('ddVsIssue');
  charts.ddVsIssue=new Chart(document.getElementById('ddVsIssueChart').getContext('2d'),{type:'bar',
    data:{labels,datasets:[
      {label:'MUF-Drawdown',data:ddCounts,backgroundColor:PALETTE.emerald+'99',borderColor:PALETTE.emerald,borderWidth:2,borderRadius:4},
      {label:'Issue/Tiket',data:issueCounts,backgroundColor:PALETTE.rose+'99',borderColor:PALETTE.rose,borderWidth:2,borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{position:'top'},
        tooltip:{backgroundColor:'#1e293b',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,titleColor:'#f1f5f9',bodyColor:'#94a3b8',
          callbacks:{afterBody(items){const i=items[0].dataIndex;const dd=ddCounts[i],iss=issueCounts[i];const r=dd>0?(iss/dd*100).toFixed(1):'0';return[`Rasio: ${r}% (${iss} issue / ${dd} DD)`];}}}
      },
      scales:{x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});
  _renderPager('ddVsIssuePager',_page,totalPages,p=>{_ddVsIssuePage=p;renderDDVsIssueChart(_ddVsIssueBranchDD);});
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

function renderDDTable(branchDD){
  // Hitung total aplikasi per cabang (semua status dari filteredDDData)
  const totalAppByBranch={};
  filteredDDData.forEach(r=>{const b=(r['Branch Name']||'Unknown').trim();totalAppByBranch[b]=(totalAppByBranch[b]||0)+1;});

  const all=Object.entries(branchDD).sort((a,b)=>b[1]-a[1]);
  const totalPages=Math.ceil(all.length/DD_PAGE);
  const _page=Math.min(_ddTablePage,totalPages||1);
  const start=(_page-1)*DD_PAGE;
  const pageData=all.slice(start,start+DD_PAGE);

  const tableData=pageData.map(([branch,ddCount],i)=>{
    const issueRows=getIssueRowsForDDBranch(branch);
    const issueCount=issueRows.length;
    const ratioNum=ddCount>0?issueCount/ddCount:0;
    const ratioPct=`${(ratioNum*100).toFixed(1)}%`;
    const catCount=countBy(issueRows,'Category');
    const topCat=topN(catCount,1)[0];
    const topCatStr=topCat?`${topCat[0]} (${topCat[1]})`:'—';
    const tagRows=getTagRowsForDDBranch(branch);
    const tagCount=countBy(tagRows.filter(r=>r.Tag&&r.Tag.trim()!==''),'Tag');
    const topTag=topN(tagCount,1)[0];
    const topTagStr=topTag?`${topTag[0]} (${topTag[1]})`:'—';
    const totalApp=totalAppByBranch[branch]||ddCount;
    const ratioDDPct=totalApp>0?`${(ddCount/totalApp*100).toFixed(1)}%`:'—';
    return{rank:start+i+1,branch,ddCount,issueCount,ratioPct,ratioNum,topCatStr,topTagStr,ratioDDPct};
  });
  window._ddTableData=tableData;
  document.getElementById('ddTableBody').innerHTML=tableData.map(row=>{
    const cls=row.ratioNum>0.3?'sla-bad':row.ratioNum>0.1?'sla-warn':'sla-good';
    return`<tr>
      <td style="text-align:center;color:#64748b;font-size:0.78rem">${row.rank}</td>
      <td style="font-size:0.81rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${row.branch}"><strong>${row.branch}</strong></td>
      <td style="text-align:right"><span style="color:${PALETTE.emerald};font-weight:700">${row.ddCount}</span></td>
      <td style="text-align:right;color:#94a3b8;font-size:0.8rem">${row.ratioDDPct}</td>
      <td style="text-align:right"><span style="color:${PALETTE.rose};font-weight:700">${row.issueCount}</span></td>
      <td style="text-align:right"><span class="${cls}" style="white-space:nowrap;font-weight:700">${row.ratioPct}</span></td>
      <td style="font-size:0.77rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${row.topCatStr}">${row.topCatStr}</td>
      <td style="font-size:0.77rem;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${row.topTagStr}">${row.topTagStr}</td>
    </tr>`;
  }).join('');
  _renderPager('ddTablePager',_page,totalPages,p=>{_ddTablePage=p;renderDDTable(_ddTableBranchDD);});
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
  }).filter(Boolean).sort((a,b)=>a.ratio!==b.ratio?a.ratio-b.ratio:b.ddCount-a.ddCount);

  const totalPages=Math.ceil(allBranchData.length/DD_PAGE);
  const _page=Math.min(_ddBestPage,totalPages||1);
  const start=(_page-1)*DD_PAGE;
  const best20=allBranchData.slice(start,start+DD_PAGE);

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
        ctx.save();
        ctx.font='bold 10px Inter,sans-serif';
        ctx.fillStyle=color; ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.fillText(`${(rn*100).toFixed(1)}%`,xPx+7,yPx);
        ctx.restore();
      });
    }
  };

  const h=Math.max(340,best20.length*30);
  const wrap=document.getElementById('ddBestChartWrap');
  if(wrap)wrap.style.height=h+'px';

  destroyChart('ddBestBranch');
  charts.ddBestBranch=new Chart(document.getElementById('ddBestBranchChart').getContext('2d'),{
    type:'bar',plugins:[ratioLabelPlugin],
    data:{labels:best20.map(x=>x.branch),datasets:[
      {label:'MUF-Drawdown',data:best20.map(x=>x.ddCount),backgroundColor:PALETTE.emerald+'99',borderColor:PALETTE.emerald,borderWidth:2,borderRadius:4},
      {label:'Issue/Tiket',data:best20.map(x=>x.issueCount),backgroundColor:PALETTE.rose+'99',borderColor:PALETTE.rose,borderWidth:2,borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      layout:{padding:{right:68}},
      plugins:{legend:{position:'top'},
        tooltip:{backgroundColor:'#1e293b',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,titleColor:'#f1f5f9',bodyColor:'#94a3b8',
          callbacks:{afterBody(items){const idx=items[0].dataIndex;const row=best20[idx];const pct=(row.ratio*100).toFixed(1);return[`Rasio: ${pct}% (${row.issueCount} issue / ${row.ddCount} DD)`];}}}
      },
      scales:{x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{grid:{display:false},ticks:{font:{size:10}}}}}});

  _renderPager('ddBestChartPager',_page,totalPages,p=>{_ddBestPage=p;renderDDBestBranchChart(_ddBestBranchDD);});

  // Tabel: #, Cabang, DD, Issue, Rasio%, Stars
  const medals=['🥇','🥈','🥉'];
  document.getElementById('ddBestTableBody').innerHTML=best20.map((row,i)=>{
    const globalRank=start+i;
    const pct=(row.ratio*100).toFixed(1);
    const stars=_ddStars(row.ratio);
    const tip=`${row.branch}\nDD: ${row.ddCount}  |  Issue: ${row.issueCount}\nRasio: ${pct}%`;
    const starColors=['#f43f5e','#f59e0b','#f59e0b','#10b981','#10b981'];
    const starColor=starColors[stars-1]||'#94a3b8';
    const starHtml=`<span class="star-tip" data-tip="${tip}" style="color:${starColor};font-size:0.95rem;letter-spacing:0.5px">${'★'.repeat(stars)+'☆'.repeat(5-stars)}</span>`;
    const ratioColor=row.ratio<0.05?'#10b981':row.ratio<0.15?'#f59e0b':'#f43f5e';
    return`<tr>
      <td style="text-align:center;font-size:0.88rem">${medals[globalRank]||globalRank+1}</td>
      <td style="font-size:0.78rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${row.branch}">${row.branch}</td>
      <td style="text-align:right;font-size:0.8rem;color:${PALETTE.emerald};font-weight:700">${row.ddCount}</td>
      <td style="text-align:right;font-size:0.8rem;color:${PALETTE.rose};font-weight:700">${row.issueCount}</td>
      <td style="text-align:right;font-weight:700;font-size:0.82rem;color:${ratioColor}">${pct}%</td>
      <td style="text-align:center">${starHtml}</td>
    </tr>`;
  }).join('');
  _renderPager('ddBestTablePager',_page,totalPages,p=>{_ddBestPage=p;renderDDBestBranchChart(_ddBestBranchDD);});
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
  const bulanLabel=filterState.months.length===0?'Semua':filterState.months.join(', ');
  doc.text(`Bulan: ${bulanLabel} | Produk: ${filterProduct.value || 'Semua'} | Generated: ${new Date().toLocaleString('id-ID')}`, 14, 21);
  doc.autoTable({ head: [headers], body: rows.map(row => headers.map(h => String(row[h] || ''))), startY: 26, styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 246, 250] }, margin: { left: 10, right: 10 } });
  doc.save(filename || `mantis-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// FIX #2: Export buttons use getExportData() which respects all active filters
document.getElementById('exportCSV').addEventListener('click', () => exportCSV());
document.getElementById('exportXLSX').addEventListener('click', () => exportXLSX());
document.getElementById('exportPDF').addEventListener('click', () => exportPDF());

// ===== DROPDOWN TOGGLE =====
// ===================================================================
// ===== OVERVIEW SIMFAST SECTION ====================================
// ===================================================================
const SF_RC=['People','Process','System'];
const SF_RC_COLORS={People:'#f43f5e',Process:'#f59e0b',System:'#6366f1'};
const SF_RC_LIGHT={People:'#f43f5e44',Process:'#f59e0b44',System:'#6366f144'};
let _sfTrendRC='All';          // RC filter for trend line
let _sfDetailMonthFilter=null; // clicked month key
let _sfDetailRCFilter=null;    // clicked KPI RC

function _sfCountActiveBranches(){
  // Step 1: tentukan cutoff date dari pilihan bulan
  const months=filterState.months;
  let cutoff=new Date();
  if(months&&months.length){
    const sorted=[...months].sort((a,b)=>{
      const p=s=>{const q=s.split(' ');return(q.length>1?+q[0]:9999)*100+MONTH_ORDER.indexOf(q[q.length-1]);};
      return p(b)-p(a);
    });
    const parts=sorted[0].split(' ');
    const yr=parseInt(parts[0]),mo=MONTH_ORDER.indexOf(parts[parts.length-1]);
    if(yr&&mo>=0)cutoff=new Date(yr,mo+1,0);
  }

  // Step 2: tentukan set cabang dari Gel/Branch filter
  const selBranches=filterState.branches; // [] = semua

  return[...masterBranchMap.values()].filter(m=>{
    if(!m.hasSimfast||!m.implementDate)return false;
    if(m.implementDate>cutoff)return false;
    // Jika ada filter Gel/Cabang: hanya hitung cabang yang terpilih
    if(selBranches.length>0){
      const matchBranch=selBranches.some(b=>canonBranch(b)===canonBranch(m.branch));
      if(!matchBranch)return false;
    }
    return true;
  }).length;
}

function renderOverviewSimfast(){
  const sec=document.getElementById('section-simfast');
  if(!sec||!sec.classList.contains('active'))return;
  const data=filteredSFData;
  _renderSfKpi(data);
  _renderSfTrendChart(data);
  _renderSfMonthBreakdown(data);
  _renderSfDetailTable();
  _renderSfCategoryStackedChart(data);
  _renderSfRCPieChart(data);
  _renderSfCatRCMonthTable(data);
}

// ── KPI ──────────────────────────────────────────────────────────────
function _renderSfKpi(data){
  const total=data.length;
  const activeBr=_sfCountActiveBranches();
  const people=data.filter(r=>r['Root Cause']==='People').length;
  const process=data.filter(r=>r['Root Cause']==='Process').length;
  const system=data.filter(r=>r['Root Cause']==='System').length;
  const e=id=>document.getElementById(id);
  if(e('sfKpiTotal'))e('sfKpiTotal').textContent=total.toLocaleString();
  if(e('sfKpiBranch'))e('sfKpiBranch').textContent=activeBr;
  if(e('sfKpiPeople'))e('sfKpiPeople').textContent=people;
  if(e('sfKpiProcess'))e('sfKpiProcess').textContent=process;
  if(e('sfKpiSystem'))e('sfKpiSystem').textContent=system;
  // Highlight active KPI filter
  ['People','Process','System'].forEach(rc=>{
    const card=document.getElementById(`sfKpiCard${rc}`);
    if(card)card.style.borderColor=_sfDetailRCFilter===rc?SF_RC_COLORS[rc]:'rgba(255,255,255,0.07)';
  });
}
window._sfKpiRCClick=function(rc){
  _sfDetailRCFilter=_sfDetailRCFilter===rc?null:rc;
  _sfDetailMonthFilter=null;
  _renderSfKpi(filteredSFData);
  _renderSfDetailTable();
  const el=document.getElementById('sfDetailTableCard');
  if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
};

// ── MONTH KEYS ────────────────────────────────────────────────────────
function _sfGetMonthKeys(data){
  const map={};
  data.forEach(r=>{const k=getRowMonthKey(r);if(k)map[k]=1;});
  return Object.keys(map).sort((a,b)=>{
    const p=s=>{const q=s.split(' ');return(q.length>1?+q[0]:9999)*100+MONTH_ORDER.indexOf(q[q.length-1]);};
    return p(a)-p(b);
  });
}

// Short month label: "2026 January" → "Jan '26"
function _sfShortMonth(k){
  const p=k.split(' ');
  return p.length>1?`${p[1].slice(0,3)} '${p[0].slice(2)}`:k.slice(0,3);
}

// ── TREND CHART ───────────────────────────────────────────────────────
function _renderSfTrendChart(data){
  const keys=_sfGetMonthKeys(data);
  const byKey=k=>data.filter(r=>getRowMonthKey(r)===k);
  const peopleCounts=keys.map(k=>byKey(k).filter(r=>r['Root Cause']==='People').length);
  const processCounts=keys.map(k=>byKey(k).filter(r=>r['Root Cause']==='Process').length);
  const systemCounts=keys.map(k=>byKey(k).filter(r=>r['Root Cause']==='System').length);
  const totalCounts=keys.map((_,i)=>peopleCounts[i]+processCounts[i]+systemCounts[i]);

  const trendSource=_sfTrendRC==='People'?peopleCounts:_sfTrendRC==='Process'?processCounts:_sfTrendRC==='System'?systemCounts:totalCounts;
  const trendColor=_sfTrendRC==='People'?SF_RC_COLORS.People:_sfTrendRC==='Process'?SF_RC_COLORS.Process:_sfTrendRC==='System'?SF_RC_COLORS.System:PALETTE.amber;

  // label inside bar plugin
  const insideLabel={id:'sfInsLbl',afterDraw(chart){
    const ctx=chart.ctx;
    chart.data.datasets.forEach((ds,di)=>{
      if(ds.type==='line')return;
      const meta=chart.getDatasetMeta(di);
      meta.data.forEach((bar,i)=>{
        const v=ds.data[i];if(!v||v<1)return;
        const h=Math.abs((bar.base||0)-bar.y);if(h<14)return;
        ctx.save();ctx.font='bold 9px Inter,sans-serif';ctx.fillStyle='#f1f5f9';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(v,bar.x,(bar.y+(bar.base||0))/2);ctx.restore();
      });
    });
  }};

  destroyChart('sfTrend');
  const el=document.getElementById('sfTrendChart');if(!el)return;
  charts.sfTrend=new Chart(el.getContext('2d'),{
    type:'bar',plugins:[insideLabel],
    data:{labels:keys,datasets:[
      {label:'People',data:peopleCounts,backgroundColor:SF_RC_LIGHT.People,borderColor:SF_RC_COLORS.People,borderWidth:1.5,stack:'rc',order:3},
      {label:'Process',data:processCounts,backgroundColor:SF_RC_LIGHT.Process,borderColor:SF_RC_COLORS.Process,borderWidth:1.5,stack:'rc',order:4},
      {label:'System',data:systemCounts,backgroundColor:SF_RC_LIGHT.System,borderColor:SF_RC_COLORS.System,borderWidth:1.5,stack:'rc',order:5},
      {label:`Tren: ${_sfTrendRC}`,data:trendSource,type:'line',borderColor:trendColor,backgroundColor:'transparent',borderWidth:2.5,tension:0.35,pointRadius:4,pointBackgroundColor:trendColor,pointBorderColor:'#0f172a',pointBorderWidth:2,order:1}
    ]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:8}},
      plugins:{
        legend:{position:'top',labels:{font:{size:10},usePointStyle:true,padding:12}},
        tooltip:{backgroundColor:'#1e293b',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,titleColor:'#f1f5f9',bodyColor:'#94a3b8',
          callbacks:{
            title(items){return items[0].label;},
            beforeBody(items){
              const k=items[0].label;
              const kRows=data.filter(r=>getRowMonthKey(r)===k);
              const p=kRows.filter(r=>r['Root Cause']==='People').length;
              const pr=kRows.filter(r=>r['Root Cause']==='Process').length;
              const s=kRows.filter(r=>r['Root Cause']==='System').length;
              const gelMap={};
              kRows.forEach(r=>{const g=r._sfGel!==undefined?`Gel ${r._sfGel}`:'Lainnya';gelMap[g]=(gelMap[g]||new Set()).add(branchField(r));});
              const gelLines=Object.entries(gelMap).sort((a,b)=>a[0].localeCompare(b[0])).map(([g,bs])=>`  ${g}: ${bs.size} cabang`);
              return[`Total: ${kRows.length}  |  People: ${p}  Process: ${pr}  System: ${s}`,'─────────',...gelLines,'─────────'];
            }
          }
        }
      },
      scales:{
        x:{stacked:true,grid:{display:false},ticks:{font:{size:10}}},
        y:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}}
      },
      onClick(evt,elements){
        if(!elements.length)return;
        const k=keys[elements[0].index];
        _sfDetailMonthFilter=_sfDetailMonthFilter===k?null:k;
        _sfDetailRCFilter=null;
        _renderSfDetailTable();
        const el=document.getElementById('sfDetailTableCard');
        if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
      }
    }
  });

  // Render RC filter buttons
  const btnWrap=document.getElementById('sfTrendRCBtns');
  if(btnWrap){
    btnWrap.innerHTML=['All',...SF_RC].map(rc=>`<button onclick="window._sfSetTrendRC('${rc}')" style="padding:4px 12px;border-radius:20px;border:none;cursor:pointer;font-size:0.77rem;font-weight:600;transition:all 0.15s;background:${_sfTrendRC===rc?(rc==='All'?PALETTE.amber:SF_RC_COLORS[rc]):'rgba(255,255,255,0.08)'};color:${_sfTrendRC===rc?'#0f172a':'#94a3b8'}">${rc}</button>`).join('');
  }
}
window._sfSetTrendRC=function(rc){_sfTrendRC=rc;_renderSfTrendChart(filteredSFData);};

// ── DETAIL TABLE ──────────────────────────────────────────────────────
function _renderSfDetailTable(){
  const card=document.getElementById('sfDetailTableCard');
  const thead=document.getElementById('sfDetailThead');
  const tbody=document.getElementById('sfDetailTbody');
  const title=document.getElementById('sfDetailTitle');
  if(!tbody)return;

  let rows=[...filteredSFData];
  if(_sfDetailMonthFilter)rows=rows.filter(r=>getRowMonthKey(r)===_sfDetailMonthFilter);
  if(_sfDetailRCFilter)rows=rows.filter(r=>r['Root Cause']===_sfDetailRCFilter);

  // Sort: Gel → Cabang → Root Cause → Date
  rows.sort((a,b)=>{
    const ga=String(a._sfGel??'9'),gb=String(b._sfGel??'9');
    if(ga!==gb)return ga.localeCompare(gb,undefined,{numeric:true});
    const ba=branchField(a),bb=branchField(b);
    if(ba!==bb)return ba.localeCompare(bb);
    const ra=a['Root Cause']||'',rb=b['Root Cause']||'';
    if(ra!==rb)return ra.localeCompare(rb);
    return(parseIssueDate(a['Date Submitted'])||0)-(parseIssueDate(b['Date Submitted'])||0);
  });

  const filterLabel=(_sfDetailMonthFilter||_sfDetailRCFilter)?[_sfDetailMonthFilter,_sfDetailRCFilter].filter(Boolean).join(' · '):'Semua';
  if(title)title.textContent=`📋 Detail Tiket SimFast — ${filterLabel} (${rows.length} tiket)`;

  tbody.innerHTML=rows.map((r,i)=>{
    const gel=r._sfGel!==undefined?`Gel ${r._sfGel}`:'—';
    const gelColor=r._sfGel!==undefined?SF_RC_COLORS[r['Root Cause']]||PALETTE.primary:'#64748b';
    const rc=r['Root Cause']||'-';
    const rcColor=SF_RC_COLORS[rc]||'#94a3b8';
    const ds=r['Date Submitted'];
    const dateStr=ds instanceof Date?ds.toLocaleDateString('id-ID'):String(ds||'').split(' ')[0];
    return`<tr>
      <td style="text-align:center;color:#64748b;font-size:0.75rem;padding:5px 6px">${i+1}</td>
      <td style="text-align:center;padding:5px 6px"><span style="background:${PALETTE.primary}1a;color:${PALETTE.primary};padding:2px 7px;border-radius:10px;font-size:0.75rem;font-weight:700;white-space:nowrap">${gel}</span></td>
      <td style="font-size:0.79rem;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 6px" title="${branchField(r)}">${branchField(r)}</td>
      <td style="white-space:nowrap;font-size:0.76rem;padding:5px 6px">${dateStr}</td>
      <td style="padding:5px 6px"><a href="https://mantis.simasfinance.co.id/view.php?id=${r.Id}" style="color:${PALETTE.primary};font-size:0.78rem">#${r.Id}</a></td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.78rem;padding:5px 6px" title="${r.Summary||''}">${r.Summary||'-'}</td>
      <td style="font-size:0.77rem;padding:5px 6px">${r.Category||'-'}</td>
      <td style="font-size:0.77rem;padding:5px 6px"><span style="color:${PALETTE.primary};background:${PALETTE.primary}1a;padding:2px 7px;border-radius:8px;font-size:0.74rem">${r['Product Source']||'-'}</span></td>
      <td style="padding:5px 6px;font-size:0.77rem"><span style="color:${rcColor};font-weight:700">${rc}</span></td>
      <td style="font-size:0.77rem;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 6px" title="${branchField(r)}">${branchField(r)}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="10" style="text-align:center;color:#64748b;padding:16px">Tidak ada tiket</td></tr>';

  if(_sfDetailMonthFilter||_sfDetailRCFilter){const btn=document.getElementById('sfDetailClearBtn');if(btn)btn.style.display='inline-flex';}
  else{const btn=document.getElementById('sfDetailClearBtn');if(btn)btn.style.display='none';}
}
window._sfClearDetailFilter=function(){_sfDetailMonthFilter=null;_sfDetailRCFilter=null;_renderSfDetailTable();};

// ── MONTH BREAKDOWN TABLE ─────────────────────────────────────────────
function _renderSfMonthBreakdown(data){
  const el=document.getElementById('sfMonthBreakdownBody');if(!el)return;
  const keys=_sfGetMonthKeys(data);
  if(!keys.length){el.innerHTML='<tr><td colspan="5" style="text-align:center;color:#64748b;padding:10px">Tidak ada data</td></tr>';return;}
  const totals=keys.map(k=>data.filter(r=>getRowMonthKey(r)===k).length);
  const mean=totals.reduce((a,b)=>a+b,0)/totals.length;
  el.innerHTML=keys.map((k,i)=>{
    const count=totals[i];
    const prev=i>0?totals[i-1]:null;
    let momHtml='<span style="color:#475569">—</span>';
    if(prev!==null&&prev>0){
      const pct=((count-prev)/prev*100).toFixed(1);
      const sign=count>prev?'+':'';
      const c=count>prev?'#f43f5e':count<prev?'#10b981':'#94a3b8';
      momHtml=`<span style="color:${c};font-weight:600;white-space:nowrap">${sign}${pct}%</span>`;
    }
    const parts=k.split(' ');
    const yr=parseInt(parts[0]),mo=MONTH_ORDER.indexOf(parts[parts.length-1]);
    const monthEnd=yr&&mo>=0?new Date(yr,mo+1,0):null;
    const activeBr=monthEnd?[...masterBranchMap.values()].filter(m=>m.hasSimfast&&m.implementDate&&m.implementDate<=monthEnd).length:'—';
    const avgColor=count>mean?'#f43f5e':'#10b981';
    return`<tr>
      <td style="padding:5px 8px;white-space:nowrap;font-size:0.78rem">${k}</td>
      <td style="text-align:right;font-weight:700;color:#f1f5f9;padding:5px 6px">${count}</td>
      <td style="text-align:right;font-size:0.77rem;color:${avgColor};padding:5px 6px" title="Mean semua bulan">${mean.toFixed(1)}</td>
      <td style="text-align:right;padding:5px 8px">${momHtml}</td>
      <td style="text-align:right;font-size:0.77rem;color:#94a3b8;padding:5px 8px">${activeBr}</td>
    </tr>`;
  }).join('');
}

// ── TOP KATEGORI STACKED ──────────────────────────────────────────────
function _renderSfCategoryStackedChart(data){
  const cats=Object.entries(
    data.reduce((acc,r)=>{acc[r.Category||'Lainnya']=(acc[r.Category||'Lainnya']||0)+1;return acc;},{}))
    .sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]);

  const insideLabel={id:'sfCatInsLbl',afterDraw(chart){
    const ctx=chart.ctx;
    chart.data.datasets.forEach((ds,di)=>{
      const meta=chart.getDatasetMeta(di);
      meta.data.forEach((bar,i)=>{
        const v=ds.data[i];if(!v||v<1)return;
        const h=Math.abs((bar.base||0)-bar.x);if(h<18)return;
        ctx.save();ctx.font='bold 9px Inter,sans-serif';ctx.fillStyle='#f1f5f9';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(v,(bar.x+(bar.base||0))/2,bar.y);ctx.restore();
      });
    });
  }};

  destroyChart('sfCategory');
  const el=document.getElementById('sfCategoryChart');if(!el)return;
  charts.sfCategory=new Chart(el.getContext('2d'),{
    type:'bar',plugins:[insideLabel],
    data:{labels:cats,datasets:SF_RC.map(rc=>({
      label:rc,
      data:cats.map(cat=>data.filter(r=>(r.Category||'Lainnya')===cat&&r['Root Cause']===rc).length),
      backgroundColor:SF_RC_LIGHT[rc],borderColor:SF_RC_COLORS[rc],borderWidth:1.5,stack:'s'
    }))},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{position:'top',labels:{font:{size:10},usePointStyle:true}},
        tooltip:{backgroundColor:'#1e293b',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,titleColor:'#f1f5f9',bodyColor:'#94a3b8'}},
      scales:{x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,0.04)'}},y:{stacked:true,grid:{display:false},ticks:{font:{size:10}}}}}});
}

// ── PIE CHART ROOT CAUSE ─────────────────────────────────────────────
function _renderSfRCPieChart(data){
  const counts=SF_RC.map(rc=>data.filter(r=>r['Root Cause']===rc).length);
  const other=data.filter(r=>!SF_RC.includes(r['Root Cause'])).length;
  destroyChart('sfRCPie');
  const el=document.getElementById('sfRCPieChart');if(!el)return;
  charts.sfRCPie=new Chart(el.getContext('2d'),{type:'doughnut',
    data:{labels:[...SF_RC,'Lainnya'],datasets:[{data:[...counts,other],
      backgroundColor:[...Object.values(SF_RC_LIGHT),'rgba(148,163,184,0.3)'],
      borderColor:[...Object.values(SF_RC_COLORS),'#94a3b8'],borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
      plugins:{legend:{position:'bottom',labels:{font:{size:10},usePointStyle:true}},
        tooltip:{backgroundColor:'#1e293b',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,padding:10,titleColor:'#f1f5f9',bodyColor:'#94a3b8'}}}});
}

// ── CATEGORY × RC × MONTH TABLE ──────────────────────────────────────
function _renderSfCatRCMonthTable(data){
  const keys=_sfGetMonthKeys(data);
  const cats=Object.entries(
    data.reduce((acc,r)=>{const c=r.Category||'(Kosong)';acc[c]=(acc[c]||0)+1;return acc;},{}))
    .sort((a,b)=>b[1]-a[1]).map(x=>x[0]);

  // Period label
  const period=keys.length===0?'Semua Periode':keys.length===1?keys[0]:`${keys[0]} – ${keys[keys.length-1]}`;
  const periEl=document.getElementById('sfCatRCPeriod');if(periEl)periEl.textContent=period;

  const thead=document.getElementById('sfCatRCHead');
  const tbody=document.getElementById('sfCatRCBody');
  if(!thead||!tbody)return;

  thead.innerHTML=`<tr>
    <th rowspan="2" style="min-width:150px;vertical-align:middle;border-right:1px solid rgba(255,255,255,0.08)">Kategori</th>
    <th rowspan="2" style="min-width:70px;vertical-align:middle">Root Cause</th>
    ${keys.map(k=>`<th style="text-align:right;min-width:50px;font-size:0.76rem;white-space:nowrap">${_sfShortMonth(k)}</th>`).join('')}
    <th rowspan="2" style="text-align:right;min-width:54px;vertical-align:middle;font-weight:800;border-left:1px solid rgba(255,255,255,0.08)">Total</th>
  </tr><tr>${keys.map(()=>'<th></th>').join('')}</tr>`;

  const rows=[];
  cats.forEach(cat=>{
    const catRows=data.filter(r=>(r.Category||'(Kosong)')===cat);
    SF_RC.forEach((rc,ri)=>{
      const rcRows=catRows.filter(r=>r['Root Cause']===rc);
      const mCounts=keys.map(k=>rcRows.filter(r=>getRowMonthKey(r)===k).length);
      const total=rcRows.length;
      rows.push(`<tr style="${ri===2?'border-bottom:2px solid rgba(255,255,255,0.1)':''}">
        ${ri===0?`<td rowspan="3" style="font-weight:700;font-size:0.8rem;vertical-align:middle;border-right:1px solid rgba(255,255,255,0.06);padding:5px 8px">${cat}</td>`:''}
        <td style="font-size:0.76rem;font-weight:700;color:${SF_RC_COLORS[rc]};padding:4px 8px;white-space:nowrap">${rc}</td>
        ${mCounts.map(n=>`<td style="text-align:right;font-size:0.78rem;color:${n>0?'#f1f5f9':'#334155'};font-weight:${n>0?700:400};padding:4px 5px">${n||'—'}</td>`).join('')}
        <td style="text-align:right;font-weight:800;font-size:0.8rem;color:${SF_RC_COLORS[rc]};padding:4px 8px;border-left:1px solid rgba(255,255,255,0.06)">${total||'—'}</td>
      </tr>`);
    });
  });
  tbody.innerHTML=rows.join('')||'<tr><td colspan="100" style="text-align:center;color:#64748b;padding:14px">Tidak ada data</td></tr>';
}

// ── EXPORTS ────────────────────────────────────────────────────────────
window._sfExportCatRCXLS=function(){
  const data=filteredSFData;
  const keys=_sfGetMonthKeys(data);
  const cats=Object.entries(data.reduce((acc,r)=>{const c=r.Category||'(Kosong)';acc[c]=(acc[c]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  const period=keys.length===0?'Semua':keys.length===1?keys[0]:`${keys[0]}-${keys[keys.length-1]}`;
  const header=['Kategori','Root Cause',...keys.map(k=>_sfShortMonth(k)),'Total'];
  const rows=[header];
  cats.forEach(cat=>{
    const catRows=data.filter(r=>(r.Category||'(Kosong)')===cat);
    SF_RC.forEach(rc=>{
      const rcRows=catRows.filter(r=>r['Root Cause']===rc);
      rows.push([cat,rc,...keys.map(k=>rcRows.filter(r=>getRowMonthKey(r)===k).length),rcRows.length]);
    });
    rows.push(['','','─'.repeat(10)]);
  });
  try{
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,'Kategori RC');
    XLSX.writeFile(wb,`SimFast_CatRC_${period.replace(/\s+/g,'_')}.xlsx`);
  }catch(e){alert('Export gagal: '+e.message);}
};

window._sfExportDetailXLS=function(){
  const data=filteredSFData;
  const filterLabel=(_sfDetailMonthFilter||_sfDetailRCFilter)?[_sfDetailMonthFilter,_sfDetailRCFilter].filter(Boolean).join('_'):'Semua';
  let rows=[...data];
  if(_sfDetailMonthFilter)rows=rows.filter(r=>getRowMonthKey(r)===_sfDetailMonthFilter);
  if(_sfDetailRCFilter)rows=rows.filter(r=>r['Root Cause']===_sfDetailRCFilter);
  rows.sort((a,b)=>{
    const ga=String(a._sfGel??'9'),gb=String(b._sfGel??'9');
    if(ga!==gb)return ga.localeCompare(gb,undefined,{numeric:true});
    return branchField(a).localeCompare(branchField(b));
  });
  const header=['No','Gel','Cabang','Tanggal','ID','Summary','Kategori','Produk','Root Cause'];
  const sheetRows=[header,...rows.map((r,i)=>{
    const ds=r['Date Submitted'];
    const dateStr=ds instanceof Date?ds.toLocaleDateString('id-ID'):String(ds||'').split(' ')[0];
    return[i+1,r._sfGel!==undefined?`Gel ${r._sfGel}`:'—',branchField(r),dateStr,r.Id,r.Summary||'',r.Category||'',r['Product Source']||'',r['Root Cause']||''];
  })];
  try{
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb,ws,'Detail Tiket');
    XLSX.writeFile(wb,`SimFast_Detail_${filterLabel.replace(/\s+/g,'_')}.xlsx`);
  }catch(e){alert('Export gagal: '+e.message);}
};

function toggleDrop(id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  // Save original inline style once
  if (panel.dataset.origStyle === undefined) {
    panel.dataset.origStyle = panel.getAttribute('style') || '';
  }
  const isOpen = panel.classList.contains('open');
  _closeAllPanels();
  if (isOpen) return;

  if (window.innerWidth < 900) {
    // Bottom sheet on mobile — always visible regardless of scroll/wrap
    const maxH = Math.round(window.innerHeight * 0.65);
    panel.setAttribute('style',
      `position:fixed!important;bottom:0!important;left:0!important;right:0!important;` +
      `width:100%!important;max-height:${maxH}px!important;overflow-y:auto!important;` +
      `z-index:999999!important;border-radius:16px 16px 0 0!important;` +
      `padding-bottom:env(safe-area-inset-bottom,12px)!important;box-shadow:0 -4px 24px rgba(0,0,0,0.5)!important;`
    );
    // Show overlay backdrop
    let bg = document.getElementById('_ddBg');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = '_ddBg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999998;';
      bg.onclick = _closeAllPanels;
      document.body.appendChild(bg);
    }
    bg.style.display = 'block';
  }
  panel.classList.add('open');
}

// Close dropdowns on outside click/tap
function _closeAllPanels(){
  document.querySelectorAll('.ov-dd-panel.open').forEach(p=>{
    p.classList.remove('open');
    if(p.dataset.origStyle!==undefined)p.setAttribute('style',p.dataset.origStyle);
    else p.removeAttribute('style');
  });
  // Hide mobile backdrop
  const bg=document.getElementById('_ddBg');if(bg)bg.style.display='none';
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.ov-dd-wrap')&&!e.target.closest('.ov-dd-panel'))_closeAllPanels();
},true);
window.addEventListener('scroll',_closeAllPanels,{passive:true});

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => { loadData(); });
