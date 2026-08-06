// ============================================================
// Analysis helpers — shared building blocks used by analysis.js:
// the age-range breakdown, the CSS pie chart renderer, and the
// feedback/notes list. Kept in their own file since they're reused
// across a couple of sections of the unified Analysis tab.
// ============================================================

// Mirrors AGE_RANGE_LABELS in the Promoters app's shift.js — keep in sync.
const AGE_RANGE_LABELS = {
  under_18: 'Under 18',
  '18_25': '18–25',
  '26_35': '26–35',
  '36_50': '36–50',
  '50_plus': '50+'
};
const AGE_RANGE_ORDER = ['under_18', '18_25', '26_35', '36_50', '50_plus'];

// Short "27 Jul" style date, used in the feedback/notes list meta line.
function analysisShortDate(dateStr){
  return new Date(dateStr+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric', month:'short'});
}

// Bar breakdown of the predominant customer age range logged per shift
// entry (one "mostly X" read per report, not a per-customer count).
// Combined across both shift blocks — one read on who's actually
// walking the floor for the selected period.
function renderAgeRangeBreakdown(rows){
  const counted = rows.filter(r => r.customer_age_range);

  if(counted.length === 0){
    return `<div class="feedback-empty">No age range logged for this period</div>`;
  }

  const counts = {};
  AGE_RANGE_ORDER.forEach(k=> counts[k] = 0);
  counted.forEach(r=>{ if(counts[r.customer_age_range] != null) counts[r.customer_age_range]++; });
  const max = Math.max(...Object.values(counts));

  let html = '';
  AGE_RANGE_ORDER.forEach(key=>{
    const qty = counts[key];
    const pct = max ? Math.round((qty/max)*100) : 0;
    html += `
      <div class="bar-row">
        <div class="bar-row-label"><span>${esc(AGE_RANGE_LABELS[key])}</span><b>${qty}</b></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  });

  return html;
}

// Reusable list of quoted text entries (customer feedback or notes) for a
// section — newest first, capped so the page stays clean on a busy month.
// `period` is 'daily' | 'monthly', passed in rather than read from a
// global so this stays independent of which page is calling it.
const FEEDBACK_LIST_CAP = 6;

function renderFeedbackList(title, rows, field, period){
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
  // reading over a full month than the daily cap allows for.
  const showAllNumbered = field === 'customer_feedback' && period === 'monthly' && entries.length > 3;
  const shiftShort = k => k === 'before_break' ? 'Before Break' : k === 'after_break' ? 'After Break' : '';

  const renderItem = r => `
    ${esc(r[field])}
    <div class="feedback-meta">${analysisShortDate(r.work_date)}${shiftShort(r.shift)?' · '+shiftShort(r.shift):''}${r.promoters ? ' · '+esc(displayName(r.promoters)) : ''}${r.stores ? ' · '+esc(r.stores.name) : ''}</div>
  `;

  if(showAllNumbered){
    html += `<ol class="feedback-list feedback-list-numbered">`;
    entries.forEach(r=>{ html += `<li class="feedback-item">${renderItem(r)}</li>`; });
    html += `</ol>`;
    html += `</div>`;
    return html;
  }

  html += `<div class="feedback-list">`;
  entries.slice(0, FEEDBACK_LIST_CAP).forEach(r=>{
    html += `<div class="feedback-item">${renderItem(r)}</div>`;
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
