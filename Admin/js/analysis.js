// ============================================================
// Analysis — one unified market-analysis page for a date/month,
// combining Stock (sales_reports) and Shift Report (shift_reports)
// data instead of splitting them into two separate sub-pages with
// their own period controls. One period control drives every
// section below, in this order:
//
//   1. Overview            — the four headline numbers
//   2. Insights             — 1-2 plain-English callouts
//   3. Store performance    — units sold + engagement side by side, per store
//   4. Product performance  — top sellers, then free-item giveaways
//   5. Shift engagement     — Before Break vs After Break conversion
//   6. Customer age range   — combined across both shift blocks
//   7. Customer feedback & notes
//   8. Export
//
// Reads from `salesReports` and `shiftReports`, both already loaded
// in app.js — nothing extra is fetched here.
// ============================================================

let analysisPeriod = 'daily'; // 'daily' | 'monthly'
let analysisDate = todayStr();
let analysisMonth = new Date().toISOString().slice(0,7);

const ANALYSIS_SHIFT_BLOCKS = [
  { key: 'before_break', title: 'Before Break', full: 'Before Break (10am–2pm)' },
  { key: 'after_break', title: 'After Break', full: 'After Break (3pm–6pm)' }
];

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

// Union of every date that has *either* a stock report or a shift
// report logged, most recent first — so the daily picker covers days
// where only one of the two was logged, not just stock.
function analysisLoggedDatesDesc(){
  const set = new Set([...stockLoggedDatesDesc(), ...shiftReports.map(r=>r.work_date)]);
  return [...set].sort((a,b)=> b.localeCompare(a));
}

function renderAnalysis(){
  const loggedDates = analysisLoggedDatesDesc();
  if(analysisPeriod === 'daily' && loggedDates.length && !loggedDates.includes(analysisDate)){
    analysisDate = loggedDates[0];
  }

  const { start, end } = analysisRange();

  let html = `
    <div class="period-toggle" id="analysis-period-toggle">
      <button class="period-btn ${analysisPeriod==='daily'?'active':''}" data-analysis-period="daily">Daily</button>
      <button class="period-btn ${analysisPeriod==='monthly'?'active':''}" data-analysis-period="monthly">Monthly</button>
    </div>
    <div class="analysis-nav">
      ${analysisPeriod==='daily'
        ? (loggedDates.length
            ? `<select id="analysis-date-input">${loggedDates.map(d=>`<option value="${d}" ${d===analysisDate?'selected':''}>${formatDateShort(d)}</option>`).join('')}</select>`
            : `<select id="analysis-date-input" disabled><option>No dates logged yet</option></select>`)
        : `<input id="analysis-month-input" type="month" value="${analysisMonth}">`}
    </div>
  `;

  const salesRows = salesReports.filter(r => r.work_date >= start && r.work_date <= end);
  const shiftRows = shiftReports.filter(r => r.work_date >= start && r.work_date <= end);

  if(salesRows.length === 0 && shiftRows.length === 0){
    html += emptyState('📊', 'No data for this period', 'Log stock from the Stock tab, or shift reports from the Promoters app, to see analysis here.');
    return html;
  }

  html += renderOverviewStrip(salesRows, shiftRows);
  html += renderAnalysisInsights(salesRows, shiftRows);
  html += renderStorePerformance(salesRows, shiftRows);
  html += renderProductPerformance(salesRows);
  html += renderEngagementSection(shiftRows);
  html += renderAgeRangeSection(shiftRows);
  html += renderFeedbackSection(shiftRows);

  html += `
    <div class="month-picker-row" style="margin-top:16px;">
      <button class="btn btn-gold" id="analysis-export-btn" style="width:100%;">Export .xlsx</button>
    </div>
  `;

  return html;
}

// ---------- 1. Overview ----------
function renderOverviewStrip(salesRows, shiftRows){
  const soldQty = salesRows.filter(r=>!isFreeItem(r)).reduce((s,r)=> s + Number(r.sales_qty||0), 0);
  const engaged = shiftRows.reduce((s,r)=> s + Number(r.engaged||0), 0);
  const purchases = shiftRows.reduce((s,r)=> s + Number(r.purchases||0), 0);
  const conversion = engaged > 0 ? Math.round((purchases/engaged)*100) : null;
  const timeRows = shiftRows.filter(r => r.avg_engagement_time!=null && r.avg_engagement_time!=='');
  const avgTime = timeRows.length ? (timeRows.reduce((s,r)=> s + Number(r.avg_engagement_time||0), 0) / timeRows.length) : null;

  return `
    <div class="summary-strip">
      <div class="stat-card"><div class="num">${soldQty}</div><div class="lbl">Units sold</div></div>
      <div class="stat-card"><div class="num">${engaged}</div><div class="lbl">Engaged</div></div>
      <div class="stat-card"><div class="num">${conversion!=null?conversion+'%':'—'}</div><div class="lbl">Conversion</div></div>
      <div class="stat-card"><div class="num">${avgTime!=null?avgTime.toFixed(1)+'m':'—'}</div><div class="lbl">Avg time</div></div>
    </div>
  `;
}

// ---------- 2. Insights ----------
// Plain-English read on the numbers below — top seller and whichever
// shift block is converting better. Both need enough data to be
// meaningful, so either can be skipped for a quiet period.
function renderAnalysisInsights(salesRows, shiftRows){
  let html = '';

  const soldByProduct = {};
  salesRows.filter(r=>!isFreeItem(r)).forEach(r=>{
    const qty = Number(r.sales_qty||0);
    if(!qty) return;
    soldByProduct[r.product_name] = (soldByProduct[r.product_name]||0) + qty;
  });
  const soldRanked = Object.entries(soldByProduct).sort((a,b)=>b[1]-a[1]);
  const totalSold = soldRanked.reduce((s,[,q])=>s+q, 0);
  if(soldRanked.length){
    const [topName, topQty] = soldRanked[0];
    const share = totalSold ? Math.round((topQty/totalSold)*100) : 0;
    html += `
      <div class="insight-callout">
        <span class="insight-callout-icon">🏆</span>
        <div><b>${esc(topName)}</b> is the top seller this period — ${topQty} units, ${share}% of everything sold.</div>
      </div>
    `;
  }

  const blockStats = ANALYSIS_SHIFT_BLOCKS.map(block=>{
    const rows = shiftRows.filter(r => r.shift === block.key);
    const engaged = rows.reduce((s,r)=> s + Number(r.engaged||0), 0);
    const purchases = rows.reduce((s,r)=> s + Number(r.purchases||0), 0);
    const rate = engaged > 0 ? (purchases / engaged) * 100 : null;
    return { title: block.title, rate };
  }).filter(s => s.rate !== null);

  if(blockStats.length === 2){
    const [a, b] = blockStats;
    const better = a.rate >= b.rate ? a : b;
    const worse = a.rate >= b.rate ? b : a;
    html += `
      <div class="insight-callout">
        <span class="insight-callout-icon">🔥</span>
        <div>
          ${better.rate === worse.rate
            ? `Both shift blocks are converting about the same — <b>${better.rate.toFixed(0)}%</b> of engagements turn into a purchase.`
            : `<b>${esc(better.title)}</b> is converting better — <b>${better.rate.toFixed(0)}%</b> of engagements became a purchase, vs ${worse.rate.toFixed(0)}% for ${esc(worse.title)}.`}
        </div>
      </div>
    `;
  }

  return html;
}

// ---------- 3. Store performance ----------
// The main "integrated" view — units sold and customer engagement,
// side by side per store, so the client can see which locations are
// actually working rather than reading stock and shift numbers apart.
function renderStorePerformance(salesRows, shiftRows){
  const byStore = {};
  const bump = (name) => byStore[name] || (byStore[name] = { sold:0, engaged:0, purchases:0 });

  salesRows.filter(r=>!isFreeItem(r)).forEach(r=>{
    const name = r.stores ? r.stores.name : '(store removed)';
    bump(name).sold += Number(r.sales_qty||0);
  });
  shiftRows.forEach(r=>{
    const name = r.stores ? r.stores.name : '(store not specified)';
    const s = bump(name);
    s.engaged += Number(r.engaged||0);
    s.purchases += Number(r.purchases||0);
  });

  const ranked = Object.entries(byStore)
    .filter(([,v]) => v.sold > 0 || v.engaged > 0)
    .sort((a,b)=> b[1].sold - a[1].sold || b[1].engaged - a[1].engaged);

  let html = `<div class="section-title" style="margin-top:2px;">Store performance</div>`;

  if(ranked.length === 0){
    html += emptyState('🏬', 'No store data for this period', 'Stock and shift reports both need a store selected to show up here.');
    return html;
  }

  ranked.forEach(([name, v], i)=>{
    const conversion = v.engaged > 0 ? Math.round((v.purchases/v.engaged)*100) : null;
    html += `
      <div class="analysis-table-row">
        <div style="display:flex; align-items:center; min-width:0;">
          <span class="analysis-rank">${i+1}</span>
          <span>${esc(name)}</span>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div><b>${v.sold}</b> sold</div>
          <div style="font-size:11px; color:var(--ink-soft); margin-top:1px;">${v.engaged} engaged${conversion!=null?` · ${conversion}% conv.`:''}</div>
        </div>
      </div>
    `;
  });

  return html;
}

// ---------- 4. Product performance ----------
function renderProductPerformance(salesRows){
  let html = '';

  const soldByProduct = {};
  const givenByProduct = {};
  salesRows.forEach(r=>{
    const qty = Number(r.sales_qty||0);
    if(!qty) return;
    const bucket = isFreeItem(r) ? givenByProduct : soldByProduct;
    bucket[r.product_name] = (bucket[r.product_name]||0) + qty;
  });

  const soldRanked = Object.entries(soldByProduct).sort((a,b)=>b[1]-a[1]);
  const totalSold = soldRanked.reduce((s,[,q])=>s+q, 0);
  const maxSold = soldRanked.length ? soldRanked[0][1] : 0;

  html += `<div class="section-title" style="margin-top:22px;">Top products sold <span class="count-pill">${totalSold} sold</span></div>`;

  if(soldRanked.length === 0){
    html += emptyState('📦', 'Nothing sold in this period', 'Free-item giveaways aren\'t counted here — see below.');
  }else{
    soldRanked.forEach(([name, qty])=>{
      const pct = maxSold ? Math.round((qty/maxSold)*100) : 0;
      html += `
        <div class="bar-row">
          <div class="bar-row-label"><span>${esc(name)}</span><b>${qty}</b></div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    });
  }

  const givenRanked = Object.entries(givenByProduct).sort((a,b)=>b[1]-a[1]);
  if(givenRanked.length){
    const totalGiven = givenRanked.reduce((s,[,q])=>s+q, 0);
    html += `<div class="section-title" style="margin-top:18px;">Free items given away <span class="count-pill">${totalGiven} given</span></div>`;
    givenRanked.forEach(([name, qty], i)=>{
      html += `
        <div class="analysis-table-row analysis-gift-row">
          <div style="display:flex; align-items:center; min-width:0;">
            <span class="analysis-rank">${i+1}</span>
            <span>${esc(name)}</span>
          </div>
          <div><b>${qty}</b></div>
        </div>
      `;
    });
  }

  return html;
}

// ---------- 5. Shift engagement ----------
// Before Break vs After Break, side by side — purchase-conversion pie
// per block plus the raw engaged/purchases counts underneath.
function renderEngagementSection(shiftRows){
  let html = `<div class="section-title" style="margin-top:22px;">Customer engagement by shift block</div>`;

  if(shiftRows.length === 0){
    html += emptyState('📊', 'No shift reports for this period', "Logged from the Promoter app's Shift Report tab.");
    return html;
  }

  html += `<div class="pie-row">`;
  ANALYSIS_SHIFT_BLOCKS.forEach(block=>{
    const rows = shiftRows.filter(r => r.shift === block.key);
    const engaged = rows.reduce((s,r)=> s + Number(r.engaged||0), 0);
    const purchases = rows.reduce((s,r)=> s + Number(r.purchases||0), 0);
    const notBought = Math.max(0, engaged - purchases);

    html += `
      <div class="pie-col">
        <div class="pie-col-title">${esc(block.title)}</div>
        ${renderPieChart(engaged, [
          { label: 'Bought', value: purchases, colorVar: '--bamboo' },
          { label: 'Not bought', value: notBought, colorVar: '--brick' }
        ])}
      </div>
    `;
  });
  html += `</div>`;

  return html;
}

// ---------- 6. Customer age range ----------
function renderAgeRangeSection(shiftRows){
  let html = `<div class="section-title" style="margin-top:22px;">Customer age range</div>`;
  html += renderAgeRangeBreakdown(shiftRows);
  return html;
}

// ---------- 7. Feedback & notes ----------
function renderFeedbackSection(shiftRows){
  let html = `<div class="section-title" style="margin-top:22px;">Customer feedback &amp; notes</div>`;
  html += `<div style="display:flex; flex-direction:column; gap:16px;">`;
  html += renderFeedbackList('Customer feedback', shiftRows, 'customer_feedback', analysisPeriod);
  html += renderFeedbackList('Notes', shiftRows, 'notes', analysisPeriod);
  html += `</div>`;
  return html;
}

// ---------- controls ----------
function wireAnalysisControls(){
  document.querySelectorAll('#analysis-period-toggle .period-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      analysisPeriod = btn.dataset.analysisPeriod;
      render();
    });
  });
  const di = document.getElementById('analysis-date-input');
  if(di && !di.disabled) di.addEventListener('change', e=>{ analysisDate = e.target.value; render(); });
  const mi = document.getElementById('analysis-month-input');
  if(mi) mi.addEventListener('change', e=>{ analysisMonth = e.target.value; render(); });
  const eb = document.getElementById('analysis-export-btn');
  if(eb) eb.addEventListener('click', exportAnalysisExcel);
}

// ---------- export ----------
// One workbook, several sheets. The first two sheets are the complete,
// unaggregated data for the period — every stock report row and every
// shift report row, exactly as logged — so the file is actually useful
// for further analysis in Excel, not just a read-only summary. The
// summary sheets that follow keep the same "at a glance" rollups the
// on-screen Analysis tab shows.
function exportAnalysisExcel(){
  const { start, end } = analysisRange();
  const salesRows = salesReports.filter(r => r.work_date >= start && r.work_date <= end);
  const shiftRows = shiftReports.filter(r => r.work_date >= start && r.work_date <= end);

  if(salesRows.length === 0 && shiftRows.length === 0){
    showToast(`No data to export for this ${analysisPeriod === 'daily' ? 'date' : 'month'}`);
    return;
  }

  const wb = XLSX.utils.book_new();
  const shiftBlockLabel = k => k === 'before_break' ? 'Before Break' : k === 'after_break' ? 'After Break' : (k||'');

  // ---- Raw: Stock Reports — every logged row, unaggregated ----
  const stockRawRows = [...salesRows]
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || (a.product_name||'').localeCompare(b.product_name||''))
    .map(r=>({
      'Date': r.work_date,
      'Store': r.stores ? r.stores.name : '',
      'Logged By': r.promoters ? displayName(r.promoters) : '',
      'Product': r.product_name,
      'Free Item?': isFreeItem(r) ? 'Yes' : 'No',
      'Opening Qty': Number(r.opening_qty||0),
      'Sales / Given Qty': Number(r.sales_qty||0),
      'Closing Qty': Number(r.closing_qty||0),
      'Remarks': r.remarks || ''
    }));
  const wsStockRaw = XLSX.utils.json_to_sheet(stockRawRows);
  wsStockRaw['!cols'] = [{wch:12},{wch:20},{wch:18},{wch:28},{wch:11},{wch:12},{wch:16},{wch:12},{wch:30}];
  XLSX.utils.book_append_sheet(wb, wsStockRaw, 'Stock Reports (Raw)');

  // ---- Raw: Shift Reports — every logged row, unaggregated ----
  const shiftRawRows = [...shiftRows]
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || (a.shift||'').localeCompare(b.shift||''))
    .map(r=>({
      'Date': r.work_date,
      'Shift Block': shiftBlockLabel(r.shift),
      'Store': r.stores ? r.stores.name : '',
      'Promoter': r.promoters ? displayName(r.promoters) : '',
      'Engaged': Number(r.engaged||0),
      'Successful Engagements': Number(r.successful_engagements||0),
      'Purchases': Number(r.purchases||0),
      'Conversion %': Number(r.engaged||0) > 0 ? Math.round((Number(r.purchases||0)/Number(r.engaged||0))*100) : '',
      'Avg Engagement Time (min)': r.avg_engagement_time!=null && r.avg_engagement_time!=='' ? Number(r.avg_engagement_time) : '',
      'Customer Age Range': r.customer_age_range ? (AGE_RANGE_LABELS[r.customer_age_range] || r.customer_age_range) : '',
      'Customer Feedback': r.customer_feedback || '',
      'Notes': r.notes || ''
    }));
  const wsShiftRaw = XLSX.utils.json_to_sheet(shiftRawRows);
  wsShiftRaw['!cols'] = [{wch:12},{wch:13},{wch:20},{wch:18},{wch:9},{wch:14},{wch:11},{wch:12},{wch:14},{wch:16},{wch:40},{wch:40}];
  XLSX.utils.book_append_sheet(wb, wsShiftRaw, 'Shift Reports (Raw)');

  // Products
  const soldByProduct = {}, givenByProduct = {};
  salesRows.forEach(r=>{
    const qty = Number(r.sales_qty||0);
    const bucket = isFreeItem(r) ? givenByProduct : soldByProduct;
    bucket[r.product_name] = (bucket[r.product_name]||0) + qty;
  });
  const productRows = [
    ...Object.entries(soldByProduct).sort((a,b)=>b[1]-a[1]).map(([name, qty])=>({ 'Product': name, 'Type': 'Product', 'Quantity': qty })),
    ...Object.entries(givenByProduct).sort((a,b)=>b[1]-a[1]).map(([name, qty])=>({ 'Product': name, 'Type': 'Giveaway (free)', 'Quantity': qty }))
  ];
  const wsProducts = XLSX.utils.json_to_sheet(productRows);
  wsProducts['!cols'] = [{wch:28},{wch:16},{wch:12}];
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Products');

  // Store performance
  const byStore = {};
  const bump = (name) => byStore[name] || (byStore[name] = { sold:0, engaged:0, purchases:0 });
  salesRows.filter(r=>!isFreeItem(r)).forEach(r=>{
    bump(r.stores ? r.stores.name : '(store removed)').sold += Number(r.sales_qty||0);
  });
  shiftRows.forEach(r=>{
    const s = bump(r.stores ? r.stores.name : '(store not specified)');
    s.engaged += Number(r.engaged||0);
    s.purchases += Number(r.purchases||0);
  });
  const storeRows = Object.entries(byStore)
    .filter(([,v]) => v.sold > 0 || v.engaged > 0)
    .sort((a,b)=> b[1].sold - a[1].sold)
    .map(([name, v])=>({
      'Store': name,
      'Units Sold': v.sold,
      'Customers Engaged': v.engaged,
      'Purchases': v.purchases,
      'Conversion %': v.engaged > 0 ? Math.round((v.purchases/v.engaged)*100) : ''
    }));
  const wsStores = XLSX.utils.json_to_sheet(storeRows);
  wsStores['!cols'] = [{wch:22},{wch:12},{wch:16},{wch:12},{wch:13}];
  XLSX.utils.book_append_sheet(wb, wsStores, 'Store Performance');

  // Shift engagement
  const shiftSummaryRows = ANALYSIS_SHIFT_BLOCKS.map(block=>{
    const rows = shiftRows.filter(r => r.shift === block.key);
    const engaged = rows.reduce((s,r)=> s + Number(r.engaged||0), 0);
    const successful = rows.reduce((s,r)=> s + Number(r.successful_engagements||0), 0);
    const purchases = rows.reduce((s,r)=> s + Number(r.purchases||0), 0);
    const timeRows = rows.filter(r => r.avg_engagement_time!=null && r.avg_engagement_time!=='');
    const avgTime = timeRows.length ? (timeRows.reduce((s,r)=> s + Number(r.avg_engagement_time||0), 0) / timeRows.length) : null;
    return {
      'Shift Block': block.full,
      'Engaged': engaged,
      'Successful': successful,
      'Purchases': purchases,
      'Conversion %': engaged > 0 ? Math.round((purchases/engaged)*100) : '',
      'Avg Engagement Time (min)': avgTime!=null ? Number(avgTime.toFixed(1)) : ''
    };
  });
  const wsShift = XLSX.utils.json_to_sheet(shiftSummaryRows);
  wsShift['!cols'] = [{wch:22},{wch:10},{wch:11},{wch:11},{wch:13},{wch:22}];
  XLSX.utils.book_append_sheet(wb, wsShift, 'Shift Engagement');

  // Age range
  const ageCounts = {};
  AGE_RANGE_ORDER.forEach(k=> ageCounts[k] = 0);
  shiftRows.filter(r=>r.customer_age_range).forEach(r=>{ if(ageCounts[r.customer_age_range]!=null) ageCounts[r.customer_age_range]++; });
  const ageRows = AGE_RANGE_ORDER.map(k=>({ 'Age Range': AGE_RANGE_LABELS[k], 'Count': ageCounts[k] }));
  const wsAge = XLSX.utils.json_to_sheet(ageRows);
  wsAge['!cols'] = [{wch:14},{wch:10}];
  XLSX.utils.book_append_sheet(wb, wsAge, 'Age Range');

  // Feedback & notes
  const feedbackRows = shiftRows
    .filter(r => (r.customer_feedback && r.customer_feedback.trim()) || (r.notes && r.notes.trim()))
    .sort((a,b)=> a.work_date.localeCompare(b.work_date))
    .flatMap(r=>{
      const rows = [];
      const shiftLabel = r.shift === 'before_break' ? 'Before Break' : r.shift === 'after_break' ? 'After Break' : r.shift;
      if(r.customer_feedback && r.customer_feedback.trim()){
        rows.push({ 'Date': r.work_date, 'Shift': shiftLabel, 'Promoter': r.promoters?displayName(r.promoters):'', 'Store': r.stores?r.stores.name:'', 'Type': 'Feedback', 'Text': r.customer_feedback });
      }
      if(r.notes && r.notes.trim()){
        rows.push({ 'Date': r.work_date, 'Shift': shiftLabel, 'Promoter': r.promoters?displayName(r.promoters):'', 'Store': r.stores?r.stores.name:'', 'Type': 'Notes', 'Text': r.notes });
      }
      return rows;
    });
  const wsFeedback = XLSX.utils.json_to_sheet(feedbackRows);
  wsFeedback['!cols'] = [{wch:12},{wch:13},{wch:16},{wch:18},{wch:9},{wch:50}];
  XLSX.utils.book_append_sheet(wb, wsFeedback, 'Feedback');

  const periodLabel = analysisPeriod === 'daily' ? analysisDate : analysisMonth;
  XLSX.writeFile(wb, `Golden_Panda_Market_Analysis_${analysisPeriod === 'daily' ? 'Daily' : 'Monthly'}_${periodLabel}.xlsx`);
  showToast('Excel file downloaded');
}
