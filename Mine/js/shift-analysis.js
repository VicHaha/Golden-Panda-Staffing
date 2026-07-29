// ============================================================
// Analysis → Shift Engagement — a self-contained sub-page of the
// Analysis tab (see analysis.js for the Sales sub-page and the view
// switcher). Reads from `shiftReports` (loaded in app.js from the
// shift_reports table, logged by promoters in the Promoters app).
//
// Two sections — Before Break / After Break — each with two pie
// charts: Engagement (Successful vs Not Successful) and Purchase
// Conversion (Bought vs Not Bought), both computed from the same
// rows so nothing extra is fetched. Charts are plain CSS
// conic-gradient circles, no chart library required.
// ============================================================

let shiftAnalysisPeriod = 'daily'; // 'daily' | 'monthly'
let shiftAnalysisDate = todayStr();
let shiftAnalysisMonth = new Date().toISOString().slice(0,7);

const SHIFT_ANALYSIS_SECTIONS = [
  { key: 'before_break', title: 'Before Break (10am–2pm)' },
  { key: 'after_break', title: 'After Break (3pm–6pm)' }
];

// Short "27 Jul" style date, used in the feedback/notes lists below.
function shiftAnalysisShortDate(dateStr){
  return new Date(dateStr+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric', month:'short'});
}

// ---------- date-range helper (mirrors analysisRange() in analysis.js,
// kept separate on purpose so this file has no dependency on the sales
// analysis state and can be dropped/edited independently) ----------

function shiftAnalysisRange(){
  if(shiftAnalysisPeriod === 'daily'){
    return { start: shiftAnalysisDate, end: shiftAnalysisDate };
  }
  const [y, m] = shiftAnalysisMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const start = `${shiftAnalysisMonth}-01`;
  const end = `${shiftAnalysisMonth}-${String(lastDay).padStart(2,'0')}`;
  return { start, end };
}

// ---------- rendering ----------

function renderShiftAnalysis(){
  const { start, end } = shiftAnalysisRange();

  let html = `
    <div class="period-toggle" id="shift-period-toggle">
      <button class="period-btn ${shiftAnalysisPeriod==='daily'?'active':''}" data-shift-period="daily">Daily</button>
      <button class="period-btn ${shiftAnalysisPeriod==='monthly'?'active':''}" data-shift-period="monthly">Monthly</button>
    </div>
  `;

  html += `<div class="analysis-nav">`;
  if(shiftAnalysisPeriod === 'daily'){
    html += `<input id="shift-analysis-date-input" type="date" value="${shiftAnalysisDate}">`;
  }else{
    html += `<input id="shift-analysis-month-input" type="month" value="${shiftAnalysisMonth}">`;
  }
  html += `</div>`;

  SHIFT_ANALYSIS_SECTIONS.forEach(section=>{
    html += renderShiftAnalysisSection(section.title, section.key, start, end);
  });

  return html;
}

function renderShiftAnalysisSection(title, shiftKey, start, end){
  const rows = shiftReports.filter(r => r.shift === shiftKey && r.work_date >= start && r.work_date <= end);

  let html = `<div class="shift-section">`;
  html += `<div class="section-title" style="margin-top:2px;">${esc(title)} <span class="count-pill">${rows.length} entr${rows.length===1?'y':'ies'}</span></div>`;

  if(rows.length === 0){
    html += emptyState('📊', 'No shift reports for this period', "Logged from the Promoter app's Shift Report tab.");
    html += `</div>`;
    return html;
  }

  const engaged = rows.reduce((s,r)=> s + Number(r.engaged||0), 0);
  const successful = rows.reduce((s,r)=> s + Number(r.successful_engagements||0), 0);
  const purchases = rows.reduce((s,r)=> s + Number(r.purchases||0), 0);
  const notSuccessful = Math.max(0, engaged - successful);
  const notBought = Math.max(0, engaged - purchases);

  const timeRows = rows.filter(r => r.avg_engagement_time!=null && r.avg_engagement_time!=='');
  const avgTime = timeRows.length
    ? (timeRows.reduce((s,r)=> s + Number(r.avg_engagement_time||0), 0) / timeRows.length)
    : null;
  const avgTimeDisplay = avgTime!=null ? `${avgTime.toFixed(1)} min` : '—';

  html += `
    <div class="summary-strip shift-summary-strip">
      <div class="stat-card"><div class="num">${engaged}</div><div class="lbl">Engaged</div></div>
      <div class="stat-card"><div class="num">${successful}</div><div class="lbl">Successful</div></div>
      <div class="stat-card"><div class="num">${purchases}</div><div class="lbl">Purchases</div></div>
      <div class="stat-card"><div class="num">${avgTimeDisplay}</div><div class="lbl">Avg time</div></div>
    </div>
  `;

  html += `
    <div class="pie-row">
      <div class="pie-col">
        <div class="pie-col-title">Engagement</div>
        ${renderPieChart(engaged, [
          { label: 'Successful', value: successful, colorVar: '--bamboo' },
          { label: 'Not successful', value: notSuccessful, colorVar: '--brick' }
        ])}
      </div>
      <div class="pie-col">
        <div class="pie-col-title">Purchase conversion</div>
        ${renderPieChart(engaged, [
          { label: 'Bought', value: purchases, colorVar: '--bamboo' },
          { label: 'Not bought', value: notBought, colorVar: '--brick' }
        ])}
      </div>
    </div>
  `;

  html += renderFeedbackList('Customer feedback', rows, 'customer_feedback');
  html += renderFeedbackList('Notes', rows, 'notes');

  html += `</div>`;
  return html;
}

// Reusable list of quoted text entries (customer feedback or notes) for a
// section — newest first, capped so the page stays clean on a busy month.
const FEEDBACK_LIST_CAP = 6;

function renderFeedbackList(title, rows, field){
  const entries = rows
    .filter(r => r[field] && r[field].trim())
    .sort((a,b)=> b.work_date.localeCompare(a.work_date));

  let html = `<div class="feedback-block">`;
  html += `<div class="pie-col-title" style="margin-bottom:8px;">${esc(title)}</div>`;

  if(entries.length === 0){
    html += `<div class="feedback-empty">No ${title.toLowerCase()} logged for this period</div>`;
    html += `</div>`;
    return html;
  }

  // Monthly customer feedback with more than 3 entries: show everything,
  // numbered, instead of the capped list — there's usually more worth
  // reading over a full month than the daily/weekly cap allows for.
  const showAllNumbered = field === 'customer_feedback' && shiftAnalysisPeriod === 'monthly' && entries.length > 3;

  if(showAllNumbered){
    html += `<ol class="feedback-list feedback-list-numbered">`;
    entries.forEach(r=>{
      html += `
        <li class="feedback-item">
          ${esc(r[field])}
          <div class="feedback-meta">${shiftAnalysisShortDate(r.work_date)}${r.promoters ? ' · '+esc(r.promoters.full_name) : ''}${r.stores ? ' · '+esc(r.stores.name) : ''}</div>
        </li>
      `;
    });
    html += `</ol>`;
    html += `</div>`;
    return html;
  }

  html += `<div class="feedback-list">`;
  entries.slice(0, FEEDBACK_LIST_CAP).forEach(r=>{
    html += `
      <div class="feedback-item">
        ${esc(r[field])}
        <div class="feedback-meta">${shiftAnalysisShortDate(r.work_date)}${r.promoters ? ' · '+esc(r.promoters.full_name) : ''}${r.stores ? ' · '+esc(r.stores.name) : ''}</div>
      </div>
    `;
  });
  if(entries.length > FEEDBACK_LIST_CAP){
    html += `<div class="feedback-more">+${entries.length - FEEDBACK_LIST_CAP} more</div>`;
  }
  html += `</div></div>`;

  return html;
}

// Renders one two-slice pie chart (CSS conic-gradient) plus a small
// legend. `slices` is [{label, value, colorVar}, ...] — colorVar is a
// CSS custom property name from :root (e.g. "--bamboo") so the chart
// always matches the app's theme.
function renderPieChart(total, slices){
  let html = `<div class="pie-block">`;

  if(!total){
    html += `<div class="pie-chart pie-chart-empty"><div class="pie-chart-hole"><span>0</span></div></div>`;
  }else{
    let cursor = 0;
    const stops = slices.map(s=>{
      const startDeg = cursor;
      const deg = (Number(s.value||0) / total) * 360;
      cursor += deg;
      return `var(${s.colorVar}) ${startDeg}deg ${cursor}deg`;
    }).join(', ');
    html += `<div class="pie-chart" style="background:conic-gradient(${stops});"><div class="pie-chart-hole"><span>${total}</span></div></div>`;
  }

  html += `<div class="pie-legend">`;
  slices.forEach(s=>{
    const pct = total ? Math.round((Number(s.value||0) / total) * 100) : 0;
    html += `
      <div class="pie-legend-row">
        <span class="pie-dot" style="background:var(${s.colorVar});"></span>
        <span class="pie-legend-label">${esc(s.label)}</span>
        <b>${s.value}</b><i>${pct}%</i>
      </div>
    `;
  });
  html += `</div></div>`;

  return html;
}

function wireShiftAnalysisControls(){
  document.querySelectorAll('#shift-period-toggle .period-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      shiftAnalysisPeriod = btn.dataset.shiftPeriod;
      render();
    });
  });
  const di = document.getElementById('shift-analysis-date-input');
  if(di) di.addEventListener('change', e=>{ shiftAnalysisDate = e.target.value; render(); });
  const mi = document.getElementById('shift-analysis-month-input');
  if(mi) mi.addEventListener('change', e=>{ shiftAnalysisMonth = e.target.value; render(); });
}
