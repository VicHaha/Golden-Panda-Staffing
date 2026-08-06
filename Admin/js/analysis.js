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
//
// View-only — no export here. The Stock tab's "Export .xlsx" produces one
// workbook covering both stock and shift data (raw + these same summary
// rollups) for the chosen day/month, so there's a single export in the
// app instead of two overlapping ones.
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

// The daily picker uses the shared combinedLoggedDatesDesc() helper
// (defined in sales.js) — every date with either a stock report or a
// shift report logged, so a day with only a shift report logged still
// shows up here.

function renderAnalysis(){
  const loggedDates = combinedLoggedDatesDesc();
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
    <div class="field-hint" style="margin-top:16px; text-align:center;">Analysis is for viewing — export this data (and shift reports) as Excel from the Stock tab.</div>
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
}

