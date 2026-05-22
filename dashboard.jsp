<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mantis Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background-color: #0f172a; color: #f8fafc; display: flex; height: 100vh; overflow: hidden; }
        .sidebar { width: 260px; background-color: #1e293b; display: flex; flex-direction: column; padding: 24px; transition: all 0.3s; }
        .sidebar.collapsed { width: 70px; padding: 24px 10px; }
        .sidebar-brand { font-size: 18px; font-weight: 700; color: #38bdf8; margin-bottom: 30px; display: flex; gap: 10px; }
        .nav-menu { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .nav-item { display: block; padding: 12px 16px; color: #94a3b8; text-decoration: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
        .nav-item:hover, .nav-item.active { color: #fff; background-color: #334155; }
        .nav-item.active { background-color: #6366f1; }
        .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .header { background-color: #1e293b; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .global-filters { display: flex; gap: 12px; align-items: center; }
        .filter-select, .search-box { background-color: #0f172a; color: #fff; border: 1px solid rgba(255,255,255,0.1); padding: 8px 14px; border-radius: 6px; outline: none; }
        .content-body { flex: 1; padding: 32px; overflow-y: auto; }
        .section { display: none; }
        .section.active { display: block; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 24px; }
        .kpi-card { background-color: #1a2235; padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.03); }
        .kpi-card h3 { font-size: 13px; color: #94a3b8; margin-bottom: 6px; }
        .kpi-card p { font-size: 24px; font-weight: 700; }
        .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; margin-bottom: 24px; }
        .chart-card { background-color: #1a2235; padding: 24px; border-radius: 12px; height: 340px; }
        .chart-card h4 { margin-bottom: 16px; font-size: 15px; color: #cbd5e1; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .badge-open { background: rgba(56,189,248,0.15); color: #38bdf8; }
        .badge-system { background: rgba(139,92,246,0.15); color: #8b5cf6; }
        .tag-pill { background: #334155; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; text-align: left; margin-top: 16px; }
        th, td { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
        th { background-color: #1e293b; color: #94a3b8; }
        .page-btn { background: #1e293b; color: #fff; border: none; padding: 6px 12px; margin: 0 2px; border-radius: 4px; cursor: pointer; }
        .page-btn.active { background: #6366f1; }
        .loading-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #0f172a; z-index: 9999; display: flex; justify-content: center; align-items: center; flex-direction: column; gap: 12px; }
        .spinner { width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .hidden { display: none !important; }
        .spinning { animation: spin 1s linear infinite; }
    </style>
</head>
<body>

    <div id="loadingOverlay" class="loading-overlay">
        <div class="spinner"></div>
        <p style="color: #94a3b8;">Menyelaraskan Multi-Sheet Data...</p>
    </div>

    <div id="sidebar" class="sidebar">
        <div class="sidebar-brand">📊 <span>Mantis Panel</span></div>
        <ul class="nav-menu">
            <li><a id="nav-overview" class="nav-item active" data-section="overview">Overview</a></li>
            <li><a id="nav-tickets" class="nav-item" data-section="tickets">Daftar Tiket</a></li>
            <li><a id="nav-sla" class="nav-item" data-section="sla">Analisis SLA</a></li>
            <li><a id="nav-branch" class="nav-item" data-section="branch">Analisis Cabang</a></li>
            <li><a id="nav-tag" class="nav-item" data-section="tag">Analisis Tag 🏷️</a></li>
        </ul>
        <div style="margin-top: auto; font-size: 11px; color: #64748b;">
            <div class="ds-val">Menghubungkan...</div>
            <div id="lastUpdate">Update: -</div>
        </div>
    </div>

    <div id="main" class="main-content">
        <div class="header">
            <h1 id="currentPageTitle" style="font-size: 20px;">Overview</h1>
            <button id="sidebarToggle" style="display:none;"></button> <button id="mobileMenuBtn" style="display:none;"></button>
            <div class="global-filters">
                <select id="filterMonth" class="filter-select"><option value="">Semua Bulan</option></select>
                <select id="filterProduct" class="filter-select"><option value="">Semua Produk</option></select>
                <button id="refreshBtn" class="filter-select" style="cursor:pointer;">🔄 Refresh</button>
            </div>
        </div>

        <div class="content-body">
            <div id="section-overview" class="section active">
                <div class="kpi-grid">
                    <div class="kpi-card"><h3>Total Kasus</h3><p id="kpiTotal">0</p></div>
                    <div class="kpi-card"><h3>Kasus Selesai</h3><p id="kpiResolved">0</p></div>
                    <div class="kpi-card"><h3>Kasus Outstanding</h3><p id="kpiOpen">0</p></div>
                </div>
                <div class="chart-grid">
                    <div class="chart-card"><h4>Tren Bulanan</h4><canvas id="trendChart"></canvas></div>
                    <div class="chart-card"><h4>Proporsi Status</h4><canvas id="statusChart"></canvas></div>
                </div>
                <div class="chart-grid">
                    <div class="chart-card"><h4>Top Kategori</h4><canvas id="categoryChart"></canvas></div>
                    <div class="chart-card"><h4>Distribusi Root Cause</h4><canvas id="rootCauseChart"></canvas></div>
                </div>
            </div>

            <div id="section-tickets" class="section">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <input type="text" id="tableSearch" class="search-box" placeholder="Cari ID, Summary, Cabang...">
                    <span id="tableCount" style="color: #94a3b8;">0 tiket</span>
                </div>
                <div style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th><th>Tanggal</th><th>Summary</th><th>Kategori</th><th>Produk</th><th>Status</th><th>Root Cause</th><th>SLA</th><th>Tags (Sheet 2)</th><th>Cabang</th>
                            </tr>
                        </thead>
                        <tbody id="ticketTableBody"></tbody>
                    </table>
                </div>
                <div id="pagination" style="margin-top: 16px; display: flex; justify-content: flex-end;"></div>
            </div>

            <div id="section-sla" class="section">
                <div class="chart-grid">
                    <div class="chart-card"><h4>Pemenuhan SLA</h4><canvas id="slaDistChart"></canvas></div>
                    <div class="chart-card"><h4>Karakteristik Produk</h4><canvas id="productChart"></canvas></div>
                </div>
            </div>

            <div id="section-branch" class="section">
                <div class="chart-grid" style="grid-template-columns: 1fr;">
                    <div class="chart-card" style="height: 450px;"><h4>Sebaran Kasus Per Cabang</h4><canvas id="branchBarChart"></canvas></div>
                </div>
            </div>

            <div id="section-tag" class="section">
                <div class="chart-grid" style="grid-template-columns: 1fr;">
                    <div class="chart-card" style="height: 450px;"><h4>Top Frekuensi Penggunaan Tag Kasus</h4><canvas id="tagBarChart"></canvas></div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="app.js"></script>
</body>
</html>
