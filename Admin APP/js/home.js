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

function homeCard(tab, tag, body){
  return `<section class="home-card" role="button" tabindex="0" onclick="switchTab('${tab}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();switchTab('${tab}')}" aria-label="Open ${esc(tag)}">
    <span class="home-card-tag">${esc(tag)}</span>
    ${body}
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

function renderHomeStockRecord(){
  const date = stockActiveDate();
  const low = lowStockEntries(date);
  let body;
  if(!stockDatesDesc().length){
    body = `<p class="home-empty">No stock records yet.</p>`;
  }else if(!low.length){
    body = `<p class="home-ok">✓ All stock OK</p>`;
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

function renderHomeOnDuty(){
  // Everyone scheduled today — Promoter, Assistant and Mascot — by outlet.
  const dayJobs = jobs
    .filter(job=>job.work_date === todayStr())
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
  const loggedDates = combinedLoggedDatesDesc();
  const today = todayStr();
  const dateOptions = [...new Set([today, ...loggedDates])].sort((a,b)=>b.localeCompare(a));
  if(!dateOptions.includes(stockExportDate)) stockExportDate = today;
  const daily = stockExportMode === 'daily';

  const controls = `
    <div class="home-controls">
      <button class="mode-btn ${daily?'active':''}" id="stock-export-mode-daily">Daily</button>
      <button class="mode-btn ${!daily?'active':''}" id="stock-export-mode-monthly">Monthly</button>
      <button class="btn btn-gold home-export" id="stock-export-btn">Export</button>
    </div>
    <div class="month-picker-row">
      ${daily
        ? `<select id="stock-date-input" aria-label="Day">${dateOptions.map(d=>`<option value="${d}" ${d===stockExportDate?'selected':''}>${d===today?'Today · ':''}${formatDateShort(d)}</option>`).join('')}</select>`
        : `<input id="stock-month-input" type="month" value="${stockExportMonth}" aria-label="Month">`}
    </div>`;

  // Records only show for working dates (days that have jobs on the Schedule).
  const salesCard = daily && !isWorkingDate(stockExportDate)
    ? renderNotWorkingCard(stockExportDate === today ? 'Today' : formatDateShort(stockExportDate))
    : renderHomeSalesRecord();
  const todayCards = isWorkingDate(today)
    ? renderHomeStockRecord() + renderHomeOnDuty()
    : renderNotWorkingCard('Today');
  return controls + salesCard + todayCards;
}
