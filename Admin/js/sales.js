// ============================================================
// Sales — per-product opening/sold/closing counts, grouped by working
// date, expand/collapse per date, plus a general feedback note per
// date. This is the office/admin app — admin can edit or delete any
// date's sales records, past included. (The promoter-facing app still
// locks past dates for promoters; see its own js/sales.js.)
//
// Stock-by-location and warehouse figures are edited from the separate
// Stock Management tab (js/stock.js) now, not from here — see that file.
//
// Also owns the app's one and only Excel export (see exportStockExcel
// below) — one workbook per day/month, 6 sheets: Raw Sales Data,
// Estimated Sales during Non-event Day, Sales Summary by Outlet, Raw
// Stock Data, Outlet Performance, Customer Analysis.
// ============================================================

let salesExpandedDates = new Set(); // which date groups are currently expanded
let stockExportMode = 'monthly'; // 'monthly' | 'daily'
let stockExportMonth = new Date().toISOString().slice(0,7);
let stockExportDate = todayStr();

// Customer-age-range label map — previously lived in the (now-removed)
// Analysis tab's js/analysis.js and js/shift-analysis.js; the Excel
// export's Customer Analysis sheet still needs it, so it moved here
// rather than being deleted along with that tab. Mirrors the same map in
// the Promoters app's shift.js — keep in sync.
const AGE_RANGE_LABELS = {
  under_18: 'Under 18',
  '18_25': '18–25',
  '26_35': '26–35',
  '36_50': '36–50',
  '50_plus': '50+'
};

// Suggested products — shown as autocomplete, but the field stays free
// text so new products can always be typed in and added on the fly.
// These are the full stored names (base product + variation baked in)
// used to auto-seed each working date's rows — see ensureStockRowsForDate.
const PRODUCT_SUGGESTIONS = [
  'Gift Set',
  'Flyer',
  'Small Samples',
  'Coupons',
  'Bio Dishwash 1L',
  'Refill Bio Dishwash 480ml'
];

// Product name and variation are entered as two separate fields in the
// form (see openSalesForm) but stored together as one string, e.g.
// "Bio Dishwash 1L (Bidara)" — same format as before, so tab
// categorization, carry-forward matching, and legacy rows all keep
// working unchanged. VARIATIONS is just the suggested/starter list for
// the Variation field's autocomplete (see getVariationSuggestions) —
// like the product name field, it stays free text so anyone can type a
// new flavor/variation on the fly and it's stored and parsed the same
// way as the preset ones.
const VARIATIONS = ['Bidara', 'Ginger', 'Melon'];
const VARIANT_BASE_PRODUCTS = ['Bio Dishwash 1L', 'Refill Bio Dishwash 480ml'];

// Splits a stored product_name like "Bio Dishwash 1L (Bidara)" back into
// its base name and variation, so the form can show them as two fields
// and the list can show just the variation. Any trailing "(...)" is
// treated as the variation — not just the preset list — since the field
// is free text now. Names without a parenthesised suffix (giveaways,
// custom products with no variation) come back with variation: ''.
function parseProductName(name){
  const raw = (name || '').trim();
  const m = /^(.*)\s\(([^)]+)\)\s*$/.exec(raw);
  if(m) return { base: m[1].trim(), variation: m[2].trim() };
  return { base: raw, variation: '' };
}
function composeProductName(base, variation){
  base = (base || '').trim();
  variation = (variation || '').trim();
  return variation ? `${base} (${variation})` : base;
}
// The name shown in the stock list — just the variation when there is
// one (the tab already says "1L Bio Dishwash" or "Refill", so repeating
// the full name is redundant), else the full product name.
function displayProductName(report){
  const { base, variation } = parseProductName(report.product_name);
  return variation || base;
}

// Auto-seeded giveaway items — used only as the DEFAULT "free item" guess
// for a product name (when auto-creating a date's rows, or prefilling the
// checkbox as you type a new product). Every row also carries its own
// editable is_free_item flag (see isFreeItem below) so this default can
// always be overridden by hand, per row. Matched case-insensitively so
// someone typing "gift set" or "GIFT SET" still gets treated the same way.
const GIVEAWAY_ITEMS = ['Gift Set', 'Flyer', 'Small Samples', 'Coupons'];
function isGiveaway(productName){
  return GIVEAWAY_ITEMS.some(g => g.toLowerCase() === (productName||'').trim().toLowerCase());
}

// The actual, authoritative "is this a free item?" check for a saved row —
// uses the row's own editable is_free_item flag, falling back to the
// name-based guess only for legacy rows saved before that column existed.
function isFreeItem(report){
  if(report && (report.is_free_item === true || report.is_free_item === false)) return report.is_free_item;
  return isGiveaway(report && report.product_name);
}

// ---------------- Stock category tabs ----------------
// A date's products are split into three tabs — 1L Bio Dishwash, Refill,
// and Free — instead of one long mixed list, so keying in or scanning
// data for one product line at a time is faster and clearer. Free items
// are grouped purely off each row's own is_free_item flag; the two
// sellable groups are told apart by whether "refill" appears in the name,
// so any custom product typed in still lands somewhere sensible.
const STOCK_CATEGORIES = [
  { key:'bottle', label:'1L Bio Dishwash' },
  { key:'refill', label:'Refill' },
  { key:'free', label:'Free' }
];
function stockCategoryKey(report){
  if(isFreeItem(report)) return 'free';
  if(/refill/i.test(report.product_name||'')) return 'refill';
  return 'bottle';
}
function groupByStockCategory(items){
  const grouped = { bottle:[], refill:[], free:[] };
  items.forEach(i => grouped[stockCategoryKey(i)].push(i));
  return grouped;
}

// Which tab is showing per date — defaults to the first category that
// actually has products for that date, falling back to 'bottle'.
let salesActiveTab = {};
function activeStockTab(date, grouped){
  const current = salesActiveTab[date];
  if(current && grouped[current] && grouped[current].length) return current;
  const firstNonEmpty = STOCK_CATEGORIES.find(c => grouped[c.key].length);
  return firstNonEmpty ? firstNonEmpty.key : 'bottle';
}
function setStockTab(date, key){
  salesActiveTab[date] = key;
  render();
}
function renderStockTabs(date, grouped, active){
  return `<div class="stock-tabs">${STOCK_CATEGORIES.map(c=>{
    const count = grouped[c.key].length;
    return `<button class="stock-tab ${active===c.key?'active':''}" onclick="setStockTab('${date}','${c.key}')">${c.label}${count?` <span class="stock-tab-count">${count}</span>`:''}</button>`;
  }).join('')}</div>`;
}

// ---------------- Outlet tabs ----------------
// A single working date can end up with reports from more than one
// outlet/store (e.g. a promoter covers two malls in one day). When that
// happens, split the date's records into a row of outlet tabs — inserted
// right below the date's header — so each outlet's products/stock tabs
// are viewed one at a time instead of all mixed together. A date with
// only one outlet (the common case) skips the tabs entirely and shows
// exactly as before. Rows with no store selected are grouped under a
// single "Unspecified" tab, keeping their original relative order.
function groupByOutlet(items){
  const groups = [];
  const byKey = {};
  items.forEach(i=>{
    const key = i.store_id || '__none__';
    if(!byKey[key]){
      byKey[key] = { key, label: i.stores ? i.stores.name : 'Unspecified', items: [] };
      groups.push(byKey[key]);
    }
    byKey[key].items.push(i);
  });
  return groups;
}

// Which outlet tab is showing per date — defaults to the first outlet
// that has records, falling back to whichever comes first if the
// previously-active outlet's records are gone (e.g. all deleted/edited).
let salesActiveOutletTab = {};
function activeOutletTab(date, groups){
  const current = salesActiveOutletTab[date];
  if(current && groups.some(g => g.key === current)) return current;
  return groups.length ? groups[0].key : null;
}
function setOutletTab(date, key){
  salesActiveOutletTab[date] = key;
  render();
}
// `onSelectFn` names the global function to call on tab click — defaults
// to setOutletTab (used by this Sales tab), but the Stock Management tab
// (js/stock.js) passes its own so the two tabs' outlet selections stay
// independent per date instead of sharing state.
function renderOutletTabs(date, groups, active, onSelectFn){
  const fn = onSelectFn || 'setOutletTab';
  return `<div class="stock-tabs outlet-tabs">${groups.map(g=>`
    <button class="stock-tab ${active===g.key?'active':''}" onclick="${fn}('${date}','${g.key}')">${esc(g.label)}${g.items.length?` <span class="stock-tab-count">${g.items.length}</span>`:''}</button>
  `).join('')}</div>`;
}

// Combines the fixed suggestions above with any product names already
// used in past reports, so custom products you've added before show up
// as suggestions too — the list grows on its own. Only base names are
// suggested here (no variation suffix); the Variation field next to it
// handles the flavor.
function getProductSuggestions(){
  const bases = new Set([...GIVEAWAY_ITEMS, ...VARIANT_BASE_PRODUCTS]);
  salesReports.forEach(r => { if(r.product_name) bases.add(parseProductName(r.product_name).base); });
  return [...bases].sort();
}

// Same idea for the Variation field: starts with the preset flavor list
// but also picks up any custom variation someone has typed in before, so
// it grows the same way the product name suggestions do.
function getVariationSuggestions(){
  const variations = new Set(VARIATIONS);
  salesReports.forEach(r => {
    if(!r.product_name) return;
    const v = parseProductName(r.product_name).variation;
    if(v) variations.add(v);
  });
  return [...variations].sort();
}

function todayStr(){
  return new Date().toISOString().slice(0,10);
}

// Distinct work_dates that actually have a stock report logged, most
// recent first — used to restrict daily date pickers to only dates with
// real data, instead of a free-form calendar. Lives here since
// salesReports is this file's data.
function stockLoggedDatesDesc(){
  return [...new Set(salesReports.map(r => r.work_date))].sort((a,b)=> b.localeCompare(a));
}

// Who logged a sales report row — the promoter if it came from the
// Promoters app, otherwise the admin's typed-in name if we captured it
// (see logged_by_admin_name / currentAdminName), falling back to a
// generic "Admin" for rows saved before that was tracked.
function loggedByLabel(r){
  if(r.promoters) return displayName(r.promoters);
  return r.logged_by_admin_name || 'Admin';
}

// Union of every date that has *either* a stock report or a shift report
// logged, most recent first. Used by the Sales tab's daily export picker
// (which bundles both) — so a day with only a shift report logged still
// shows up.
function combinedLoggedDatesDesc(){
  const set = new Set([...stockLoggedDatesDesc(), ...shiftReports.map(r=>r.work_date)]);
  return [...set].sort((a,b)=> b.localeCompare(a));
}

// Auto-creates stock rows for the next working date on the schedule that
// has actually arrived — not simply every calendar day — carrying opening
// stock forward from that product's most recent prior closing count.
// e.g. if the last stock records are from last Sunday and the next
// scheduled roadshow day is next Saturday, rows only get created for
// Saturday (once Saturday has arrived), skipping the days in between
// that were never on the schedule. Safe to call every load — it only
// inserts what's missing, and catches up one working date at a time.
async function ensureTodaysStockRows(){
  const today = todayStr();

  // Every working date on the schedule that has already arrived, earliest first.
  const scheduledAsc = [...new Set(jobs.map(j => j.work_date))]
    .filter(d => d <= today)
    .sort();
  if(scheduledAsc.length === 0) return;

  const stockDates = new Set(salesReports.map(r => r.work_date));
  const lastStockDate = stockDates.size ? [...stockDates].sort().pop() : null;

  // Only bring stock forward into scheduled dates that come after the
  // most recent date already carrying stock records (or every arrived
  // scheduled date, if no stock has ever been logged yet).
  const targets = lastStockDate
    ? scheduledAsc.filter(d => d > lastStockDate)
    : scheduledAsc;

  for(const date of targets){
    await ensureStockRowsForDate(date);
  }
}

// Creates any missing product rows for one specific working date, carrying
// opening stock over from that product's most recent prior closing count.
// Gift Set/Flyer/Small Samples/Coupons are auto-seeded as free items by
// default (is_free_item stays editable per row afterwards from the stock
// report form) — but they carry opening stock forward exactly like any
// other product, since "given out" is now calculated as opening − closing
// rather than typed in by hand.
async function ensureStockRowsForDate(date){
  const existingProducts = new Set(salesReports.filter(r => r.work_date === date).map(r => r.product_name));
  const missing = PRODUCT_SUGGESTIONS.filter(p => !existingProducts.has(p));
  if(missing.length === 0) return;

  for(const product of missing){
    const giveaway = isGiveaway(product);
    const priorEntries = salesReports
      .filter(r => r.product_name === product && r.work_date < date)
      .sort((a,b) => b.work_date.localeCompare(a.work_date));
    const carryOver = priorEntries.length ? Number(priorEntries[0].closing_qty||0) : 0;
    // Warehouse stock is a running total, not a daily transaction — carry
    // the last known figure forward untouched until someone edits it.
    const warehouseCarryOver = priorEntries.length ? Number(priorEntries[0].warehouse_qty||0) : 0;

    try{
      const created = await DB.addSalesReport({
        work_date: date,
        store_id: null,
        promoter_id: null,
        product_name: product,
        opening_qty: carryOver,
        sales_qty: 0,
        closing_qty: carryOver,
        remarks: null,
        photo_url: null,
        is_free_item: giveaway,
        warehouse_qty: warehouseCarryOver
      });
      // Keep the local cache current so a later target date processed in
      // this same run carries over from the row we just created.
      salesReports.push(created);
    }catch(e){
      console.warn('Could not auto-create row for', product, 'on', date, e);
    }
  }
}

function renderSales(){
  const loggedDates = combinedLoggedDatesDesc();
  // If the currently-selected export date has no stock logged, fall back
  // to the most recent date that actually has data.
  if(stockExportMode === 'daily' && loggedDates.length && !loggedDates.includes(stockExportDate)){
    stockExportDate = loggedDates[0];
  }

  const exportControls = `
    <div class="export-mode-row">
      <button class="mode-btn ${stockExportMode==='daily'?'active':''}" id="stock-export-mode-daily">Daily</button>
      <button class="mode-btn ${stockExportMode==='monthly'?'active':''}" id="stock-export-mode-monthly">Monthly</button>
    </div>
    <div class="month-picker-row">
      ${stockExportMode==='daily'
        ? (loggedDates.length
            ? `<select id="stock-date-input">${loggedDates.map(d=>`<option value="${d}" ${d===stockExportDate?'selected':''}>${formatDateShort(d)}</option>`).join('')}</select>`
            : `<select id="stock-date-input" disabled><option>No dates logged yet</option></select>`)
        : `<input id="stock-month-input" type="month" value="${stockExportMonth}">`}
      <button class="btn btn-gold" id="stock-export-btn">Export .xlsx</button>
    </div>
  `;

  if(salesReports.length===0 && dayPhotos.length===0){
    return exportControls + emptyState('📦','No sales reports yet','Tap + to log opening stock, sold/given out, and closing stock for a roadshow date.');
  }

  // Group entries by work_date, newest date first.
  const byDate = {};
  salesReports.forEach(r=>{
    if(!byDate[r.work_date]) byDate[r.work_date] = [];
    byDate[r.work_date].push(r);
  });
  dayPhotos.forEach(dp=>{
    if(!byDate[dp.work_date]) byDate[dp.work_date] = [];
  });
  const dates = Object.keys(byDate).sort((a,b)=> b.localeCompare(a));
  const today = todayStr();

  let html = `<div class="section-title">Sales reports <span class="count-pill">${dates.length} date${dates.length>1?'s':''}</span></div>`;
  html += exportControls;

  dates.forEach(date=>{
    const items = byDate[date];
    const expanded = salesExpandedDates.has(date);
    const totalSales = items.filter(i=>!isFreeItem(i)).reduce((s,i)=>s + Number(i.sales_qty||0), 0);
    const totalGiven = items.filter(i=>isFreeItem(i)).reduce((s,i)=>s + Number(i.sales_qty||0), 0);
    const storeNames = [...new Set(items.filter(i=>i.stores).map(i=>i.stores.name))];
    const isToday = date === today;
    let body = '';
    if(expanded){
      // Split by outlet first (only rendered as tabs when a date actually
      // has more than one outlet) — the product-category tabs below then
      // work on just that outlet's records.
      const outletGroups = groupByOutlet(items);
      const showOutletTabs = outletGroups.length > 1;
      const activeOutletKey = showOutletTabs ? activeOutletTab(date, outletGroups) : null;
      const scopedItems = showOutletTabs ? outletGroups.find(g=>g.key===activeOutletKey).items : items;

      const grouped = groupByStockCategory(scopedItems);
      const active = activeStockTab(date, grouped);
      const activeItems = grouped[active];
      body = `<div class="sales-group-body">
        ${showOutletTabs ? renderOutletTabs(date, outletGroups, activeOutletKey) : ''}
        ${renderDayPhotoRow(date)}
        ${renderStockTabs(date, grouped, active)}
        ${activeItems.length ? renderSalesItems(activeItems, active==='free') : `<div class="stock-tab-empty">No products in this group yet.</div>`}
        ${renderDayFeedbackRow(date)}
      </div>`;
    }
    html += `
      <div class="sales-group">
        <button class="sales-group-header" onclick="toggleSalesDate('${date}')">
          <div>
            <div class="sales-group-date">${formatDateLong(date)} ${isToday?'<span class="count-pill">Today</span>':''}</div>
            <div class="sales-group-sub">${items.length} product${items.length>1?'s':''}${storeNames.length?' · '+esc(storeNames.join(', ')):''} · ${totalSales} sold${totalGiven?` · ${totalGiven} given away`:''}</div>
          </div>
          <span class="sales-group-chevron ${expanded?'open':''}">▾</span>
        </button>
        ${body}
      </div>
    `;
  });

  return html;
}

// `compact` is used for the Free tab — giveaways don't need the full
// open/sold/close + shelf-location breakdown, just how many went out,
// so the list stays quick to scan while keying in samples/coupons/etc.
function renderSalesItems(items, compact){
  return items.map(i=>{
    const giveaway = isFreeItem(i);
    const opening = Number(i.opening_qty||0), sales = Number(i.sales_qty||0), closing = Number(i.closing_qty||0);

    if(compact){
      return `
        <div class="sales-item">
          <div class="sales-item-main">
            <div class="sales-item-name">${esc(displayProductName(i))}</div>
            <div class="sales-item-stats">Given out <b>${sales}</b> · Logged by <b>${esc(loggedByLabel(i))}</b></div>
            ${i.remarks ? `<div class="sales-item-remarks">${esc(i.remarks)}</div>` : ''}
          </div>
          <div class="job-actions">
            <div class="icon-btn" onclick="openSalesForm('${i.id}')">✎</div>
            <div class="icon-btn danger" onclick="deleteSalesReport('${i.id}')">✕</div>
          </div>
        </div>
      `;
    }

    const expectedClosing = opening - sales;
    const variance = closing - expectedClosing;
    return `
      <div class="sales-item">
        <div class="sales-item-main">
          <div class="sales-item-name">${esc(displayProductName(i))}</div>
          <div class="sales-item-stats">
            Open <b>${opening}</b> · ${giveaway?'Given out':'Sold'} <b>${sales}</b> · Close <b>${closing}</b> · Logged by <b>${esc(loggedByLabel(i))}</b>
            ${variance !== 0 ? `<span class="sales-variance ${variance<0?'short':'over'}">${variance>0?'+':''}${variance} vs expected</span>` : ''}
            ${giveaway ? `<span class="count-pill">Free item</span>` : ''}
          </div>
          ${i.remarks ? `<div class="sales-item-remarks">${esc(i.remarks)}</div>` : ''}
        </div>
        <div class="job-actions">
          <div class="icon-btn" onclick="openSalesForm('${i.id}')">✎</div>
          <div class="icon-btn danger" onclick="deleteSalesReport('${i.id}')">✕</div>
        </div>
      </div>
    `;
  }).join('');
}

// Any number of overall photos allowed per working date (booth/table
// setup, crowd shots, etc.) — separate from each product's own
// opening/sales/closing row. All of a date's photos sit in a single
// horizontally-scrolling row of thumbnails, with an "add" tile right
// after the last photo so another can be added on top.
function renderDayPhotoRow(date){
  const photos = dayPhotos.filter(d => d.work_date === date);
  const photoThumbs = photos.map(dp => `
    <div class="day-photo-thumb" onclick="openDayPhotoForm('${date}','${dp.id}')" title="Edit day photo">
      ${dp.photo_url
        ? `<img src="${esc(dp.photo_url)}" alt="Day photo">`
        : `<div class="day-photo-thumb-empty">📷</div>`}
      <button class="day-photo-thumb-delete" onclick="event.stopPropagation(); deleteDayPhotoRow('${dp.id}')" title="Delete">✕</button>
    </div>
  `).join('');

  const addThumb = `
    <div class="day-photo-thumb day-photo-add" onclick="openDayPhotoForm('${date}')" title="Add day photo">＋</div>
  `;

  return `<div class="day-photo-strip">${photoThumbs}${addThumb}</div>`;
}

// One general feedback field per working date, sitting at the bottom of
// that date's record — replaces the old per-product "Customer feedback"
// field. Saved with a small Save button rather than autosaving on blur,
// so a stray tap/click elsewhere in the card can't silently overwrite it.
function renderDayFeedbackRow(date){
  const entry = dayFeedback.find(d => d.work_date === date);
  const value = entry ? (entry.feedback || '') : '';
  const safeDate = date.replace(/[^0-9a-zA-Z]/g, '');
  return `
    <div class="day-feedback-block">
      <label for="day-feedback-${safeDate}">General feedback</label>
      <textarea id="day-feedback-${safeDate}" rows="2" placeholder="Overall customer feedback or notes for this date (optional)" oninput="onDayFeedbackInput('${date}')">${esc(value)}</textarea>
      <div class="day-feedback-actions">
        <span class="field-hint" id="day-feedback-hint-${safeDate}"></span>
        <button type="button" class="btn btn-gold btn-sm" id="day-feedback-save-${safeDate}" style="display:none;" onclick="saveDayFeedback('${date}')">Save feedback</button>
      </div>
    </div>
  `;
}

function onDayFeedbackInput(date){
  const safeDate = date.replace(/[^0-9a-zA-Z]/g, '');
  const btn = document.getElementById(`day-feedback-save-${safeDate}`);
  if(btn) btn.style.display = '';
}

async function saveDayFeedback(date){
  const safeDate = date.replace(/[^0-9a-zA-Z]/g, '');
  const textarea = document.getElementById(`day-feedback-${safeDate}`);
  const btn = document.getElementById(`day-feedback-save-${safeDate}`);
  const hint = document.getElementById(`day-feedback-hint-${safeDate}`);
  const feedback = textarea.value.trim();
  if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  try{
    await DB.upsertDayFeedback(date, feedback || null);
    await refreshData();
    if(hint) hint.textContent = 'Saved';
    if(btn) btn.style.display = 'none';
    render();
  }catch(e){
    console.error(e);
    showToast('Could not save feedback — ' + (e.message || 'check your connection'));
    if(btn){ btn.disabled = false; btn.textContent = 'Save feedback'; }
  }
}

function toggleSalesDate(date){
  if(salesExpandedDates.has(date)) salesExpandedDates.delete(date);
  else salesExpandedDates.add(date);
  render();
}

function openSalesForm(id){
  const editing = id ? salesReports.find(r=>r.id===id) : null;
  // Matches the promoter app's form exactly: no Date or Logged-by fields.
  // New entries always land on today (auto-seeded rows already cover past
  // dates); editing an existing entry keeps its original work_date and
  // promoter_id untouched — there's simply no field to change either.
  const formDate = editing ? editing.work_date : todayStr();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${editing ? 'Edit stock report' : 'Add stock report'}</div>
      <div class="field-hint" style="margin-bottom:12px;">Entered by <b>${esc(currentAdminName || 'Admin')}</b> · ${formatDateLong(formDate)}</div>
      <div class="field">
        <label>Store (optional)</label>
        <select id="s-store">
          <option value="">— Not specified —</option>
          ${stores.map(s=>`<option value="${s.id}" ${editing&&editing.store_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field" style="flex:1.6;">
          <label>Product name</label>
          <input id="s-product" list="product-list" value="${editing?esc(parseProductName(editing.product_name).base):''}" placeholder="e.g. Bio Dishwash 1L" oninput="onProductNameChange()">
          <datalist id="product-list">${getProductSuggestions().map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label>Variation (optional)</label>
          <input id="s-variation" list="variation-list" value="${editing?esc(parseProductName(editing.product_name).variation):''}" placeholder="e.g. Bidara" oninput="onProductNameChange()">
          <datalist id="variation-list">${getVariationSuggestions().map(v=>`<option value="${esc(v)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="field-hint" style="margin:-8px 0 14px;"></div>
      <div class="field">
        <label class="checkbox-row">
          <input type="checkbox" id="s-free-item" ${(editing?isFreeItem(editing):isGiveaway(''))?'checked':''} onchange="onFreeItemToggle()">
          Free item (given away, not sold)
        </label>
        <div class="field-hint" id="s-free-item-hint"></div>
      </div>
      <div class="field"><label>Opening stock</label>
        <div class="qty-stepper">
          <button type="button" class="qty-btn qty-minus" onclick="stepQty('s-opening',-1)" aria-label="Decrease opening stock">−</button>
          <input id="s-opening" type="number" min="0" step="1" value="${editing?editing.opening_qty:''}" placeholder="0" oninput="onStockFieldInput()">
          <button type="button" class="qty-btn qty-plus" onclick="stepQty('s-opening',1)" aria-label="Increase opening stock">+</button>
        </div>
      </div>
      <div class="field" id="sales-field"><label id="s-sales-label">Sales qty</label>
        <div class="qty-stepper">
          <button type="button" class="qty-btn qty-minus" onclick="stepQty('s-sales',-1)" aria-label="Decrease sales qty">−</button>
          <input id="s-sales" type="number" min="0" step="1" value="${editing?editing.sales_qty:''}" placeholder="0">
          <button type="button" class="qty-btn qty-plus" onclick="stepQty('s-sales',1)" aria-label="Increase sales qty">+</button>
        </div>
      </div>
      <div class="field"><label>Closing stock</label>
        <div class="qty-stepper">
          <button type="button" class="qty-btn qty-minus" onclick="stepQty('s-closing',-1)" aria-label="Decrease closing stock">−</button>
          <input id="s-closing" type="number" min="0" step="1" value="${editing?editing.closing_qty:''}" placeholder="0" oninput="onStockFieldInput()">
          <button type="button" class="qty-btn qty-plus" onclick="stepQty('s-closing',1)" aria-label="Increase closing stock">+</button>
        </div>
      </div>
      <div class="field" id="given-out-field" style="display:none;">
        <label>Given out (auto)</label>
        <input id="s-given-out-display" type="text" value="0" readonly disabled>
        <div class="field-hint"></div>
      </div>
      <div class="field"><label>Remarks (optional)</label><input id="s-remarks" value="${editing?esc(editing.remarks||''):''}" placeholder="e.g. 2 units damaged"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="sales-save-btn" onclick="saveSalesForm('${editing?editing.id:''}')">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  // Once the person has hand-toggled the checkbox, typing further in the
  // product name field stops overriding their choice.
  salesFormFreeItemTouched = false;
  applyFreeItemFieldLayout(); // set the right field layout immediately, e.g. when editing a giveaway item
}

// Tracks whether the person has manually ticked/unticked the "Free item"
// checkbox in the currently-open form — once true, typing in the product
// name field no longer overwrites their choice.
let salesFormFreeItemTouched = false;

// Re-guesses the "Free item" checkbox from the product name as you type —
// but only until the person manually touches the checkbox themselves.
function onProductNameChange(){
  if(!salesFormFreeItemTouched){
    document.getElementById('s-free-item').checked = isGiveaway(document.getElementById('s-product').value);
  }
  applyFreeItemFieldLayout();
}

function onFreeItemToggle(){
  salesFormFreeItemTouched = true;
  applyFreeItemFieldLayout();
}

// For free items, opening/closing stock is still recorded, but the "Sales
// qty" field is hidden and replaced with a read-only "Given out" figure
// computed automatically as opening − closing — no manual entry needed.
function applyFreeItemFieldLayout(){
  const giveaway = document.getElementById('s-free-item').checked;
  document.getElementById('sales-field').style.display = giveaway ? 'none' : '';
  document.getElementById('given-out-field').style.display = giveaway ? '' : 'none';
  if(giveaway) updateGivenOutPreview();
}

// Keeps the read-only "Given out" figure in sync as opening/closing stock
// is typed, whenever the "Free item" checkbox is ticked.
function updateGivenOutPreview(){
  const opening = parseFloat(document.getElementById('s-opening').value) || 0;
  const closing = parseFloat(document.getElementById('s-closing').value) || 0;
  const given = Math.max(0, opening - closing);
  document.getElementById('s-given-out-display').value = given;
}

function onStockFieldInput(){
  if(document.getElementById('s-free-item').checked) updateGivenOutPreview();
}

async function saveSalesForm(id){
  const editing = id ? salesReports.find(r=>r.id===id) : null;
  // No Date or Logged-by fields in this form (matches the promoter app) —
  // new entries always save into today; editing keeps the original
  // work_date and promoter_id exactly as they were.
  const work_date = editing ? editing.work_date : todayStr();
  const promoter_id = editing ? (editing.promoter_id || null) : null;
  const store_id = document.getElementById('s-store').value || null;
  const productBase = document.getElementById('s-product').value.trim();
  const variation = document.getElementById('s-variation').value;
  const product_name = composeProductName(productBase, variation);
  const is_free_item = document.getElementById('s-free-item').checked;
  const opening_qty = parseFloat(document.getElementById('s-opening').value) || 0;
  const closing_qty = parseFloat(document.getElementById('s-closing').value) || 0;
  // Free items: "given out" is never typed in — it's always opening minus
  // closing. Regular products: sales qty is entered by hand as before.
  const sales_qty = is_free_item ? Math.max(0, opening_qty - closing_qty) : (parseFloat(document.getElementById('s-sales').value) || 0);
  const remarks = document.getElementById('s-remarks').value.trim();
  // Photos are no longer captured per product — see the "Day photo" row
  // for one overall photo per working date. Editing an older row that
  // still has a legacy photo_url leaves it untouched.
  const photo_url = editing ? (editing.photo_url || null) : null;
  // Who typed this in — only set for brand-new admin-entered rows (never
  // overwritten on edit, so it always reflects who originally logged it,
  // and never touched for promoter-entered rows, which use promoter_id
  // instead — see currentAdminName in js/app.js).
  const logged_by_admin_name = editing ? (editing.logged_by_admin_name || null) : (promoter_id ? null : currentAdminName);

  if(!productBase){
    showToast('Product name is required'); return;
  }

  const btn = document.getElementById('sales-save-btn');
  btn.disabled = true;
  try{
    btn.textContent = 'Saving…';
    // Note: this form never touches store_room_qty / home_shelf_qty /
    // standee_qty / warehouse_qty — those live in the separate Stock
    // Management section (js/stock.js) now, and are left exactly as they
    // were on this row (defaulting to 0 for a brand-new row).
    const payload = { work_date, store_id, promoter_id, product_name, opening_qty, sales_qty, closing_qty, remarks, photo_url, is_free_item, logged_by_admin_name };
    if(id){
      await DB.updateSalesReport(id, payload);
    }else{
      await DB.addSalesReport(payload);
    }
    salesExpandedDates.add(work_date); // reveal the group you just added/edited into
    await refreshData();
    closeModal();
    render();
    showToast('Stock report saved');
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function deleteSalesReport(id){
  if(!confirm('Delete this product\'s stock report?')) return;
  try{
    await DB.deleteSalesReport(id);
    await refreshData();
    render();
    showToast('Stock report deleted');
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}

// ---------------- Excel export (day or month, everything in one file) ----------------
// This is the ONE export in the app. One workbook per period, 6 sheets:
// Raw Sales Data, Estimated Sales during Non-event Day, Sales Summary by
// Outlet, Raw Stock Data, Outlet Performance, Customer Analysis. Reads
// straight from the same salesReports/shiftReports/stores/promoters
// globals every other tab in this app reads (see refreshData in
// js/app.js) — no separate query, no fabricated rows.
//
// A note on formatting: this app bundles xlsx-js-style (see the
// <script> tag for xlsx.bundle.js in index.html) instead of plain
// SheetJS. It's a drop-in — same XLSX.* API the rest of this file and
// js/report.js already use — that additionally supports per-cell style
// (bold, wrap text). That covers everything except frozen panes, which
// no free/community build (SheetJS or this fork) can write. Freeze panes
// are applied as a small post-write patch instead — see
// freezeFirstRowOnAllSheets below, which edits the raw worksheet XML
// inside the already-written .xlsx zip using fflate (also bundled via
// index.html) before the file is downloaded. This was confirmed working
// end to end (Excel + LibreOffice both honor the patched pane) rather
// than assumed.

// Local midnight Date object for a work_date string — used so exported
// cells are real Excel dates (sortable, filterable, formattable) rather
// than plain text, and so the date doesn't shift a day under a UTC vs.
// local timezone reading.
function excelDateCell(dateStr){
  return new Date(dateStr + 'T00:00:00');
}
function dayOfWeekName(dateStr){
  return excelDateCell(dateStr).toLocaleDateString('en-GB', { weekday: 'long' });
}
// Division that never throws/NaNs on an empty denominator — used for
// Engagement Success Rate / Purchase Conversion Rate, which are commonly
// 0 engaged on a quiet shift.
function safeDiv(num, den){
  return den > 0 ? (num / den) : 0;
}
// The label used everywhere else in the app (see groupByOutlet above)
// for a row that has no store selected — kept identical here so the
// export reads the same as the on-screen outlet tabs.
function outletLabel(r){
  return r.stores ? r.stores.name : 'Unspecified';
}

const HEADER_CELL_STYLE = { font: { bold: true }, alignment: { vertical: 'center' } };
const WRAP_CELL_STYLE = { alignment: { wrapText: true, vertical: 'top' } };

// Builds one sheet: enforces `header` as the exact column order (so
// missing keys on some rows still land in the right column instead of
// shifting), sets column widths, applies a number/date/percent format
// per named column (via `formats`, keyed by header label), bolds the
// header row, wraps text for any columns named in `wrapCols`, and turns
// on a whole-table autofilter. Returns the created worksheet in case a
// caller needs to touch it further.
function addReportSheet(wb, name, rows, header, widths, formats, wrapCols){
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws['!cols'] = widths.map(w => ({ wch: w }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  const range = XLSX.utils.decode_range(ws['!ref']);
  // Bold header row (row 0).
  for(let c = range.s.c; c <= range.e.c; c++){
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if(cell) cell.s = HEADER_CELL_STYLE;
  }
  if(formats){
    Object.entries(formats).forEach(([colName, fmt])=>{
      const c = header.indexOf(colName);
      if(c === -1) return;
      for(let r = range.s.r + 1; r <= range.e.r; r++){
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if(cell) cell.z = fmt;
      }
    });
  }
  if(wrapCols){
    wrapCols.forEach(colName=>{
      const c = header.indexOf(colName);
      if(c === -1) return;
      for(let r = range.s.r + 1; r <= range.e.r; r++){
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if(cell) cell.s = WRAP_CELL_STYLE;
      }
    });
  }
  XLSX.utils.book_append_sheet(wb, ws, name);
  return ws;
}

// Patches every worksheet in an already-built workbook's raw XML so row
// 1 is frozen, then triggers the file download. Needed because no free
// build of SheetJS (this fork included) exposes freeze panes through the
// normal writer API — see the note above exportStockExcel. Falls back to
// a plain (unfrozen) download if fflate isn't available for any reason,
// rather than failing the export outright.
function freezeFirstRowAndDownload(wb, filename){
  if(typeof fflate === 'undefined'){
    console.warn('fflate not loaded — exporting without frozen panes');
    XLSX.writeFile(wb, filename);
    return;
  }
  const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const files = fflate.unzipSync(new Uint8Array(arr));
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const FREEZE_PANE_XML = '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>';
  Object.keys(files).forEach(path=>{
    if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) return;
    let xml = dec.decode(files[path]);
    xml = xml.replace('<sheetView workbookViewId="0"/>', FREEZE_PANE_XML);
    files[path] = enc.encode(xml);
  });
  const zipped = fflate.zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function wireStockExportControls(){
  const dailyBtn = document.getElementById('stock-export-mode-daily');
  if(dailyBtn) dailyBtn.addEventListener('click', ()=>{ stockExportMode = 'daily'; render(); });
  const monthlyBtn = document.getElementById('stock-export-mode-monthly');
  if(monthlyBtn) monthlyBtn.addEventListener('click', ()=>{ stockExportMode = 'monthly'; render(); });
  const di = document.getElementById('stock-date-input');
  if(di && !di.disabled) di.addEventListener('change', e=>{ stockExportDate = e.target.value; render(); });
  const mi = document.getElementById('stock-month-input');
  if(mi) mi.addEventListener('change', e=>{ stockExportMonth = e.target.value; render(); });
  const eb = document.getElementById('stock-export-btn');
  if(eb) eb.addEventListener('click', exportStockExcel);
}

function exportStockExcel(){
  const daily = stockExportMode === 'daily';
  const periodLabel = daily ? stockExportDate : stockExportMonth;
  const inPeriod = daily
    ? (d) => d === stockExportDate
    : (d) => d.startsWith(stockExportMonth);

  const salesRows = salesReports.filter(r => inPeriod(r.work_date));
  const shiftRows = shiftReports.filter(r => inPeriod(r.work_date));

  if(salesRows.length === 0 && shiftRows.length === 0){
    showToast(`No reports to export for this ${daily ? 'date' : 'month'}`);
    return;
  }

  const wb = XLSX.utils.book_new();

  // ============================================================
  // Sheet 1 — Raw Sales Data
  // ============================================================
  const rawSalesHeader = ['Date','Day','Outlet','Product','Variation','Opening','Closing','Sold/ Given out','Variance','Logged By','Remarks'];
  const rawSalesRows = [...salesRows]
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || outletLabel(a).localeCompare(outletLabel(b)) || (a.product_name||'').localeCompare(b.product_name||''))
    .map(r=>{
      const { base, variation } = parseProductName(r.product_name);
      const giveaway = isFreeItem(r);
      const opening = Number(r.opening_qty||0), closing = Number(r.closing_qty||0), soldGiven = Number(r.sales_qty||0);
      return {
        'Date': excelDateCell(r.work_date),
        'Day': dayOfWeekName(r.work_date),
        'Outlet': outletLabel(r),
        'Product': base,
        // Free items always show "Free" here regardless of whether the
        // stored name happened to have a parsed variation.
        'Variation': giveaway ? 'Free' : variation,
        'Opening': opening,
        'Closing': closing,
        'Sold/ Given out': soldGiven,
        'Variance': opening - closing - soldGiven,
        'Logged By': loggedByLabel(r),
        'Remarks': r.remarks || ''
      };
    });
  addReportSheet(wb, 'Raw Sales Data', rawSalesRows, rawSalesHeader,
    [12,11,18,22,14,10,10,15,10,16,34],
    { 'Date':'dd/mm/yyyy', 'Opening':'#,##0', 'Closing':'#,##0', 'Sold/ Given out':'#,##0', 'Variance':'#,##0' },
    ['Remarks']
  );

  // ============================================================
  // Sheet 2 — Estimated Sales during Non-event Day
  // ============================================================
  // For two consecutive event dates logged at the same outlet, the gap
  // between them is a stretch with nobody from the team on-site. Any
  // stock that disappeared from the shelf in that gap is stock the
  // outlet's own staff sold without a promoter around to log it —
  // estimated per SKU as: closing stock at the end of the earlier date
  // minus opening stock at the start of the next one. Free/giveaway
  // items are excluded — this sheet is about sales, not giveaways.
  // Scoped to the exported period: only dates that fall inside the
  // chosen day/month are used to find "consecutive" pairs, so a gap
  // that straddles the edge of the period isn't included here.
  const nonFreeSalesRows = salesRows.filter(r => !isFreeItem(r));
  const skuList = [...new Set(nonFreeSalesRows.map(r => r.product_name))].sort();

  const byOutletForGap = {};
  nonFreeSalesRows.forEach(r=>{
    const key = r.store_id || '__none__';
    if(!byOutletForGap[key]) byOutletForGap[key] = { name: outletLabel(r), byDate: {} };
    if(!byOutletForGap[key].byDate[r.work_date]) byOutletForGap[key].byDate[r.work_date] = {};
    byOutletForGap[key].byDate[r.work_date][r.product_name] = r;
  });

  // Column naming here follows the client's spec literally: "Date After"
  // holds the EARLIER of the two event dates (the one sales are counted
  // as happening after) and "Date Before" holds the LATER one (the one
  // they're counted as happening before) — e.g. for a 2 Aug → 8 Aug gap,
  // Date After = 2 Aug, Date Before = 8 Aug, and the estimate is closing
  // stock on 2 Aug minus opening stock on 8 Aug. Not the more intuitive
  // chronological reading, but matches the worked example in the spec
  // exactly, so it's kept as-is rather than "corrected".
  const gapHeader = ['Date After','Date Before','Outlet','Total Sales', ...skuList];
  const gapRows = [];
  // Accumulated per Outlet+Product(+Variation) across every gap in the
  // exported period — feeds "Total Sales After Adding Est. Sales" on the
  // Sales Summary by Outlet sheet, keyed identically (outlet + raw
  // product_name, which already encodes the variation) so the two sheets
  // can never cross-match the wrong product.
  const estByOutletProduct = {};
  Object.values(byOutletForGap).forEach(outlet=>{
    const dates = Object.keys(outlet.byDate).sort();
    for(let i=0; i<dates.length-1; i++){
      const earlier = dates[i], later = dates[i+1];
      const rowEarlier = outlet.byDate[earlier], rowLater = outlet.byDate[later];
      const row = { 'Date After': excelDateCell(earlier), 'Date Before': excelDateCell(later), 'Outlet': outlet.name };
      let total = 0;
      skuList.forEach(sku=>{
        const closingEarlier = rowEarlier[sku] ? Number(rowEarlier[sku].closing_qty||0) : null;
        const openingLater = rowLater[sku] ? Number(rowLater[sku].opening_qty||0) : null;
        if(closingEarlier != null && openingLater != null){
          const est = closingEarlier - openingLater;
          row[sku] = est;
          total += est;
          const estKey = outlet.name + '|||' + sku;
          estByOutletProduct[estKey] = (estByOutletProduct[estKey] || 0) + est;
        }else{
          row[sku] = ''; // that SKU wasn't logged on one side of the gap — not computable
        }
      });
      row['Total Sales'] = total;
      gapRows.push(row);
    }
  });
  const gapWidths = [12,12,18,13, ...skuList.map(()=>16)];
  const gapFormats = { 'Date After':'dd/mm/yyyy', 'Date Before':'dd/mm/yyyy', 'Total Sales':'#,##0' };
  skuList.forEach(sku => gapFormats[sku] = '#,##0');
  // Excel hard-caps worksheet tab names at 31 characters — the spec's
  // exact sheet name "Estimated Sales during Non-event Day" is 36 and
  // will not save (SheetJS throws "Sheet names cannot exceed 31 chars",
  // confirmed by actually trying it). Shortened to the closest fit that
  // keeps the same words and order.
  addReportSheet(wb, 'Est. Sales (Non-event Day)', gapRows, gapHeader, gapWidths, gapFormats);

  // ============================================================
  // Sheet 3 — Sales Summary by Outlet
  // ============================================================
  // Grouped by Outlet + Product + Variation only — never split by date
  // (per spec). Keyed on outlet + the raw product_name (rather than the
  // parsed base/variation pair) so this sheet matches "Total Sales After
  // Adding Est. Sales" against exactly the same Outlet+Product+Variation
  // bucket the Estimated Sales sheet used — a fixed-cell or
  // base/variation-only match could silently pull in a different
  // variation's estimate.
  const summaryHeader = ['Up to Date','Outlet','Product','Variation','Total Given Out','Total Sales During Event','Total Sales After Adding Est. Sales'];
  const summaryMap = {};
  salesRows.forEach(r=>{
    const outlet = outletLabel(r);
    const { base, variation } = parseProductName(r.product_name);
    const key = outlet + '|||' + r.product_name;
    if(!summaryMap[key]) summaryMap[key] = { outlet, base, variation, productName: r.product_name, sales:0, given:0, upToDate: r.work_date };
    const entry = summaryMap[key];
    const qty = Number(r.sales_qty||0);
    // Free/giveaway quantities are tallied separately and never counted
    // toward Total Sales During Event.
    if(isFreeItem(r)) entry.given += qty; else entry.sales += qty;
    // Up to Date = latest date covered for this outlet (across every
    // product/variation logged there in the exported period).
    if(r.work_date > entry.upToDate) entry.upToDate = r.work_date;
  });
  // "Up to Date" is really per-outlet (latest date logged at that
  // outlet at all), not per product/variation — recompute it that way
  // so every row for the same outlet shows the same date, matching how
  // the spec describes it ("latest date covered for that outlet").
  const maxDateByOutlet = {};
  salesRows.forEach(r=>{
    const outlet = outletLabel(r);
    if(!maxDateByOutlet[outlet] || r.work_date > maxDateByOutlet[outlet]) maxDateByOutlet[outlet] = r.work_date;
  });
  const summaryRows = Object.values(summaryMap)
    .sort((a,b)=> a.outlet.localeCompare(b.outlet) || a.base.localeCompare(b.base) || a.variation.localeCompare(b.variation))
    .map(v=>{
      const estKey = v.outlet + '|||' + v.productName;
      const estSales = estByOutletProduct[estKey] || 0;
      return {
        'Up to Date': excelDateCell(maxDateByOutlet[v.outlet]),
        'Outlet': v.outlet,
        'Product': v.base,
        'Variation': v.variation,
        'Total Given Out': v.given,
        'Total Sales During Event': v.sales,
        'Total Sales After Adding Est. Sales': v.sales + estSales
      };
    });
  addReportSheet(wb, 'Sales Summary by Outlet', summaryRows, summaryHeader, [13,20,22,14,16,22,28],
    { 'Up to Date':'dd/mm/yyyy', 'Total Given Out':'#,##0', 'Total Sales During Event':'#,##0', 'Total Sales After Adding Est. Sales':'#,##0' }
  );

  // ============================================================
  // Sheet 4 — Raw Stock Data
  // ============================================================
  // Free items carry no store-room/home-shelf/standee/warehouse figures
  // in this app (see js/stock.js — that tab excludes them entirely, as
  // location/warehouse tracking is only meaningful for sellable stock),
  // so they're left out here too rather than exporting all-zero rows.
  const stockHeader = ['Date','Outlet','Product','Variation','Store Room','Home Shelf','Standee','Warehouse','Total Stock'];
  const stockRows = [...salesRows]
    .filter(r => !isFreeItem(r))
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || outletLabel(a).localeCompare(outletLabel(b)) || (a.product_name||'').localeCompare(b.product_name||''))
    .map(r=>{
      const { base, variation } = parseProductName(r.product_name);
      const storeRoom = Number(r.store_room_qty||0), homeShelf = Number(r.home_shelf_qty||0), standee = Number(r.standee_qty||0);
      return {
        'Date': excelDateCell(r.work_date),
        'Outlet': outletLabel(r),
        'Product': base,
        'Variation': variation,
        'Store Room': storeRoom,
        'Home Shelf': homeShelf,
        'Standee': standee,
        'Warehouse': Number(r.warehouse_qty||0),
        'Total Stock': storeRoom + homeShelf + standee
      };
    });
  addReportSheet(wb, 'Raw Stock Data', stockRows, stockHeader, [12,18,22,14,11,11,9,11,12],
    { 'Date':'dd/mm/yyyy', 'Store Room':'#,##0', 'Home Shelf':'#,##0', 'Standee':'#,##0', 'Warehouse':'#,##0', 'Total Stock':'#,##0' }
  );

  // ============================================================
  // Sheet 5 — Outlet Performance
  // ============================================================
  const perfHeader = ['Date','Outlet','Total Customer Engaged','Successful Engagements','Purchases','Engagement Success Rate','Purchase Conversion Rate','Average Engagement Time','Promoters','Before Break Engaged','After Break Engaged','Before Break Purchases','After Break Purchases','Before Break Conversion Rate','After Break Conversion Rate'];
  const perfMap = {};
  shiftRows.forEach(r=>{
    const outlet = outletLabel(r);
    const key = r.work_date + '|||' + outlet;
    if(!perfMap[key]) perfMap[key] = {
      date: r.work_date, outlet, engaged:0, successful:0, purchases:0,
      timeSum:0, timeCount:0, promoters: new Set(),
      beforeEngaged:0, afterEngaged:0, beforePurchases:0, afterPurchases:0
    };
    const p = perfMap[key];
    const engaged = Number(r.engaged||0), purchases = Number(r.purchases||0);
    p.engaged += engaged;
    p.successful += Number(r.successful_engagements||0);
    p.purchases += purchases;
    if(r.avg_engagement_time!=null && r.avg_engagement_time!==''){ p.timeSum += Number(r.avg_engagement_time); p.timeCount++; }
    if(r.promoters) p.promoters.add(displayName(r.promoters));
    if(r.shift === 'before_break'){ p.beforeEngaged += engaged; p.beforePurchases += purchases; }
    else if(r.shift === 'after_break'){ p.afterEngaged += engaged; p.afterPurchases += purchases; }
  });
  const perfRows = Object.values(perfMap)
    .sort((a,b)=> a.date.localeCompare(b.date) || a.outlet.localeCompare(b.outlet))
    .map(p=>({
      'Date': excelDateCell(p.date),
      'Outlet': p.outlet,
      'Total Customer Engaged': p.engaged,
      'Successful Engagements': p.successful,
      'Purchases': p.purchases,
      // Stored as a fraction (0–1) with a percent number format, so
      // Excel both displays "45.2%" and treats it as a real percentage.
      'Engagement Success Rate': safeDiv(p.successful, p.engaged),
      'Purchase Conversion Rate': safeDiv(p.purchases, p.engaged),
      'Average Engagement Time': p.timeCount ? Number((p.timeSum/p.timeCount).toFixed(1)) : '',
      'Promoters': [...p.promoters].sort().join(', '),
      'Before Break Engaged': p.beforeEngaged,
      'After Break Engaged': p.afterEngaged,
      'Before Break Purchases': p.beforePurchases,
      'After Break Purchases': p.afterPurchases,
      'Before Break Conversion Rate': safeDiv(p.beforePurchases, p.beforeEngaged),
      'After Break Conversion Rate': safeDiv(p.afterPurchases, p.afterEngaged)
    }));
  addReportSheet(wb, 'Outlet Performance', perfRows, perfHeader,
    [12,18,15,15,11,15,15,14,24,13,13,13,13,17,17],
    {
      'Date':'dd/mm/yyyy', 'Total Customer Engaged':'#,##0', 'Successful Engagements':'#,##0', 'Purchases':'#,##0',
      'Engagement Success Rate':'0.0%', 'Purchase Conversion Rate':'0.0%', 'Average Engagement Time':'0.0',
      'Before Break Engaged':'#,##0', 'After Break Engaged':'#,##0', 'Before Break Purchases':'#,##0', 'After Break Purchases':'#,##0',
      'Before Break Conversion Rate':'0.0%', 'After Break Conversion Rate':'0.0%'
    }
  );

  // ============================================================
  // Sheet 6 — Customer Analysis
  // ============================================================
  const custHeader = ['Date','Outlet','Age Range','Feedback'];
  const custRows = [...shiftRows]
    .filter(r => r.customer_age_range || (r.customer_feedback && r.customer_feedback.trim()))
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || outletLabel(a).localeCompare(outletLabel(b)))
    .map(r=>({
      'Date': excelDateCell(r.work_date),
      'Outlet': outletLabel(r),
      'Age Range': r.customer_age_range ? (AGE_RANGE_LABELS[r.customer_age_range] || r.customer_age_range) : '',
      'Feedback': r.customer_feedback || ''
    }));
  addReportSheet(wb, 'Customer Analysis', custRows, custHeader, [12,18,12,50], { 'Date':'dd/mm/yyyy' }, ['Feedback']);

  freezeFirstRowAndDownload(wb, `Golden_Panda_Report_${daily?'Daily':'Monthly'}_${periodLabel}.xlsx`);
  showToast('Excel file downloaded');
}

// ---------------- Day photo (one overall photo per working date) ----------------

function openDayPhotoForm(date, id){
  const existing = id ? dayPhotos.find(d => d.id === id) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${existing ? 'Edit' : 'Add'} day photo — ${formatDateLong(date)}</div>
      <div class="field">
        <label>Photo</label>
        <div class="photo-picker">
          <img id="photo-preview" class="photo-preview" src="${existing&&existing.photo_url?esc(existing.photo_url):''}" style="${existing&&existing.photo_url?'':'display:none;'}">
          <div id="photo-preview-empty" class="photo-preview photo-preview-empty" style="${existing&&existing.photo_url?'display:none;':''}">📷</div>
          <div class="photo-picker-actions">
            <label class="btn btn-ghost" for="dp-photo">Take / choose photo</label>
            <input type="file" id="dp-photo" accept="image/*" capture="environment" style="display:none;" onchange="previewDayPhoto(this)">
          </div>
        </div>
        <input type="hidden" id="dp-photo-url" value="${existing&&existing.photo_url?esc(existing.photo_url):''}">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="day-photo-save-btn" onclick="saveDayPhotoForm('${date}','${id||''}')">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

async function previewDayPhoto(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('photo-preview').src = reader.result;
    document.getElementById('photo-preview').style.display = '';
    document.getElementById('photo-preview-empty').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function saveDayPhotoForm(date, id){
  const photoFile = document.getElementById('dp-photo').files[0];
  let photo_url = document.getElementById('dp-photo-url').value || null;

  if(!photoFile && !photo_url){
    showToast('Choose a photo first'); return;
  }

  const btn = document.getElementById('day-photo-save-btn');
  btn.disabled = true;
  try{
    if(photoFile){
      btn.textContent = 'Uploading photo…';
      const compressed = await compressImageFile(photoFile);
      photo_url = await uploadPhotoToCloudinary(compressed);
    }
    btn.textContent = 'Saving…';
    if(id){
      await DB.updateDayPhoto(id, { store_id: null, promoter_id: null, photo_url });
    }else{
      await DB.addDayPhoto(date, { store_id: null, promoter_id: null, photo_url });
    }
    await refreshData();
    closeModal();
    render();
    showToast('Day photo saved');
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function deleteDayPhotoRow(id){
  if(!confirm('Delete this day photo?')) return;
  try{
    await DB.deleteDayPhoto(id);
    await refreshData();
    render();
    showToast('Day photo deleted');
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}