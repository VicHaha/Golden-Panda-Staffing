// ============================================================
// Analysis — sales dashboard derived from sales_reports.
// Daily / Monthly views of sales-by-item, ordered by quantity sold
// (highest to lowest). "Gift Set" is always pinned at the bottom of
// the list, excluded from the sort. All figures are computed on the
// fly from the same `salesReports` data the Stock tab uses — nothing
// extra is fetched.
// ============================================================

let analysisView = 'sales'; // 'sales' | 'shift' — which Analysis sub-page is showing
let analysisPeriod = 'daily'; // 'daily' | 'monthly'
let analysisDate = todayStr();      // anchor for daily view
let analysisMonth = new Date().toISOString().slice(0,7); // anchor for monthly view, "YYYY-MM"

// ---------- date-range helpers ----------

function analysisRange(){
  if(analysisPeriod === 'daily'){
    return { start: analysisDate, end: analysisDate };
  }
  const [y, m] = analysisMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const start = `${analysisMonth}-01`;
  const end = `${analysisMonth}-${String(lastDay).padStart(2,'0')}`;
  return { start, end };
}

// ---------- rendering ----------

function renderAnalysis(){
  let html = `<div class="section-title">Analysis</div>`;

  html += `
    <div class="period-toggle" id="analysis-view-toggle" style="margin-bottom:14px;">
      <button class="period-btn ${analysisView==='sales'?'active':''}" data-analysis-view="sales">Sales</button>
      <button class="period-btn ${analysisView==='shift'?'active':''}" data-analysis-view="shift">Shift Engagement</button>
    </div>
  `;

  html += analysisView === 'shift' ? renderShiftAnalysis() : renderSalesAnalysis();
  return html;
}

function renderSalesAnalysis(){
  const { start, end } = analysisRange();
  const inRange = salesReports.filter(r => r.work_date >= start && r.work_date <= end);

  const byProduct = {};
  let totalSold = 0;
  inRange.forEach(r=>{
    const qty = Number(r.sales_qty||0);
    byProduct[r.product_name] = (byProduct[r.product_name]||0) + qty;
    totalSold += qty;
  });
  const allRows = Object.entries(byProduct).map(([name, qty])=>({ name, qty }));
  const giftSetRow = allRows.find(r => r.name.trim().toLowerCase() === 'gift set');
  const itemRows = allRows
    .filter(r => r.name.trim().toLowerCase() !== 'gift set')
    .sort((a,b)=> b.qty - a.qty);
  const orderedRows = giftSetRow ? [...itemRows, giftSetRow] : itemRows;
  const maxQty = orderedRows.length ? Math.max(...orderedRows.map(r=>r.qty)) : 0;

  let html = `<div class="section-title">Sales analysis</div>`;

  html += `
    <div class="period-toggle" id="sales-period-toggle">
      <button class="period-btn ${analysisPeriod==='daily'?'active':''}" data-period="daily">Daily</button>
      <button class="period-btn ${analysisPeriod==='monthly'?'active':''}" data-period="monthly">Monthly</button>
    </div>
  `;

  html += `<div class="analysis-nav">`;
  if(analysisPeriod === 'daily'){
    html += `<input id="analysis-date-input" type="date" value="${analysisDate}">`;
  }else{
    html += `<input id="analysis-month-input" type="month" value="${analysisMonth}">`;
  }
  html += `</div>`;

  html += `
    <div class="summary-strip">
      <div class="stat-card"><div class="num">${totalSold}</div><div class="lbl">Units sold</div></div>
    </div>
  `;

  if(orderedRows.length === 0){
    html += emptyState('📊', 'No sales recorded for this period', 'Log stock reports in the Stock tab to see them here.');
    return html;
  }

  html += `<div class="section-title" style="margin-top:2px;">Sales by item</div>`;
  orderedRows.forEach(r=>{
    const pct = maxQty ? Math.max(4, Math.round((r.qty / maxQty) * 100)) : 0;
    html += `
      <div class="bar-row">
        <div class="bar-row-label"><span>${esc(r.name)}</span><b>${r.qty}</b></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
      </div>
    `;
  });

  return html;
}

function wireAnalysisControls(){
  document.querySelectorAll('#analysis-view-toggle .period-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      analysisView = btn.dataset.analysisView;
      render();
    });
  });

  if(analysisView === 'shift'){
    wireShiftAnalysisControls();
    return;
  }

  document.querySelectorAll('#sales-period-toggle .period-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      analysisPeriod = btn.dataset.period;
      render();
    });
  });
  const di = document.getElementById('analysis-date-input');
  if(di) di.addEventListener('change', e=>{ analysisDate = e.target.value; render(); });
  const mi = document.getElementById('analysis-month-input');
  if(mi) mi.addEventListener('change', e=>{ analysisMonth = e.target.value; render(); });
}
