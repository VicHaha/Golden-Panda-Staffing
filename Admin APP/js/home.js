// ============================================================
// Home — the daily operations dashboard (admin app only):
//   • Daily | Monthly toggle + Excel export (the same export the old Sales
//     tab had, see exportStockExcel in js/sales.js)
//   • Sales Record  — SKUs that sold in the chosen period, best seller first
//   • Stock Record  — SKUs whose closing stock is low, and at which outlet
//   • On Duty       — everyone scheduled today, grouped by outlet
// Tapping a card jumps to the matching section.
// ============================================================

function clock12(time){
  const [h, m] = String(time).split(':').map(Number);
  return { text: m ? `${h%12||12}:${String(m).padStart(2,'0')}` : `${h%12||12}`, meridiem: h >= 12 ? 'pm' : 'am' };
}

// "10:00"–"18:00" -> "10–6pm" (the way the wireframe writes it).
function formatShiftRange(start, end){
  if(!start || !end) return '';
  const s = clock12(start), e = clock12(end);
  if(s.meridiem === e.meridiem || (s.meridiem === 'am' && e.meridiem === 'pm')) return `${s.text}–${e.text}${e.meridiem}`;
  return `${s.text}${s.meridiem}–${e.text}${e.meridiem}`;
}

// A Home section: heading row with a "View" link to the full screen, then the list.
function homeCard(tab, title, body){
  return `<section class="panel">
    <header class="panel-head"><h2>${esc(title)}</h2><button type="button" class="link-btn" onclick="switchTab('${tab}')">View ›</button></header>
    <div class="panel-body">${body}</div>
  </section>`;
}

// [[sku, qty], ...] for the period picked in the export controls.
function homeSalesRecord(){
  const daily = stockExportMode === 'daily';
  const inPeriod = date => daily ? date === stockExportDate : date.startsWith(stockExportMonth);
  const totals = new Map();
  salesReports.forEach(row=>{
    if(!inPeriod(row.work_date) || isFreeItem(row) || isGiveaway(row.product_name)) return;
    const key = canonicalSkuName(row.product_name);
    totals.set(key, (totals.get(key) || 0) + Number(row.sales_qty || 0));
  });
  return [...totals].filter(([,qty])=>qty > 0).sort((a,b)=>b[1]-a[1] || compareSkuNames(a[0],b[0]));
}

function renderHomeSalesRecord(){
  const record = homeSalesRecord();
  const period = stockExportMode === 'daily' ? formatDateShort(stockExportDate) : new Date(stockExportMonth+'-01T00:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const body = record.length
    ? `<ul class="home-list">${record.map(([name,qty])=>`<li><span>${esc(name)}</span><b>${qty}</b></li>`).join('')}</ul>`
    : `<p class="home-empty">No sales recorded for ${esc(period)}.</p>`;
  return homeCard('sales','Sales Record', body);
}

function renderHomeStockRecord(date){
  const low = lowStockEntries(date);
  let body;
  if(!stockDatesDesc().length){
    body = `<p class="home-empty">No stock records yet.</p>`;
  }else if(!low.length){
    body = `<p class="home-ok">All stock OK</p>`;
  }else{
    const byOutlet = new Map();
    low.forEach(item=>{
      if(!byOutlet.has(item.outlet.key)) byOutlet.set(item.outlet.key, { name:item.outlet.name, items:[] });
      byOutlet.get(item.outlet.key).items.push(item);
    });
    body = [...byOutlet.values()].map(group=>`
      <div class="home-outlet">${esc(group.name)}</div>
      <ul class="home-list">${group.items.map(item=>`<li><span>${esc(canonicalSkuName(item.row.product_name))}</span><b class="home-low">${item.closing} left</b></li>`).join('')}</ul>
    `).join('');
  }
  return homeCard('stock','Stock Record', body);
}

function renderHomeOnDuty(date){
  // Everyone scheduled on the chosen day — Promoter, Assistant and Mascot — by outlet.
  const dayJobs = jobs
    .filter(job=>job.work_date === date)
    .sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)) || displayName(a.promoters).localeCompare(displayName(b.promoters)));
  const byStore = new Map();
  dayJobs.forEach(job=>{
    const name = job.stores ? job.stores.name : 'No outlet set';
    if(!byStore.has(name)) byStore.set(name, []);
    byStore.get(name).push(job);
  });
  const body = [...byStore.keys()].sort((a,b)=>a.localeCompare(b)).map(name=>`
      <div class="home-outlet">${esc(name)}</div>
      <ul class="home-list home-duty-list">${byStore.get(name).map(job=>{
        const role = job.position || 'Promoter';
        return `<li>
          <span class="home-duty-name">${job.promoters ? esc(displayName(job.promoters)) : '<em>Not assigned</em>'}</span>
          <span class="job-position job-position-${esc(role.toLowerCase())}">${esc(role)}</span>
          <span class="home-duty-time">${esc(formatShiftRange(job.start_time, job.end_time))}</span>
        </li>`;
      }).join('')}</ul>
    `).join('');
  return homeCard('roster','On Duty', body);
}

function isWorkingDate(date){
  return jobs.some(job=>job.work_date === date);
}

function renderNotWorkingCard(label){
  return `<section class="home-card"><p class="home-empty">${esc(label)} is not a working date.</p></section>`;
}

function renderHome(){
  const today = todayStr();
  // The day picker only offers WORKING dates (days with a job on the Schedule):
  // today if it is one, plus past working dates. Never future or non-working days.
  const dateOptions = [...new Set(jobs.map(job=>job.work_date).filter(date=>date <= today))].sort((a,b)=>b.localeCompare(a));
  // If today isn't a working date (or the chosen day isn't one), show the most
  // recent working day instead — there is always one previous record to see.
  if(!dateOptions.includes(stockExportDate)) stockExportDate = dateOptions[0] || today;
  const daily = stockExportMode === 'daily';

  const controls = `
    <div class="home-controls">
      <div class="segmented" role="group" aria-label="Period">
        <button class="mode-btn ${daily?'active':''}" id="stock-export-mode-daily">Daily</button>
        <button class="mode-btn ${!daily?'active':''}" id="stock-export-mode-monthly">Monthly</button>
      </div>
      <button class="btn btn-ghost home-export" id="stock-export-btn">Export</button>
    </div>
    <div class="month-picker-row">
      ${daily
        ? `<select id="stock-date-input" aria-label="Day">${dateOptions.map(d=>`<option value="${d}" ${d===stockExportDate?'selected':''}>${d===today?'Today · ':''}${formatDateShort(d)}</option>`).join('')}</select>`
        : `<input id="stock-month-input" type="month" value="${stockExportMonth}" aria-label="Month">`}
    </div>`;

  // Everything on Home follows the day picked above (Daily): Sales Record,
  // Stock Record and On Duty all describe that same day, straight from the
  // Schedule. Monthly mode shows just the month's Sales Record.
  const homeDate = daily ? stockExportDate : today;
  const homeLabel = homeDate === today ? 'Today' : formatDateShort(homeDate);
  if(!daily) return controls + renderHomeSalesRecord();
  if(!isWorkingDate(homeDate)) return controls + renderNotWorkingCard(homeLabel);

  const record = homeSalesRecord();
  const soldUnits = record.reduce((sum,[,qty])=>sum+qty,0);
  const outletCount = jobStoreIdsForDate(homeDate).size;
  // Total SKUs on that day (not just the ones that sold): distinct sellable products across the outlets.
  const totalSkus = new Set(salesReports.filter(r=>r.work_date === homeDate && !isFreeItem(r)).map(r=>canonicalSkuName(r.product_name))).size;
  const kpis = `<div class="kpi-row kpi-3">
    <div class="kpi static"><small>Sold</small><b>${soldUnits}</b></div>
    <div class="kpi static"><small>SKUs</small><b>${totalSkus}</b></div>
    <div class="kpi static"><small>Outlets</small><b>${outletCount}</b></div>
  </div>`;
  return controls + kpis + renderHomeSalesRecord() + renderHomeStockRecord(homeDate) + renderHomeOnDuty(homeDate);
}
