// ============================================================
// Sales & Stock — grouped-by-date view. Any logged-in promoter can
// edit/delete TODAY's entries (regardless of who logged them); past
// dates are locked for promoters and only editable from the office app.
// ============================================================

let salesShowPast = false;

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
  refreshSalesSummary(date);
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
  refreshSalesSummary(date);
}
function renderOutletTabs(date, groups, active){
  return `<div class="stock-tabs outlet-tabs">${groups.map(g=>`
    <button class="stock-tab ${active===g.key?'active':''}" onclick="setOutletTab('${date}','${g.key}')">${esc(g.label)}${g.items.length?` <span class="stock-tab-count">${g.items.length}</span>`:''}</button>
  `).join('')}</div>`;
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

function todayStr(){
  return new Date().toISOString().slice(0,10);
}

function scheduledStoreIdForDate(date, promoterId){
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

async function linkAllScheduledLocations(){
  const dates = [...new Set(salesReports.filter(r=>!r.store_id).map(r=>r.work_date))];
  for(const date of dates){
    await linkUnassignedSalesRecordsToJob(date,scheduledStoreIdForDate(date,currentPromoterId));
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
  const scheduledAsc = [...new Set(scheduledDates)]
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
// other product. The actual quantity given out remains user-editable.
async function ensureStockRowsForDate(date){
  const scheduledStoreId = scheduledStoreIdForDate(date,currentPromoterId);
  await linkUnassignedSalesRecordsToJob(date,scheduledStoreId);
  const existingProducts = new Set(salesReports.filter(r => r.work_date === date).map(r => canonicalSkuName(r.product_name)));
  const missing = PRODUCT_SUGGESTIONS.filter(p => !existingProducts.has(canonicalSkuName(p)));
  if(missing.length === 0) return;

  for(const product of missing){
    const giveaway = isGiveaway(product);
    const priorEntries = salesReports
      .filter(r => canonicalSkuName(r.product_name) === canonicalSkuName(product) && r.work_date < date)
      .sort((a,b) => b.work_date.localeCompare(a.work_date));
    const carryOver = priorEntries.length ? Number(priorEntries[0].closing_qty||0) : 0;
    // Warehouse stock (admin-only field, not shown in this app's form) is
    // a running total, not a daily transaction — carry the last known
    // figure forward untouched so it stays correct no matter which app
    // ends up creating the next date's row.
    const warehouseCarryOver = priorEntries.length ? Number(priorEntries[0].warehouse_qty||0) : 0;

    try{
      const created = await DB.addSalesReport({
        work_date: date,
        store_id: scheduledStoreId,
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

async function carryClosingToNextEvent(productName, workDate, closingQty){
  const nextDate = [...new Set([...scheduledDates, ...salesReports.map(r=>r.work_date)])].filter(d=>d>workDate).sort()[0];
  if(!nextDate) return;
  const nextRows = salesReports.filter(r=>
    r.work_date === nextDate && canonicalSkuName(r.product_name) === canonicalSkuName(productName)
  );
  for(const row of nextRows){
    const untouched = Number(row.sales_qty||0) === 0 && Number(row.closing_qty||0) === Number(row.opening_qty||0);
    const update = { opening_qty:Number(closingQty||0) };
    if(untouched) update.closing_qty = Number(closingQty||0);
    await DB.updateSalesReport(row.id, update);
  }
}

function renderSales(){
  if(salesReports.length===0 && dayPhotos.length===0){
    return emptyState('📦','No sales reports yet','Tap + to log opening stock, sales, and closing stock for today.');
  }

  const byDate = {};
  salesReports.forEach(r=>{
    if(!byDate[r.work_date]) byDate[r.work_date] = [];
    byDate[r.work_date].push(r);
  });
  dayPhotos.forEach(dp=>{
    if(!byDate[dp.work_date]) byDate[dp.work_date] = [];
  });
  const allDates = Object.keys(byDate).sort((a,b)=> b.localeCompare(a));
  const today = todayStr();

  // Past dates are hidden by default — tap "Show past reports" to bring
  // them back. They're read-only here either way (editing stays
  // locked to today), this only affects whether they clutter the list.
  const nearDates = allDates.filter(d => d >= today);
  const pastDates = allDates.filter(d => d < today);
  const visibleDates = salesShowPast ? allDates : nearDates;

  let html = `<div class="section-title">Sales &amp; stock reports <span class="count-pill">${allDates.length} date${allDates.length>1?'s':''}</span></div>`;

  if(visibleDates.length === 0){
    html += emptyState('📦','No sales reports yet','Tap + to log opening stock, sales, and closing stock for today.');
  }else{
    html += `<div class="sales-date-grid">${visibleDates.map(date=>{
      const items = byDate[date];
      const totalSales = items.filter(i=>!isFreeItem(i)).reduce((s,i)=>s + Number(i.sales_qty||0), 0);
      const totalGiven = items.filter(i=>isFreeItem(i)).reduce((s,i)=>s + Number(i.sales_qty||0), 0);
      const isToday = date === today;
      return `<button type="button" class="sales-date-card" onclick="openSalesDateSummary('${date}')">
        <span class="sales-date-card-top"><span><strong>${formatDateLong(date)}</strong>${isToday?'<small>Today</small>':'<small class="badge-locked">🔒 Locked</small>'}</span><span class="sales-date-total"><b>${totalSales}</b><small>sold</small></span></span>
        <span class="sales-date-metrics"><span><small>SKUs</small><b>${items.length}</b></span><span><small>Given away</small><b>${totalGiven}</b></span></span>
      </button>`;
    }).join('')}</div>`;
  }

  if(pastDates.length > 0){
    html += `
      <button class="btn btn-ghost btn-block" style="margin-top:14px;" onclick="toggleSalesShowPast()">
        ${salesShowPast ? 'Hide' : 'Show'} past reports (${pastDates.length})
      </button>
    `;
  }

  return html;
}

function toggleSalesShowPast(){
  salesShowPast = !salesShowPast;
  render();
}

// ---------------- Sales date summary modal ----------------
// Tapping a date card opens the full breakdown here. Switching the
// outlet/stock-category tabs while it's open calls refreshSalesSummary()
// below, which only replaces this sheet's own contents — the overlay and
// sheet elements themselves are never removed/recreated, so there's no
// backdrop flash or re-triggered open animation when flipping tabs.
function buildSalesSummaryInner(date){
  const items = salesReports.filter(row=>row.work_date===date);
  const isToday = date === todayStr();
  const totalSales = items.filter(item=>!isFreeItem(item)).reduce((sum,item)=>sum+Number(item.sales_qty||0),0);
  const totalGiven = items.filter(item=>isFreeItem(item)).reduce((sum,item)=>sum+Number(item.sales_qty||0),0);
  const storeNames = [...new Set(items.filter(item=>item.stores).map(item=>item.stores.name))];

  // Split by outlet first (only rendered as tabs when a date actually has
  // more than one outlet) — the product-category tabs below then work on
  // just that outlet's records.
  const outletGroups = groupByOutlet(items);
  const showOutletTabs = outletGroups.length > 1;
  const activeOutletKey = showOutletTabs ? activeOutletTab(date, outletGroups) : null;
  const scopedItems = showOutletTabs ? outletGroups.find(g=>g.key===activeOutletKey).items : items;

  const grouped = groupByStockCategory(scopedItems);
  const active = activeStockTab(date, grouped);
  const activeItems = grouped[active];
  const hasAnyProducts = grouped.bottle.length || grouped.refill.length || grouped.free.length;

  return `
    <div class="stock-summary-head"><div class="modal-title">${formatDateLong(date)}</div><button type="button" class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="sales-summary-meta">${items.length} product${items.length>1?'s':''}${storeNames.length?' · '+esc(storeNames.join(', ')):''} · ${totalSales} sold${totalGiven?` · ${totalGiven} given away`:''}${!isToday?' · Only today can be edited':''}</div>
    ${renderDayPhotoRow(date, isToday)}
    ${showOutletTabs ? renderOutletTabs(date, outletGroups, activeOutletKey) : ''}
    ${hasAnyProducts ? renderStockTabs(date, grouped, active) : ''}
    ${activeItems.length ? renderSalesItems(activeItems, isToday, active==='free') : `<div class="stock-tab-empty">No products in this group yet.</div>`}
  `;
}

function openSalesDateSummary(date){
  const items = salesReports.filter(row=>row.work_date===date);
  const hasPhotos = dayPhotos.some(dp=>dp.work_date===date);
  if(!items.length && !hasPhotos){ showToast('No sales record found for that date'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet sales-summary-sheet" id="sales-summary-sheet">${buildSalesSummaryInner(date)}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

// Refreshes only the sales summary sheet's own contents in place — used
// by tab switches inside the modal so they don't flicker (see above).
function refreshSalesSummary(date){
  const sheet = document.getElementById('sales-summary-sheet');
  if(sheet) sheet.innerHTML = buildSalesSummaryInner(date);
}

// `compact` is used for the Free tab — giveaways don't need the full
// open/sold/close breakdown, just how many went out, so the list stays
// quick to scan while keying in samples/coupons/etc.
function renderSalesItems(items, isToday, compact){
  const loggers = [...new Set(items.map(loggedByLabel))];
  const commonLogger = loggers.length === 1 ? loggers[0] : null;
  const rows = items.map(i=>{
    const giveaway = isFreeItem(i);
    const opening = Number(i.opening_qty||0), sales = Number(i.sales_qty||0), closing = Number(i.closing_qty||0);
    const variance = closing - (opening - sales);
    return `
      <div class="sales-table-row">
        <div class="sales-table-sku">
          <strong>${esc(displayProductName(i))}</strong>
          ${!commonLogger ? `<small>${esc(loggedByLabel(i))}</small>` : ''}
          ${variance !== 0 ? `<span class="sales-variance ${variance<0?'short':'over'}">${variance>0?'+':''}${variance}</span>` : ''}
          ${i.remarks ? `<div class="sales-item-remarks">${esc(i.remarks)}</div>` : ''}
        </div>
        <b class="sales-table-number">${opening}</b>
        <b class="sales-table-number">${sales}</b>
        <b class="sales-table-number">${closing}</b>
        ${isToday ? `
          <button type="button" class="icon-btn" onclick="closeModal();openSalesForm('${i.id}')" aria-label="Edit ${esc(displayProductName(i))}" title="Edit report">✎</button>
        ` : `<div class="sales-locked" title="Only today's reports can be edited">🔒</div>`}
      </div>
    `;
  }).join('');
  return `<div class="sales-table">
    <div class="sales-table-head"><span>SKU</span><span>Opening</span><span>${compact?'Given':'Sold'}</span><span>Closing</span><span aria-hidden="true"></span></div>
    ${rows}
    ${commonLogger ? `<div class="sales-table-footer">Logged by ${esc(commonLogger)}</div>` : ''}
  </div>`;
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
      ${isToday ? `<button type="button" class="day-photo-thumb-edit" onclick="event.stopPropagation(); closeModal(); openDayPhotoForm('${date}','${dp.id}')" title="Retake photo" aria-label="Retake day photo">✎</button><button class="day-photo-thumb-delete" onclick="event.stopPropagation(); closeModal(); deleteDayPhotoRow('${dp.id}')" title="Delete">✕</button>` : ''}
    </div>
  `).join('');

  if(!isToday) return `<div class="day-photo-section"><div class="day-photo-heading"><span>Photo of the day</span></div><div class="day-photo-strip">${photoThumbs}</div></div>`;

  const addThumb = `
    <div class="day-photo-thumb day-photo-add" onclick="closeModal(); openDayPhotoForm('${date}')" title="Add day photo">＋</div>
  `;

  return `<div class="day-photo-section"><div class="day-photo-heading"><span>Photo of the day</span></div><div class="day-photo-strip">${photoThumbs}${addThumb}</div></div>`;
}

function openSalesForm(id){
  const editing = id ? salesReports.find(r=>r.id===id) : null;
  const today = todayStr();
  if(editing && editing.work_date !== today){
    showToast("Only today's reports can be edited"); return;
  }
  const defaultStoreId = editing ? editing.store_id : scheduledStoreIdForDate(today,currentPromoterId);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${editing ? 'Edit stock report' : 'Add stock report'}</div>
      <div class="field-hint" style="margin-bottom:12px;">Logging as <b>${esc(currentPromoterName)}</b> · ${formatDateLong(today)}</div>
      <div class="field">
        <label>Store (optional)</label>
        <select id="s-store">
          <option value="">— Not specified —</option>
          ${stores.map(s=>`<option value="${s.id}" ${defaultStoreId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field" style="flex:1.6;">
          <label>Product name</label>
          <input id="s-product" list="product-list" value="${editing?esc(parseProductName(editing.product_name).base):''}" placeholder="e.g. Bio Dishwash 1L" oninput="onProductNameChange()" onchange="onProductNameChange()">
          <datalist id="product-list">${getProductSuggestions().map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label>Variation (optional)</label>
          <input id="s-variation" list="variation-list" value="${editing?esc(parseProductName(editing.product_name).variation):''}" placeholder="e.g. Bidara" oninput="onProductNameChange()" onchange="onProductNameChange()">
          <datalist id="variation-list">${getVariationSuggestions().map(v=>`<option value="${esc(v)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="field">
        <label class="checkbox-row">
          <input type="checkbox" id="s-free-item" ${(editing?isFreeItem(editing):isGiveaway(''))?'checked':''} onchange="onFreeItemToggle()">
          Free item (given away, not sold)
        </label>
      </div>
      <div class="field"><label>Opening stock</label>
        <div class="qty-stepper">
          <button type="button" class="qty-btn qty-minus" onclick="stepQty('s-opening',-1)" aria-label="Decrease opening stock">−</button>
          <input id="s-opening" type="number" min="0" step="1" value="${editing?editing.opening_qty:''}" placeholder="0">
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
          <input id="s-closing" type="number" min="0" step="1" value="${editing?editing.closing_qty:''}" placeholder="0">
          <button type="button" class="qty-btn qty-plus" onclick="stepQty('s-closing',1)" aria-label="Increase closing stock">+</button>
        </div>
      </div>
      <div class="field" id="given-out-field" style="display:none;">
        <label>Given out</label>
        <div class="qty-stepper">
          <button type="button" class="qty-btn qty-minus" onclick="stepQty('s-given-out',-1)" aria-label="Decrease given out quantity">−</button>
          <input id="s-given-out" type="number" min="0" step="1" value="${editing?editing.sales_qty:''}" placeholder="0">
          <button type="button" class="qty-btn qty-plus" onclick="stepQty('s-given-out',1)" aria-label="Increase given out quantity">+</button>
        </div>
        <div class="field-hint">Enter the quantity actually distributed.</div>
      </div>
      <div class="field"><label>Remarks (optional)</label><input id="s-remarks" value="${editing?esc(editing.remarks||''):''}" placeholder="e.g. 2 units damaged"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="sales-save-btn" onclick="saveSalesForm('${editing?editing.id:''}')">Save</button>
      </div>
      ${editing ? `<button type="button" class="btn btn-danger-ghost btn-block sales-delete-action" onclick="deleteSalesReport('${editing.id}')">Delete this record</button>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  salesFormFreeItemTouched = false;
  applyFreeItemFieldLayout();
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

// Free items use an editable "Given out" quantity instead of Sales qty.
function applyFreeItemFieldLayout(){
  const giveaway = document.getElementById('s-free-item').checked;
  document.getElementById('sales-field').style.display = giveaway ? 'none' : '';
  document.getElementById('given-out-field').style.display = giveaway ? '' : 'none';
}

async function saveSalesForm(id){
  const work_date = todayStr(); // promoters can only ever save into today
  const store_id = document.getElementById('s-store').value || null;
  const productBase = document.getElementById('s-product').value.trim();
  const variation = document.getElementById('s-variation').value;
  const product_name = composeProductName(productBase, variation);
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
  const opening_qty = parseFloat(document.getElementById('s-opening').value) || 0;
  const closing_qty = parseFloat(document.getElementById('s-closing').value) || 0;
  const sales_qty = is_free_item ? (parseFloat(document.getElementById('s-given-out').value) || 0) : (parseFloat(document.getElementById('s-sales').value) || 0);
  const remarks = document.getElementById('s-remarks').value.trim();
  const editing = id ? salesReports.find(r=>r.id===id) : null;
  // Photos are no longer captured per product — see the "Day photo" row
  // for one overall photo per working date. Editing an older row that
  // still has a legacy photo_url leaves it untouched.
  const photo_url = editing ? (editing.photo_url || null) : null;

  if(!productBase){
    showToast('Product name is required'); return;
  }

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
    await carryClosingToNextEvent(product_name, work_date, closing_qty);
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
