// ============================================================
// Sales data helpers — SKU naming/grouping, auto-seeding of each working
// day's rows, the add/edit sales form, day photos and day notes. The Sales
// Section screen itself lives in js/sales-section.js; stock-by-location
// figures are edited from Stock Management (js/stock.js).
//
// Also owns the app's one and only Excel export (see exportStockExcel
// below, triggered from the Home screen) — one workbook per day/month:
// Raw Sales Data, Sales Summary by Outlet, Raw Stock Data, Outlet
// Performance, Customer Analysis.
// ============================================================

let stockExportMode = 'daily'; // 'monthly' | 'daily'
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

// Shift label map — same purpose as AGE_RANGE_LABELS above (Excel export
// only), mirrors the Promoters app's shift.js. Keep in sync.
const SHIFT_LABELS = {
  before_break: 'Before Break (10am–2pm)',
  after_break: 'After Break (3pm–6pm)'
};

// Fixed default SKU list. The array order is the business display order
// used in Sales, Stock Management, and exports; it must not be alphabetized.
const PRODUCT_SUGGESTIONS = [
  '1L Bio Dishwash (Bidara)',
  '1L Bio Dishwash (Ginger)',
  '1L Bio Dishwash (Melon)',
  '480ml Bio Dishwash Refill (Bidara)',
  '480ml Bio Dishwash Refill (Ginger)',
  '480ml Bio Dishwash Refill (Melon)',
  'Gift Set',
  'Sample Set',
  'Flyer',
  'Coupon'
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
const VARIANT_BASE_PRODUCTS = ['1L Bio Dishwash', '480ml Bio Dishwash Refill'];

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
const GIVEAWAY_ITEMS = ['Gift Set', 'Sample Set', 'Flyer', 'Coupon'];

// Normalizes former labels to the new fixed labels so historic records
// keep their position and can still provide carry-forward stock.
function canonicalSkuName(name){
  const raw = (name || '').trim();
  const replacements = {
    'Small Samples':'Sample Set',
    'Coupons':'Coupon'
  };
  if(replacements[raw]) return replacements[raw];
  const oneL = /^(?:Bio Dishwash 1L|1L Bio Dishwash)\s*\((Bidara|Ginger|Melon)\)$/i.exec(raw);
  if(oneL) return `1L Bio Dishwash (${oneL[1][0].toUpperCase()}${oneL[1].slice(1).toLowerCase()})`;
  const refill = /^(?:Refill Bio Dishwash 480ml|480ml Bio Dishwash Refill)\s*\((Bidara|Ginger|Melon)\)$/i.exec(raw);
  if(refill) return `480ml Bio Dishwash Refill (${refill[1][0].toUpperCase()}${refill[1].slice(1).toLowerCase()})`;
  return raw;
}

function skuOrderIndex(nameOrReport){
  const name = typeof nameOrReport === 'string' ? nameOrReport : (nameOrReport && nameOrReport.product_name);
  const index = PRODUCT_SUGGESTIONS.indexOf(canonicalSkuName(name));
  return index === -1 ? PRODUCT_SUGGESTIONS.length : index;
}

function compareSkuNames(a, b){
  return skuOrderIndex(a) - skuOrderIndex(b);
}
function isGiveaway(productName){
  const canonical = canonicalSkuName(productName).toLowerCase();
  return GIVEAWAY_ITEMS.some(g => g.toLowerCase() === canonical);
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
  Object.values(grouped).forEach(group => group.sort((a,b)=>skuOrderIndex(a)-skuOrderIndex(b)));
  return grouped;
}

// Product tabs are data-driven. The two default product families keep
// their business order, custom products become their own tabs, and all
// giveaway SKUs share one final Free tab.
function groupByProductTabs(items, includeFree=true){
  const ordered = [...items].sort((a,b)=>skuOrderIndex(a)-skuOrderIndex(b));
  const sellable = ordered.filter(item=>!isFreeItem(item));
  const groups = [];
  const used = new Set();
  const addBase = base=>{
    const rows = sellable.filter(item=>parseProductName(canonicalSkuName(item.product_name)).base.toLowerCase()===base.toLowerCase());
    if(!rows.length || used.has(base.toLowerCase())) return;
    used.add(base.toLowerCase());
    groups.push({key:`product-${encodeURIComponent(base.toLowerCase())}`,label:base,items:rows});
  };
  VARIANT_BASE_PRODUCTS.forEach(addBase);
  sellable.forEach(item=>addBase(parseProductName(canonicalSkuName(item.product_name)).base));
  const freeRows = includeFree ? ordered.filter(isFreeItem) : [];
  if(freeRows.length) groups.push({key:'free',label:'Free',items:freeRows});
  return groups;
}

function activeProductTab(stateKey, groups, state){
  const current = state[stateKey];
  if(current && groups.some(group=>group.key===current)) return current;
  return groups.length ? groups[0].key : null;
}

let salesActiveTab = {};

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
    <button type="button" class="stock-tab ${active===g.key?'active':''}" aria-pressed="${active===g.key}" onclick="${fn}('${date}','${g.key}')">${esc(g.label)}${g.items.length?` <span class="stock-tab-count">${g.items.length}</span>`:''}</button>
  `).join('')}</div>`;
}

// Combines the fixed suggestions above with any product names already
// used in past reports, so custom products you've added before show up
// as suggestions too — the list grows on its own. Only base names are
// suggested here (no variation suffix); the Variation field next to it
// handles the flavor.
function getProductSuggestions(){
  const bases = new Set([...VARIANT_BASE_PRODUCTS, ...GIVEAWAY_ITEMS]);
  salesReports.forEach(r => { if(r.product_name) bases.add(parseProductName(r.product_name).base); });
  return [...bases];
}

// Variations are scoped to the selected product. The default dishwash
// families start with Bidara/Ginger/Melon; custom products learn only
// their own previously-entered variations. The input remains free text,
// so a new variation can always be typed.
function getVariationSuggestions(productBase){
  const selectedBase = (productBase||'').trim();
  const variations = new Set();
  if(VARIANT_BASE_PRODUCTS.some(base=>base.toLowerCase()===selectedBase.toLowerCase())){
    VARIATIONS.forEach(variation=>variations.add(variation));
  }
  salesReports.forEach(r => {
    if(!r.product_name) return;
    const parsed = parseProductName(canonicalSkuName(r.product_name));
    if(parsed.base.toLowerCase()===selectedBase.toLowerCase() && parsed.variation) variations.add(parsed.variation);
  });
  return [...variations];
}

function updateVariationDatalist(productInputId, listId){
  const productInput = document.getElementById(productInputId);
  const list = document.getElementById(listId);
  if(!productInput || !list) return;
  list.innerHTML = getVariationSuggestions(productInput.value).map(variation=>`<option value="${esc(variation)}">`).join('');
}

function todayStr(){
  return localDateStr();
}

// Default outlet for Sales/Stock comes from the schedule. A promoter-specific
// match wins when supplied; otherwise use the first scheduled outlet that day.
function scheduledStoreIdForDate(date, promoterId){
  const datedJobs = jobs.filter(j=>j.work_date===date && (j.store_id || (j.stores&&j.stores.id)));
  const matched = promoterId ? datedJobs.find(j=>j.promoter_id===promoterId) : null;
  const job = matched || datedJobs[0];
  return job ? (job.store_id || (job.stores&&job.stores.id) || null) : null;
}

// Fills only blank locations. A location chosen manually is never replaced.
async function linkUnassignedSalesRecordsToJob(date, storeId){
  if(!date || !storeId) return;
  const unassigned = salesReports.filter(r=>r.work_date===date && !r.store_id);
  for(const row of unassigned){
    await DB.updateSalesReport(row.id,{store_id:storeId});
    row.store_id = storeId;
    row.stores = stores.find(s=>s.id===storeId) || row.stores || null;
  }
}

// Rows with no outlet get one only when exactly one outlet is scheduled that
// day — with several outlets it would be a guess.
async function linkAllScheduledLocations(){
  const dates = [...new Set(salesReports.filter(r=>!r.store_id).map(r=>r.work_date))];
  for(const date of dates){
    const ids = jobStoreIdsForDate(date);
    if(ids.size === 1) await linkUnassignedSalesRecordsToJob(date,[...ids][0]);
  }
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

// ---------- Per-outlet stock rows ----------
// Every outlet keeps its OWN stock: its own SKU list, its own locations and
// its own counts for each of ITS working dates. Rows are only created for an
// outlet on a date it has a job, and opening stock is carried forward from
// THAT outlet's previous working date — never from another outlet's counts.

function storeRows(storeId){
  return salesReports.filter(r=>(r.store_id||null) === (storeId||null));
}

// The outlet's rows from its most recent working date before `date`.
function previousRowsForStore(storeId, date){
  const rows = storeRows(storeId).filter(r=>r.work_date < date);
  if(!rows.length) return [];
  const last = rows.reduce((max,r)=>r.work_date > max ? r.work_date : max, '');
  return rows.filter(r=>r.work_date === last);
}

// Brings stock/sales rows in line with the Schedule (jobs table): every outlet
// with a job today gets its rows right away. Runs on load, when a job is saved
// in the office app, and whenever the jobs table changes anywhere. Returns
// true if it created or changed any rows.
let stockSyncRunning = false;
async function syncStockWithSchedule(){
  if(stockSyncRunning) return false;
  stockSyncRunning = true;
  try{
    salesReports = await DB.getSalesReports(); // fresh copy, so two devices don't both seed
    const before = salesReports.length;
    await linkAllScheduledLocations();
    await ensureTodaysStockRows();
    return salesReports.length !== before;
  }finally{
    stockSyncRunning = false;
  }
}

// Creates today's rows (and catches up any missed working dates) for every
// outlet that has a job. An outlet with no stock history yet starts from today
// only; one with history carries on from its last recorded working date.
// Safe to call every load — it only inserts what's missing.
async function ensureTodaysStockRows(){
  const today = todayStr();
  const pairs = new Map();
  jobs.forEach(job=>{
    const storeId = jobStoreId(job);
    if(storeId && job.work_date <= today) pairs.set(`${job.work_date}|${storeId}`, { date: job.work_date, storeId });
  });
  const ordered = [...pairs.values()].sort((a,b)=>a.date.localeCompare(b.date));
  for(const { date, storeId } of ordered){
    const lastDate = storeRows(storeId).reduce((max,r)=>r.work_date > max ? r.work_date : max, '');
    if(lastDate ? date <= lastDate : date !== today) continue;
    await ensureStockRowsForStore(date, storeId);
  }
}

// Creates the missing SKU rows for one outlet on one working date. The SKU
// list is the one this outlet used on its previous working date (a brand-new
// outlet starts from the default list); each SKU's opening and closing figures
// per location start from that outlet's last closing count. Gift Set / Sample
// Set / Flyer / Coupon default to free items (editable per row).
async function ensureStockRowsForStore(date, storeId){
  const existing = new Set(storeRows(storeId).filter(r=>r.work_date === date).map(r=>canonicalSkuName(r.product_name)));
  const prior = previousRowsForStore(storeId, date);
  const plan = [];
  if(prior.length){
    const seen = new Set();
    prior.forEach(row=>{
      const key = canonicalSkuName(row.product_name);
      if(seen.has(key)) return;
      seen.add(key);
      plan.push({ name: row.product_name, free: isFreeItem(row), source: row });
    });
  }else{
    PRODUCT_SUGGESTIONS.forEach(name=>plan.push({ name, free: isGiveaway(name), source: null }));
  }
  for(const item of plan){
    if(existing.has(canonicalSkuName(item.name))) continue;
    const carried = item.source ? locationMapForStore(locationMap(item.source,'closing'), storeId) : {};
    const total = locationMapTotal(carried, storeId);
    try{
      const created = await DB.addSalesReport({
        work_date: date,
        store_id: storeId,
        promoter_id: null,
        product_name: item.name,
        opening_qty: total,
        sales_qty: 0,
        closing_qty: total,
        remarks: null,
        photo_url: null,
        is_free_item: item.free,
        location_qty: { ...carried },
        closing_location_qty: { ...carried }
      });
      // Keep the local cache current so later dates processed in this run
      // carry forward from the row we just created.
      salesReports.push(created);
    }catch(e){
      console.warn('Could not auto-create row for', item.name, 'on', date, e);
    }
  }
}

// When an outlet's closing count is edited, keep that SAME outlet's next
// working date in sync. Untouched auto-seeded rows move opening and closing
// together; rows with activity keep their closing count.
async function carryClosingToNextEvent(productName, workDate, closingQty, locations=null, storeId=null){
  const sid = storeId || null;
  const dates = new Set();
  salesReports.forEach(r=>{ if((r.store_id||null) === sid && r.work_date > workDate) dates.add(r.work_date); });
  jobs.forEach(j=>{ if((jobStoreId(j)||null) === sid && j.work_date > workDate) dates.add(j.work_date); });
  const nextDate = [...dates].sort()[0];
  if(!nextDate) return;
  const nextRows = salesReports.filter(r=>
    r.work_date === nextDate && (r.store_id||null) === sid && canonicalSkuName(r.product_name) === canonicalSkuName(productName)
  );
  const carried = locations ? locationMapForStore(locations, sid) : null;
  for(const row of nextRows){
    const untouched = Number(row.sales_qty||0) === 0 && Number(row.closing_qty||0) === Number(row.opening_qty||0);
    const update = { opening_qty:Number(closingQty||0) };
    if(carried) update.location_qty = { ...carried };
    if(untouched) update.closing_qty = Number(closingQty||0);
    if(untouched && carried) update.closing_location_qty = { ...carried };
    await DB.updateSalesReport(row.id, update);
  }
}

// Any number of overall photos allowed per working date (booth/table
// setup, crowd shots, etc.) — separate from each product's own
// opening/sales/closing row. All of a date's photos sit in a single
// horizontally-scrolling row of thumbnails, with an "add" tile right
// after the last photo so another can be added on top.
function renderDayPhotoRow(date){
  const photos = dayPhotos.filter(d => d.work_date === date);
  const photoThumbs = photos.map(dp => `
    <div class="day-photo-thumb" role="button" tabindex="0" onclick="openPhotoLightbox('${esc(dp.photo_url||'')}','Photo from ${formatDateLong(date)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPhotoLightbox('${esc(dp.photo_url||'')}','Photo from ${formatDateLong(date)}')}" title="Enlarge photo" aria-label="Enlarge day photo">
      ${dp.photo_url
        ? `<img src="${esc(dp.photo_url)}" alt="Day photo">`
        : `<div class="day-photo-thumb-empty">📷</div>`}
      <button class="day-photo-thumb-delete" onclick="event.stopPropagation(); closeModal(); deleteDayPhotoRow('${dp.id}')" title="Delete">✕</button>
    </div>
  `).join('');

  const addThumb = `
    <button type="button" class="day-photo-thumb day-photo-add" onclick="closeModal();openDayPhotoForm('${date}')" title="Add day photo" aria-label="Add day photo">＋</button>
  `;

  return `<div class="day-photo-section">
    <div class="day-photo-heading"><span>Photo of the day</span></div>
    <div class="day-photo-strip">${photoThumbs}${addThumb}</div>
  </div>`;
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
      <label for="day-feedback-${safeDate}">Notes</label>
      <textarea id="day-feedback-${safeDate}" rows="2" placeholder="Add notes for this date (optional)" oninput="onDayFeedbackInput('${date}')">${esc(value)}</textarea>
      <div class="day-feedback-actions">
        <span class="field-hint" id="day-feedback-hint-${safeDate}"></span>
        <button type="button" class="btn btn-gold btn-sm" id="day-feedback-save-${safeDate}" style="display:none;" onclick="saveDayFeedback('${date}')">Save notes</button>
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
    showToast('Could not save notes — ' + (e.message || 'check your connection'));
    if(btn){ btn.disabled = false; btn.textContent = 'Save notes'; }
  }
}

function openSalesForm(id, reuseOverlay=false){
  const editing = id ? salesReports.find(r=>r.id===id) : null;
  if(!editing && !scheduledStoreIdsForDate(todayStr()).size){ showToast('Today is not a working date — nothing to record'); return; }
  // Matches the promoter app's form exactly: no Logged-by field, and no
  // Date field either for brand-new rows (those always land on today —
  // auto-seeded rows already cover past dates). Editing an existing row
  // keeps promoter_id untouched, but the date itself is editable inline
  // right where it was already being shown (no new field added) — the
  // admin can move a report to a different date if it was logged wrong.
  const formDate = editing ? editing.work_date : todayStr();
  const defaultStoreId = editing ? editing.store_id : scheduledStoreIdForDate(formDate);
  const existing = reuseOverlay ? document.querySelector('.modal-overlay') : null;
  const overlay = existing || document.createElement('div');
  if(existing) overlay.classList.add('sales-modal-reuse');
  if(!existing) overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="form-title-row"><div class="modal-title">${editing ? 'Edit stock report' : 'Add stock report'}</div><button type="button" class="calculator-launch" onclick="openCalculator(this)" aria-label="Open calculator" title="Calculator">🧮</button></div>
      <div class="field-hint" style="margin-bottom:12px;">Entered by <b>${esc(currentAdminName || 'Admin')}</b> · ${editing ? `<input type="date" id="s-date" class="date-edit-input" value="${formDate}">` : formatDateLong(formDate)}</div>
      <div class="field">
        <label>Store (optional)</label>
        <select id="s-store">
          ${storeOptionsHtml(defaultStoreId, !!editing)}
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
          <input id="s-variation" list="variation-list" value="${editing?esc(parseProductName(editing.product_name).variation):''}" placeholder="Type any variation" oninput="onProductNameChange()">
          <datalist id="variation-list">${getVariationSuggestions(editing?parseProductName(editing.product_name).base:'').map(v=>`<option value="${esc(v)}">`).join('')}</datalist>
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
      <div class="field-row" id="s-free-fields" style="display:none;">
        <div class="field"><label for="s-opening">Opening</label><input id="s-opening" type="number" inputmode="numeric" min="0" step="1" value="${editing?editing.opening_qty:''}" placeholder="0"></div>
        <div class="field"><label for="s-closing">Closing</label><input id="s-closing" type="number" inputmode="numeric" min="0" step="1" value="${editing?editing.closing_qty:''}" placeholder="0"></div>
      </div>
      <div class="field qty-small">
        <label id="s-sales-label" for="s-sales">Sales qty</label>
        <input id="s-sales" type="number" inputmode="numeric" min="0" step="1" value="${editing?editing.sales_qty:''}" placeholder="0">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="sales-save-btn" onclick="saveSalesForm('${editing?editing.id:''}')">Save</button>
      </div>
      ${editing ? `<button type="button" class="btn btn-danger-ghost btn-block sales-delete-action" onclick="deleteSalesReport('${editing.id}')">Delete this record</button>` : ''}
    </div>
  `;
  if(!existing){
    showModal(overlay);
    overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  }
  // Once the person has hand-toggled the checkbox, typing further in the
  // product name field stops overriding their choice.
  salesFormFreeItemTouched = false;
  salesFormDerivedFieldTouched = false;
  salesFormLastFreeItem = null;
  applyFreeItemFieldLayout(); // set the right field layout immediately, e.g. when editing a giveaway item
}

// Tracks whether the person has manually ticked/unticked the "Free item"
// checkbox in the currently-open form — once true, typing in the product
// name field no longer overwrites their choice.
let salesFormFreeItemTouched = false;
let salesFormDerivedFieldTouched = false;
let salesFormLastFreeItem = null;

// Re-guesses the "Free item" checkbox from the product name as you type —
// but only until the person manually touches the checkbox themselves.
function onProductNameChange(){
  if(typeof updateVariationDatalist === 'function') updateVariationDatalist('s-product','variation-list');
  if(!salesFormFreeItemTouched){
    document.getElementById('s-free-item').checked = isGiveaway(document.getElementById('s-product').value);
  }
  applyFreeItemFieldLayout();
}

function onFreeItemToggle(){
  salesFormFreeItemTouched = true;
  applyFreeItemFieldLayout();
}

// The one quantity box is "Sales qty", or "Given out" for free items.
// Free items record opening, closing and given out right here (they are not
// in Stock Management). Other products only take a sales quantity — their
// opening and closing are kept in Stock Management.
function applyFreeItemFieldLayout(){
  const giveaway = document.getElementById('s-free-item').checked;
  document.getElementById('s-sales-label').textContent = giveaway ? 'Given out' : 'Sales qty';
  document.getElementById('s-free-fields').style.display = giveaway ? '' : 'none';
}

async function saveSalesForm(id){
  const editing = id ? salesReports.find(r=>r.id===id) : null;
  // No Date field for brand-new rows (matches the promoter app) — those
  // always save into today. Editing an existing row reads the date back
  // out of the inline date input added to the form above; if it was
  // somehow left blank, fall back to the original date rather than
  // silently moving the report to today. promoter_id is kept as-is.
  const work_date = editing ? (document.getElementById('s-date').value || editing.work_date) : todayStr();
  const promoter_id = editing ? (editing.promoter_id || null) : null;
  const store_id = document.getElementById('s-store').value || null;
  const productBase = document.getElementById('s-product').value.trim();
  const variation = document.getElementById('s-variation').value;
  const product_name = composeProductName(productBase, variation);
  const is_free_item = document.getElementById('s-free-item').checked;
  const sales_qty = parseFloat(document.getElementById('s-sales').value) || 0;
  // Opening/closing stock and remarks are edited in Stock Management.
  const opening_qty = is_free_item ? (parseFloat(document.getElementById('s-opening').value) || 0) : (editing ? Number(editing.opening_qty||0) : 0);
  const closing_qty = is_free_item ? (parseFloat(document.getElementById('s-closing').value) || 0) : (editing ? Number(editing.closing_qty||0) : 0);
  const remarks = editing ? (editing.remarks || null) : null;
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
  if(!editing && !store_id){ showToast('Choose the outlet'); return; }

  const btn = document.getElementById('sales-save-btn');
  btn.disabled = true;
  try{
    btn.textContent = 'Saving…';
    // Note: this form never touches the per-location quantities
    // (location_qty / closing_location_qty) — those live in the separate Stock
    // Management section (js/stock.js) now, and are left exactly as they
    // were on this row (defaulting to 0 for a brand-new row).
    const payload = { work_date, store_id, promoter_id, product_name, opening_qty, sales_qty, closing_qty, remarks, photo_url, is_free_item, logged_by_admin_name };
    if(id){
      await DB.updateSalesReport(id, payload);
    }else{
      await DB.addSalesReport(payload);
    }
    await refreshData();
    closeModal();
    salesViewDate = work_date === todayStr() ? null : work_date;
    salesLog = await DB.getSalesLogForDate(salesViewDateValue()).catch(()=>[]);
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
    closeModal();
    render();
    showToast('Stock report deleted');
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}

// ---------------- Excel export (day or month, everything in one file) ----------------
// This is the ONE export in the app. One workbook per period, 5 sheets:
// Raw Sales Data, Sales Summary by Outlet, Raw Stock Data, Outlet
// Performance, Customer Analysis. Reads
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

// One Stock Excel row per date + outlet + SKU. If older app versions
// created duplicates, keep only the row most recently saved.
function latestStockRowsForExport(rows){
  const latest = new Map();
  rows.forEach(row=>{
    const key = `${row.work_date}|${row.store_id||'__none__'}|${canonicalSkuName(row.product_name).toLowerCase()}`;
    const prior = latest.get(key);
    const savedAt = Date.parse(row.updated_at||row.created_at||'') || 0;
    const priorSavedAt = prior ? (Date.parse(prior.updated_at||prior.created_at||'') || 0) : -1;
    if(!prior || savedAt>=priorSavedAt) latest.set(key,row);
  });
  return [...latest.values()];
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
  // Row order: date, then outlet, then — within the same date+outlet —
  // 1L Bio Dishwash bottles first, then Refill, then all the free
  // giveaway items last (same bottle/refill/free grouping as the
  // on-screen stock tabs and the Sales Summary by Outlet sheet), then
  // alphabetically by product/variation as the final tiebreaker.
  const rawCategoryOrder = { bottle:0, refill:1, free:2 };
  const rawSalesRows = [...salesRows]
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || outletLabel(a).localeCompare(outletLabel(b))
      || rawCategoryOrder[stockCategoryKey(a)] - rawCategoryOrder[stockCategoryKey(b)]
      || compareSkuNames(a.product_name,b.product_name))
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
  // Sheet 2 — Sales Summary by Outlet
  // ============================================================
  // Grouped by Outlet + Product + Variation only — never split by date
  // (per spec). Keyed on outlet + the raw product_name (rather than the
  // parsed base/variation pair) so multiple variations of the same base
  // product never get merged into one row.
  const summaryHeader = ['Up to Date','Outlet','Product','Variation','Total Given Out','Total Sales During Event'];
  const summaryMap = {};
  salesRows.forEach(r=>{
    const outlet = outletLabel(r);
    const { base, variation } = parseProductName(r.product_name);
    const key = outlet + '|||' + canonicalSkuName(r.product_name);
    if(!summaryMap[key]) summaryMap[key] = { outlet, base, variation, productName: r.product_name, sales:0, given:0, upToDate: r.work_date, isFree: isFreeItem(r) };
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
  // Row order per outlet: 1L Bio Dishwash bottles first, then Refill,
  // then all the free giveaway items last — matching the same
  // bottle/refill/free grouping used for the on-screen stock tabs (see
  // stockCategoryKey above), rather than a plain alphabetical sort.
  const summaryCategoryOrder = { bottle:0, refill:1, free:2 };
  const summaryRows = Object.values(summaryMap)
    .sort((a,b)=> a.outlet.localeCompare(b.outlet)
      || summaryCategoryOrder[stockCategoryKey({ product_name: a.productName, is_free_item: a.isFree })] - summaryCategoryOrder[stockCategoryKey({ product_name: b.productName, is_free_item: b.isFree })]
      || compareSkuNames(a.productName,b.productName))
    .map(v=>{
      return {
        'Up to Date': excelDateCell(maxDateByOutlet[v.outlet]),
        'Outlet': v.outlet,
        'Product': v.base,
        'Variation': v.variation,
        'Total Given Out': v.given,
        'Total Sales During Event': v.sales
      };
    });
  addReportSheet(wb, 'Sales Summary by Outlet', summaryRows, summaryHeader, [13,20,22,14,16,22],
    { 'Up to Date':'dd/mm/yyyy', 'Total Given Out':'#,##0', 'Total Sales During Event':'#,##0' }
  );

  // ============================================================
  // Sheet 3 — Raw Stock Data
  // ============================================================
  // Export the closing location counts for each latest SKU snapshot — one
  // column per active stock location (see js/locations.js), so the sheet
  // follows whatever locations the office has set up. Free items carry no
  // location figures (Stock Management excludes them), so they're left out
  // rather than exporting all-zero rows.
  const exportLocations = activeStockLocations();
  const stockHeader = ['Date','Outlet','Product','Variation',...exportLocations.map(loc=>loc.name),'Total Stock'];
  const stockRows = latestStockRowsForExport(salesRows.filter(r => !isFreeItem(r) && !isGiveaway(r.product_name)))
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || outletLabel(a).localeCompare(outletLabel(b)) || compareSkuNames(a.product_name,b.product_name))
    .map(r=>{
      const { base, variation } = parseProductName(r.product_name);
      const row = {
        'Date': excelDateCell(r.work_date),
        'Outlet': outletLabel(r),
        'Product': base,
        'Variation': variation
      };
      exportLocations.forEach(loc=>{ row[loc.name] = locationQty(r, loc.id, 'closing'); });
      row['Total Stock'] = stockTotal(r, 'closing');
      return row;
    });
  const stockFormats = { 'Date':'dd/mm/yyyy', 'Total Stock':'#,##0' };
  exportLocations.forEach(loc=>{ stockFormats[loc.name] = '#,##0'; });
  addReportSheet(wb, 'Raw Stock Data', stockRows, stockHeader, [12,18,22,14,...exportLocations.map(()=>12),12], stockFormats);

  // ============================================================
  // Sheet 4 — Outlet Performance
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
  // Sheet 5 — Customer Analysis
  // ============================================================
  const custHeader = ['Date','Outlet','Shift','Age Range','Feedback'];
  const custRows = [...shiftRows]
    .filter(r => r.customer_age_range || (r.customer_feedback && r.customer_feedback.trim()))
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || outletLabel(a).localeCompare(outletLabel(b)))
    .map(r=>({
      'Date': excelDateCell(r.work_date),
      'Outlet': outletLabel(r),
      'Shift': SHIFT_LABELS[r.shift] || r.shift || '',
      'Age Range': r.customer_age_range ? (AGE_RANGE_LABELS[r.customer_age_range] || r.customer_age_range) : '',
      'Feedback': r.customer_feedback || ''
    }));
  addReportSheet(wb, 'Customer Analysis', custRows, custHeader, [12,18,22,12,50], { 'Date':'dd/mm/yyyy' }, ['Feedback']);

  freezeFirstRowAndDownload(wb, `Golden_Panda_Report_${daily?'Daily':'Monthly'}_${periodLabel}.xlsx`);
  showToast('Excel file downloaded');
}

// ---------------- Day photo (one overall photo per working date) ----------------

let dayPhotoCameraStream = null;
let capturedDayPhotoBlob = null;

function openPhotoLightbox(url, alt){
  if(!url) return;
  const overlay = document.createElement('div');
  overlay.className = 'photo-lightbox-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','Enlarged day photo');
  overlay.innerHTML = `
    <button type="button" class="photo-lightbox-close" onclick="closePhotoLightbox()" aria-label="Close enlarged photo">✕</button>
    <img src="${esc(url)}" alt="${esc(alt || 'Enlarged day photo')}">
  `;
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closePhotoLightbox(); });
  document.body.appendChild(overlay);
  overlay.querySelector('.photo-lightbox-close').focus();
}

function closePhotoLightbox(){
  const overlay = document.querySelector('.photo-lightbox-overlay');
  if(overlay) overlay.remove();
}

function stopDayPhotoCamera(){
  if(dayPhotoCameraStream){
    dayPhotoCameraStream.getTracks().forEach(track=>track.stop());
    dayPhotoCameraStream = null;
  }
}

async function startDayPhotoCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showToast('Camera access is not available in this browser');
    return;
  }
  try{
    stopDayPhotoCamera();
    dayPhotoCameraStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
    const video = document.getElementById('day-photo-camera');
    video.srcObject = dayPhotoCameraStream;
    document.getElementById('day-photo-camera-panel').hidden = false;
    await video.play();
  }catch(e){
    console.error(e);
    showToast('Camera permission is needed to take a photo');
  }
}

function captureDayPhoto(){
  const video = document.getElementById('day-photo-camera');
  if(!video || !video.videoWidth){ showToast('Camera is still starting'); return; }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  canvas.toBlob(blob=>{
    if(!blob){ showToast('Could not capture photo'); return; }
    capturedDayPhotoBlob = blob;
    const preview = document.getElementById('photo-preview');
    preview.src = URL.createObjectURL(blob);
    preview.style.display = '';
    document.getElementById('photo-preview-empty').style.display = 'none';
    document.getElementById('day-photo-camera-panel').hidden = true;
    stopDayPhotoCamera();
  },'image/jpeg',.9);
}

function openDayPhotoForm(date, id){
  const existing = id ? dayPhotos.find(d => d.id === id) : null;
  capturedDayPhotoBlob = null;
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
            <button type="button" class="btn btn-ghost" onclick="startDayPhotoCamera()">Take photo</button>
            <div class="field-hint">Uses this device's camera.</div>
          </div>
        </div>
        <div class="camera-panel" id="day-photo-camera-panel" hidden>
          <video id="day-photo-camera" playsinline muted></video>
          <div class="camera-actions">
            <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('day-photo-camera-panel').hidden=true;stopDayPhotoCamera()">Cancel camera</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="captureDayPhoto()">Capture</button>
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
  showModal(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

async function saveDayPhotoForm(date, id){
  const photoFile = capturedDayPhotoBlob;
  let photo_url = document.getElementById('dp-photo-url').value || null;

  if(!photoFile && !photo_url){
    showToast('Take a photo first'); return;
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
