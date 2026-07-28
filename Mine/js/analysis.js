// ============================================================
// Analysis — sales dashboard derived from sales_reports.
// Daily / Weekly / Monthly views of sales-by-item and free gifts
// given, plus a sortable breakdown table. All figures are computed
// on the fly from the same `salesReports` data the Stock tab uses —
// nothing extra is fetched.
// ============================================================

let analysisPeriod = 'daily'; // 'daily' | 'weekly' | 'monthly'
let analysisDate = todayStr();      // anchor for daily view
let analysisWeek = isoWeekStringFor(new Date()); // anchor for weekly view, "YYYY-Www"
let analysisMonth = new Date().toISOString().slice(0,7); // anchor for monthly view, "YYYY-MM"

// ---------- date-range helpers ----------

function isoWeekStringFor(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

// Converts an ISO week string ("2026-W05") into its Monday–Sunday date range.
function isoWeekToRange(weekStr){
  const [yearStr, wStr] = weekStr.split('-W');
  const year = parseInt(yearStr,10), week = parseInt(wStr,10);
  const simple = new Date(Date.UTC(year, 0, 1 + (week-1)*7));
  const dow = simple.getUTCDay();
  const monday = new Date(simple);
  if(dow <= 4) monday.setUTCDate(simple.getUTCDate() - dow + 1);
  else monday.setUTCDate(simple.getUTCDate() + 8 - dow);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const toStr = d => d.toISOString().slice(0,10);
  return { start: toStr(monday), end: toStr(sunday) };
}

function analysisRange(){
  if(analysisPeriod === 'daily'){
    return { start: analysisDate, end: analysisDate, label: formatDateLong(analysisDate) };
  }
  if(analysisPeriod === 'weekly'){
    const { start, end } = isoWeekToRange(analysisWeek);
    return { start, end, label: `${formatDateLong(start)} – ${formatDateLong(end)}` };
  }
  const [y, m] = analysisMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const start = `${analysisMonth}-01`;
  const end = `${analysisMonth}-${String(lastDay).padStart(2,'0')}`;
  const label = new Date(start+'T00:00:00').toLocaleDateString('en-GB',{month:'long', year:'numeric'});
  return { start, end, label };
}

// ---------- rendering ----------

function renderAnalysis(){
  const { start, end, label } = analysisRange();
  const inRange = salesReports.filter(r => r.work_date >= start && r.work_date <= end);

  const byProduct = {};
  let totalSold = 0, totalGifts = 0;
  inRange.forEach(r=>{
    const qty = Number(r.sales_qty||0);
    byProduct[r.product_name] = (byProduct[r.product_name]||0) + qty;
    totalSold += qty;
    totalGifts += Number(r.free_gift_qty||0);
  });
  const itemRows = Object.entries(byProduct)
    .map(([name, qty])=>({ name, qty }))
    .sort((a,b)=> b.qty - a.qty);
  const maxQty = itemRows.length ? itemRows[0].qty : 0;

  let html = `<div class="section-title">Sales analysis</div>`;

  html += `
    <div class="period-toggle">
      <button class="period-btn ${analysisPeriod==='daily'?'active':''}" data-period="daily">Daily</button>
      <button class="period-btn ${analysisPeriod==='weekly'?'active':''}" data-period="weekly">Weekly</button>
      <button class="period-btn ${analysisPeriod==='monthly'?'active':''}" data-period="monthly">Monthly</button>
    </div>
  `;

  html += `<div class="analysis-nav">`;
  if(analysisPeriod === 'daily'){
    html += `<input id="analysis-date-input" type="date" value="${analysisDate}">`;
  }else if(analysisPeriod === 'weekly'){
    html += `<input id="analysis-week-input" type="week" value="${analysisWeek}">`;
  }else{
    html += `<input id="analysis-month-input" type="month" value="${analysisMonth}">`;
  }
  html += `</div>`;
  html += `<div class="sales-group-sub" style="margin:-10px 0 14px;">${esc(label)}</div>`;

  html += `
    <div class="summary-strip">
      <div class="stat-card"><div class="num">${totalSold}</div><div class="lbl">Units sold</div></div>
      <div class="stat-card"><div class="num">${itemRows.length}</div><div class="lbl">Items sold</div></div>
      <div class="stat-card"><div class="num">${totalGifts}</div><div class="lbl">Free gifts given</div></div>
    </div>
  `;

  if(itemRows.length === 0 && totalGifts === 0){
    html += emptyState('📊', `No sales recorded for ${esc(label)}`, 'Log stock reports in the Stock tab to see them here.');
    return html;
  }

  html += `<div class="section-title" style="margin-top:2px;">Sales by item</div>`;
  if(itemRows.length === 0){
    html += `<div class="sales-group-sub" style="margin-bottom:14px;">No items sold in this period.</div>`;
  }else{
    itemRows.forEach(r=>{
      const pct = maxQty ? Math.max(4, Math.round((r.qty / maxQty) * 100)) : 0;
      html += `
        <div class="bar-row">
          <div class="bar-row-label"><span>${esc(r.name)}</span><b>${r.qty}</b></div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
        </div>
      `;
    });
  }

  html += `<div class="section-title" style="margin-top:6px;">Item breakdown <span class="count-pill">highest to lowest</span></div>`;
  itemRows.forEach((r, idx)=>{
    html += `
      <div class="analysis-table-row">
        <div style="display:flex; align-items:center; min-width:0;">
          <div class="analysis-rank">${idx+1}</div>
          <div class="rname" style="font-size:13.5px;">${esc(r.name)}</div>
        </div>
        <div class="rtotal" style="font-size:15px;">${r.qty}</div>
      </div>
    `;
  });
  html += `
    <div class="analysis-table-row analysis-gift-row">
      <div style="display:flex; align-items:center; min-width:0;">
        <div class="analysis-rank" style="background:var(--bamboo-tint); color:var(--bamboo);">🎁</div>
        <div class="rname" style="font-size:13.5px;">Free gifts given</div>
      </div>
      <div class="rtotal" style="font-size:15px; color:var(--bamboo);">${totalGifts}</div>
    </div>
  `;

  return html;
}

function wireAnalysisControls(){
  document.querySelectorAll('.period-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      analysisPeriod = btn.dataset.period;
      render();
    });
  });
  const di = document.getElementById('analysis-date-input');
  if(di) di.addEventListener('change', e=>{ analysisDate = e.target.value; render(); });
  const wi = document.getElementById('analysis-week-input');
  if(wi) wi.addEventListener('change', e=>{ analysisWeek = e.target.value; render(); });
  const mi = document.getElementById('analysis-month-input');
  if(mi) mi.addEventListener('change', e=>{ analysisMonth = e.target.value; render(); });
}
