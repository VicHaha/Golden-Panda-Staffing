// ============================================================
// Sales data helpers — SKU naming/grouping, auto-seeding of each working
// day's rows, the add/edit sales form and day photos. The Sales Section
// screen itself lives in js/sales-section.js. Any logged-in promoter can
// edit/delete TODAY's entries (regardless of who logged them); past
// dates are locked for promoters and only editable from the office app.
// ============================================================

// Fixed default SKU list. Keep this order in the app; do not alphabetize it.
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
// always be overridden by hand, per row. Matched case-insensitively.
const GIVEAWAY_ITEMS = ['Gift Set', 'Sample Set', 'Flyer', 'Coupon'];
function canonicalSkuName(name){
  const raw = (name || '').trim();
  const replacements = { 'Small Samples':'Sample Set', 'Coupons':'Coupon' };
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

// ---------------- Outlet grouping ----------------
// A single working date can end up with reports from more than one
// outlet/store (e.g. a promoter covers two malls in one day). The Sales
// Section shows one table per outlet. Rows with no store selected are
// grouped under a single "Unspecified" outlet.
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

// Full SKU names for the product field: the standard list plus any name
// already used in a record.
function getSkuSuggestions(){
  const names = new Set(PRODUCT_SUGGESTIONS);
  salesReports.forEach(r=>{ if(r.product_name) names.add(canonicalSkuName(r.product_name)); });
  return [...names];
}

function getProductSuggestions(){
  const bases = new Set([...VARIANT_BASE_PRODUCTS, ...GIVEAWAY_ITEMS]);
  salesReports.forEach(r => { if(r.product_name) bases.add(parseProductName(r.product_name).base); });
  return [...bases];
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

function scheduledStoreIdForDate(date, promoterId){
  if(promoterId === undefined) promoterId = currentPromoterId;
  const datedJobs = jobs.filter(j=>j.work_date===date && (j.store_id || (j.stores&&j.stores.id)));
  const matched = promoterId ? datedJobs.find(j=>j.promoter_id===promoterId) : null;
  const job = matched || datedJobs[0];
  return job ? (job.store_id || (job.stores&&job.stores.id) || null) : null;
}

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

// Who logged a sales report row — the promoter if it came from the
// Promoters app, otherwise the admin's typed-in name if it was saved
// from the office app (see logged_by_admin_name), falling back to a
// generic "Admin" for rows saved before that was tracked.
function loggedByLabel(r){
  if(r.promoters) return displayName(r.promoters);
  return r.logged_by_admin_name || 'Admin';
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
// after the last photo (only for today — past dates are locked).
function renderDayPhotoRow(date, isToday){
  const photos = dayPhotos.filter(d => d.work_date === date);
  const photoThumbs = photos.map(dp => `
    <div class="day-photo-thumb" role="button" tabindex="0" onclick="openPhotoLightbox('${esc(dp.photo_url||'')}','Photo from ${formatDateLong(date)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPhotoLightbox('${esc(dp.photo_url||'')}','Photo from ${formatDateLong(date)}')}" title="Enlarge photo" aria-label="Enlarge day photo">
      ${dp.photo_url
        ? `<img src="${esc(dp.photo_url)}" alt="Day photo">`
        : `<div class="day-photo-thumb-empty">📷</div>`}
      ${isToday ? `<button class="day-photo-thumb-delete" onclick="event.stopPropagation(); closeModal(); deleteDayPhotoRow('${dp.id}')" title="Delete">✕</button>` : ''}
    </div>
  `).join('');

  if(!isToday) return `<div class="day-photo-section"><div class="day-photo-heading"><span>Photo of the day</span></div><div class="day-photo-strip">${photoThumbs}</div></div>`;

  const addThumb = `
    <div class="day-photo-thumb day-photo-add" onclick="closeModal(); openDayPhotoForm('${date}')" title="Add day photo">＋</div>
  `;

  return `<div class="day-photo-section"><div class="day-photo-heading"><span>Photo of the day</span></div><div class="day-photo-strip">${photoThumbs}${addThumb}</div></div>`;
}

function openSalesForm(id, reuseOverlay=false){
  const editing = id ? salesReports.find(r=>r.id===id) : null;
  if(!editing && !scheduledStoreIdsForDate(todayStr()).size){ showToast('Today is not a working date — nothing to record'); return; }
  const today = todayStr();
  if(editing && editing.work_date !== today){
    showToast("Only today's reports can be edited"); return;
  }
  const defaultStoreId = editing ? editing.store_id : scheduledStoreIdForDate(today,currentPromoterId);
  const existing = reuseOverlay ? document.querySelector('.modal-overlay') : null;
  const overlay = existing || document.createElement('div');
  if(existing) overlay.classList.add('sales-modal-reuse');
  if(!existing) overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="form-title-row"><div class="modal-title">${editing ? 'Edit stock report' : 'Add stock report'}</div><button type="button" class="calculator-launch" onclick="openCalculator(this)" aria-label="Open calculator" title="Calculator">🧮</button></div>
      <div class="field-hint" style="margin-bottom:12px;">Logging as <b>${esc(currentPromoterName)}</b> · ${formatDateLong(today)}</div>
      <div class="field">
        <label>Store (optional)</label>
        <select id="s-store">
          ${storeOptionsHtml(defaultStoreId, !!editing)}
        </select>
      </div>
      <div class="field-row">
        <div class="field" style="flex:1;">
          <label>Product name (full SKU, e.g. 1L Bio Dishwash (Bidara))</label>
          <input id="s-product" list="product-list" value="${editing?esc(editing.product_name):''}" placeholder="e.g. 1L Bio Dishwash (Bidara)" oninput="onProductNameChange()" onchange="onProductNameChange()">
          <datalist id="product-list">${getSkuSuggestions().map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="field">
        <label class="checkbox-row">
          <input type="checkbox" id="s-free-item" ${(editing?isFreeItem(editing):isGiveaway(''))?'checked':''} onchange="onFreeItemToggle()">
          Free item (given away, not sold)
        </label>
      </div>
      <div class="qty-row" id="s-qty-row">
        <div id="s-free-fields" style="display:none;">
        <div class="field"><label for="s-opening">Opening</label><input id="s-opening" type="number" inputmode="numeric" min="0" step="1" oninput="updateFreeVariance()" value="${editing?editing.opening_qty:''}" placeholder="0"></div>
        <div class="field"><label for="s-closing">Closing</label><input id="s-closing" type="number" inputmode="numeric" min="0" step="1" oninput="updateFreeVariance()" value="${editing?editing.closing_qty:''}" placeholder="0"></div>
      </div>
      <div class="field qty-small">
        <label id="s-sales-label" for="s-sales">Sales qty</label>
        <input id="s-sales" type="number" inputmode="numeric" min="0" step="1" oninput="updateFreeVariance()" value="${editing?editing.sales_qty:''}" placeholder="0">
      </div>
      </div>
      <div class="field-hint" id="s-variance" style="display:none;"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="sales-save-btn" onclick="saveSalesForm('${editing?editing.id:''}')">Save</button>
      </div>
      ${editing ? `<button type="button" class="btn btn-danger-ghost btn-block sales-delete-action" onclick="deleteSalesReport('${editing.id}')">Delete this record</button>` : ''}
    </div>
  `;
  if(!existing){
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  }
  salesFormFreeItemTouched = false;
  salesFormDerivedFieldTouched = false;
  salesFormLastFreeItem = null;
  applyFreeItemFieldLayout();
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
// Variance = opening - closing - given out (0 means it tallies). Shown for
// free items; the Excel export calculates the same figure for every row.
function updateFreeVariance(){
  const box = document.getElementById('s-variance');
  if(!box) return;
  const free = document.getElementById('s-free-item').checked;
  box.style.display = free ? '' : 'none';
  if(!free) return;
  const opening = parseFloat(document.getElementById('s-opening').value) || 0;
  const closing = parseFloat(document.getElementById('s-closing').value) || 0;
  const given = parseFloat(document.getElementById('s-sales').value) || 0;
  const variance = opening - closing - given;
  box.textContent = variance === 0 ? 'Variance 0 — tallies' : `Variance ${variance > 0 ? '+' : '−'}${Math.abs(variance)}`;
  box.className = 'field-hint ' + (variance === 0 ? 'variance-ok' : 'variance-off');
}

function applyFreeItemFieldLayout(){
  const giveaway = document.getElementById('s-free-item').checked;
  document.getElementById('s-sales-label').textContent = giveaway ? 'Given out' : 'Sales qty';
  // Free items: Opening, Closing and Given out sit side by side in one row.
  document.getElementById('s-free-fields').style.display = giveaway ? 'contents' : 'none';
  document.getElementById('s-qty-row').classList.toggle('free', giveaway);
  updateFreeVariance();
}

async function saveSalesForm(id){
  const editing = id ? salesReports.find(r=>r.id===id) : null;
  const work_date = todayStr(); // promoters can only ever save into today
  const store_id = document.getElementById('s-store').value || null;
  const productBase = document.getElementById('s-product').value.trim();
  const product_name = canonicalSkuName(productBase);
  // Bug fix: the checkbox is normally kept in sync live via
  // onProductNameChange() as the product name is typed — but selecting a
  // suggestion from the datalist dropdown (tap/click, not typing) doesn't
  // reliably fire an 'input' event on every browser, so the checkbox can
  // be stale by the time Save is tapped. To make sure a known giveaway
  // (Gift Set/Flyer/Small Samples/Coupons) is never silently saved as a
  // regular product, re-derive the guess from the actual typed name at
  // save time too — but only when the person hasn't manually touched the
  // checkbox themselves (salesFormFreeItemTouched), so a deliberate
  // override (ticking/unticking by hand) is still always respected.
  const checkboxChecked = document.getElementById('s-free-item').checked;
  const is_free_item = salesFormFreeItemTouched ? checkboxChecked : (checkboxChecked || isGiveaway(productBase));
  const sales_qty = parseFloat(document.getElementById('s-sales').value) || 0;
  // Opening/closing stock and remarks are edited in Stock Management.
  const opening_qty = is_free_item ? (parseFloat(document.getElementById('s-opening').value) || 0) : (editing ? Number(editing.opening_qty||0) : 0);
  const closing_qty = is_free_item ? (parseFloat(document.getElementById('s-closing').value) || 0) : (editing ? Number(editing.closing_qty||0) : 0);
  const remarks = editing ? (editing.remarks || null) : null;
  // Photos are no longer captured per product — see the "Day photo" row
  // for one overall photo per working date. Editing an older row that
  // still has a legacy photo_url leaves it untouched.
  const photo_url = editing ? (editing.photo_url || null) : null;

  if(!productBase){
    showToast('Product name is required'); return;
  }
  if(!editing && !store_id){ showToast('Choose the outlet'); return; }

  const btn = document.getElementById('sales-save-btn');
  btn.disabled = true;
  try{
    const payload = { work_date, store_id, promoter_id: currentPromoterId, product_name, opening_qty, sales_qty, closing_qty, remarks, photo_url, is_free_item };
    btn.textContent = 'Saving…';
    if(id){
      await DB.updateSalesReport(id, payload);
    }else{
      await DB.addSalesReport(payload);
    }
    await refreshData();
    closeModal();
    salesViewDate = null; // promoters only ever save into today
    salesLog = await DB.getSalesLogForDate(salesViewDateValue()).catch(()=>salesLog);
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
  const entry = salesReports.find(r=>r.id===id);
  if(entry && entry.work_date !== todayStr()){
    showToast("Only today's reports can be deleted"); return;
  }
  if(!confirm("Delete this product's stock report?")) return;
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
  overlay.innerHTML = `<button type="button" class="photo-lightbox-close" onclick="closePhotoLightbox()" aria-label="Close enlarged photo">✕</button><img src="${esc(url)}" alt="${esc(alt || 'Enlarged day photo')}">`;
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
    showToast('Camera access is not available in this browser'); return;
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
  const today = todayStr();
  if(date !== today){
    showToast("Only today's photo can be edited"); return;
  }
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
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

async function saveDayPhotoForm(date, id){
  if(date !== todayStr()){
    showToast("Only today's photo can be edited"); return;
  }
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
      await DB.updateDayPhoto(id, { store_id: null, promoter_id: currentPromoterId, photo_url });
    }else{
      await DB.addDayPhoto(date, { store_id: null, promoter_id: currentPromoterId, photo_url });
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
  const dp = dayPhotos.find(d => d.id === id);
  if(dp && dp.work_date !== todayStr()){
    showToast("Only today's photos can be deleted"); return;
  }
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
