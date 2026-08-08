// ============================================================
// Sales & Stock — per-product opening/sales/closing counts,
// grouped by working date, expand/collapse per date.
// This is the office/admin app — admin can edit or delete any date's
// sales records, past included. (The promoter-facing app still locks
// past dates for promoters; see its own js/sales.js.)
//
// Also owns the app's one and only Excel export (see exportStockExcel
// below) — one workbook per day/month covering both stock and shift
// data, raw rows plus the Analysis tab's summary rollups. The Analysis
// tab itself is view-only, so this is the only place to export from.
// ============================================================

let salesExpandedDates = new Set(); // which date groups are currently expanded
let stockExportMode = 'monthly'; // 'monthly' | 'daily'
let stockExportMonth = new Date().toISOString().slice(0,7);
let stockExportDate = todayStr();

// Suggested products — shown as autocomplete, but the field stays free
// text so new products can always be typed in and added on the fly.
// These are the full stored names (base product + variation baked in)
// used to auto-seed each working date's rows — see ensureStockRowsForDate.
const PRODUCT_SUGGESTIONS = [
  'Gift Set',
  'Flyer',
  'Small Samples',
  'Coupons',
  'Bio Dishwash 1L (Bidara)',
  'Bio Dishwash 1L (Ginger)',
  'Bio Dishwash 1L (Melon)',
  'Refill Bio Dishwash 480ml (Bidara)',
  'Refill Bio Dishwash 480ml (Ginger)',
  'Refill Bio Dishwash 480ml (Melon)'
];

// Product name and variation are entered as two separate fields in the
// form (see openSalesForm) but stored together as one string, e.g.
// "Bio Dishwash 1L (Bidara)" — same format as before, so tab
// categorization, carry-forward matching, and legacy rows all keep
// working unchanged. VARIATIONS lists the recognised flavors; anything
// else typed into the base name field is stored as-is with no variation.
const VARIATIONS = ['Bidara', 'Ginger', 'Melon'];
const VARIANT_BASE_PRODUCTS = ['Bio Dishwash 1L', 'Refill Bio Dishwash 480ml'];

// Splits a stored product_name like "Bio Dishwash 1L (Bidara)" back into
// its base name and variation, so the form can show them as two fields
// and the list can show just the variation. Names without a recognised
// variation (giveaways, custom products) come back with variation: ''.
function parseProductName(name){
  const raw = (name || '').trim();
  const m = /^(.*)\s\(([^)]+)\)\s*$/.exec(raw);
  if(m && VARIATIONS.includes(m[2])) return { base: m[1].trim(), variation: m[2] };
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
// logged, most recent first. Used by the Stock tab's daily export picker
// (which now bundles both) and by the Analysis tab's viewing picker —
// so a day with only a shift report logged still shows up.
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
    <div class="field-hint" style="margin:-6px 0 14px;">One Excel file for this period — raw stock &amp; shift reports plus the Analysis summaries, all in one place.</div>
  `;

  if(salesReports.length===0 && dayPhotos.length===0){
    return exportControls + emptyState('📦','No sales reports yet','Tap + to log opening stock, sales, and closing stock for a roadshow date.');
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

  let html = `<div class="section-title">Sales &amp; stock reports <span class="count-pill">${dates.length} date${dates.length>1?'s':''}</span></div>`;
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
      const grouped = groupByStockCategory(items);
      const active = activeStockTab(date, grouped);
      const activeItems = grouped[active];
      body = `<div class="sales-group-body">
        ${renderDayPhotoRow(date)}
        ${renderStockTabs(date, grouped, active)}
        ${activeItems.length ? renderSalesItems(activeItems, active==='free') : `<div class="stock-tab-empty">No products in this group yet.</div>`}
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
            <div class="sales-item-stats">Given out <b>${sales}</b></div>
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
            Open <b>${opening}</b> · ${giveaway?'Given out':'Sold'} <b>${sales}</b> · Close <b>${closing}</b>
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
          <label>Variation</label>
          <select id="s-variation" onchange="onProductNameChange()">
            <option value="">— None —</option>
            ${VARIATIONS.map(v=>`<option value="${v}" ${editing&&parseProductName(editing.product_name).variation===v?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-hint" style="margin:-8px 0 14px;">Saved together as one product, e.g. "Bio Dishwash 1L (Bidara)" — pick "— None —" for items with no flavor.</div>
      <div class="field">
        <label class="checkbox-row">
          <input type="checkbox" id="s-free-item" ${(editing?isFreeItem(editing):isGiveaway(''))?'checked':''} onchange="onFreeItemToggle()">
          Free item (given away, not sold)
        </label>
        <div class="field-hint" id="s-free-item-hint">Gift Set, Flyer, Small Samples, and Coupons are ticked automatically — untick or tick any product as needed.</div>
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
        <div class="field-hint">Calculated automatically: opening stock − closing stock.</div>
      </div>
      <div class="field" id="stock-location-field">
        <label>Stock by location (optional)</label>
        <div class="field-row">
          <div class="field"><label>Store Room</label><input id="s-store-room" type="number" min="0" step="1" value="${editing?editing.store_room_qty:'0'}" placeholder="0" oninput="onLocationFieldInput()"></div>
          <div class="field"><label>Home Shelf</label><input id="s-home-shelf" type="number" min="0" step="1" value="${editing?editing.home_shelf_qty:'0'}" placeholder="0" oninput="onLocationFieldInput()"></div>
          <div class="field"><label>Standee</label><input id="s-standee" type="number" min="0" step="1" value="${editing?editing.standee_qty:'0'}" placeholder="0" oninput="onLocationFieldInput()"></div>
        </div>
        <div class="field-hint" id="s-location-hint">Should add up to the closing stock above.</div>
      </div>
      <div class="field-row">
        <div class="field"><label>Remarks (optional)</label><input id="s-remarks" value="${editing?esc(editing.remarks||''):''}" placeholder="e.g. 2 units damaged"></div>
        <div class="field"><label>Warehouse stock</label><input id="s-warehouse" type="number" min="0" step="1" value="${editing?editing.warehouse_qty:'0'}" placeholder="0"></div>
      </div>
      <div class="field-hint" style="margin:-8px 0 14px;">Warehouse stock carries forward automatically to the next working date.</div>
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
  updateLocationHint();
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
// The Store Room / Home Shelf / Standee breakdown is skipped entirely for
// free items too, since it's only meant to track sellable stock.
function applyFreeItemFieldLayout(){
  const giveaway = document.getElementById('s-free-item').checked;
  document.getElementById('sales-field').style.display = giveaway ? 'none' : '';
  document.getElementById('given-out-field').style.display = giveaway ? '' : 'none';
  document.getElementById('stock-location-field').style.display = giveaway ? 'none' : '';
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
  updateLocationHint();
}

// Keeps the "Stock by location" hint in sync as any of the three location
// fields (or closing stock, which they must always add up to exactly) are
// typed — Store Room + Home Shelf + Standee must equal closing stock for
// every non-free item, no exceptions.
function updateLocationHint(){
  const hint = document.getElementById('s-location-hint');
  if(!hint) return; // not rendered for free items
  const closing = parseFloat(document.getElementById('s-closing').value) || 0;
  const storeRoom = parseFloat(document.getElementById('s-store-room').value) || 0;
  const homeShelf = parseFloat(document.getElementById('s-home-shelf').value) || 0;
  const standee = parseFloat(document.getElementById('s-standee').value) || 0;
  const sum = storeRoom + homeShelf + standee;

  if(sum === closing){
    hint.textContent = `✓ Matches closing stock (${closing}).`;
    hint.classList.remove('field-hint-error');
  }else{
    hint.textContent = `${sum} entered so far — closing stock is ${closing}.`;
    hint.classList.add('field-hint-error');
  }
}

function onLocationFieldInput(){
  updateLocationHint();
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
  // Stock-by-location breakdown — admin-only, separate from the opening/
  // sales/closing workflow numbers above.
  const store_room_qty = parseFloat(document.getElementById('s-store-room').value) || 0;
  const home_shelf_qty = parseFloat(document.getElementById('s-home-shelf').value) || 0;
  const standee_qty = parseFloat(document.getElementById('s-standee').value) || 0;
  // Warehouse stock — also admin-only, a separate running total (not part
  // of the closing-stock breakdown above) that carries forward untouched
  // to the next working date's row until it's edited again — see the
  // carryOver logic in ensureStockRowsForDate.
  const warehouse_qty = parseFloat(document.getElementById('s-warehouse').value) || 0;
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
    const payload = { work_date, store_id, promoter_id, product_name, opening_qty, sales_qty, closing_qty, remarks, photo_url, is_free_item, store_room_qty, home_shelf_qty, standee_qty, warehouse_qty, logged_by_admin_name };
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
// This is the ONE export in the app — the Analysis tab is view-only.
// One workbook per period: raw stock reports, raw shift reports, and the
// same summary rollups the Analysis tab shows on screen (products, store
// performance, shift engagement, age range, feedback), so nothing has to
// be exported twice from two different tabs.

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
  const shiftBlockLabel = k => k === 'before_break' ? 'Before Break' : k === 'after_break' ? 'After Break' : (k||'');

  // ---- Raw: Stock Reports — every logged row, unaggregated ----
  const stockRawRows = [...salesRows]
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || (a.product_name||'').localeCompare(b.product_name||''))
    .map(r=>{
      const giveaway = isFreeItem(r);
      return {
        'Date': r.work_date,
        'Product': r.product_name,
        'Type': giveaway ? 'Giveaway (free)' : 'Product',
        'Store': r.stores ? r.stores.name : '',
        'Opening Stock': Number(r.opening_qty||0),
        'Sold / Given Out': Number(r.sales_qty||0),
        'Closing Stock': Number(r.closing_qty||0),
        'Logged By': loggedByLabel(r),
        'Remarks': r.remarks || ''
      };
    });
  const wsStockRaw = XLSX.utils.json_to_sheet(stockRawRows);
  wsStockRaw['!cols'] = [{wch:12},{wch:26},{wch:16},{wch:16},{wch:13},{wch:13},{wch:13},{wch:20},{wch:24}];
  XLSX.utils.book_append_sheet(wb, wsStockRaw, 'Stock Reports (Raw)');

  // ---- Stock Details: one row per product, with Store Room / Home
  // Shelf / Standee as their own columns — easy to scan at a glance,
  // one line per product rather than three. ----
  const stockDetailRows = [...salesRows]
    .filter(r => !isFreeItem(r))
    .sort((a,b)=> a.work_date.localeCompare(b.work_date) || (a.product_name||'').localeCompare(b.product_name||''))
    .map(r => ({
      'Date': r.work_date,
      'Product': r.product_name,
      'Store': r.stores ? r.stores.name : '',
      'Store Room': Number(r.store_room_qty||0),
      'Home Shelf': Number(r.home_shelf_qty||0),
      'Standee': Number(r.standee_qty||0),
      'Warehouse': Number(r.warehouse_qty||0)
    }));
  const wsStockDetails = XLSX.utils.json_to_sheet(stockDetailRows);
  wsStockDetails['!cols'] = [{wch:12},{wch:26},{wch:16},{wch:12},{wch:12},{wch:10},{wch:12}];
  XLSX.utils.book_append_sheet(wb, wsStockDetails, 'Stock Details');

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

  // ---- Summary: Products (top sellers, then giveaways) ----
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

  // ---- Summary: Store performance (units sold + engagement, per store) ----
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

  // ---- Summary: Shift engagement (Before Break vs After Break) ----
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

  // ---- Summary: Customer age range ----
  const ageCounts = {};
  AGE_RANGE_ORDER.forEach(k=> ageCounts[k] = 0);
  shiftRows.filter(r=>r.customer_age_range).forEach(r=>{ if(ageCounts[r.customer_age_range]!=null) ageCounts[r.customer_age_range]++; });
  const ageRows = AGE_RANGE_ORDER.map(k=>({ 'Age Range': AGE_RANGE_LABELS[k], 'Count': ageCounts[k] }));
  const wsAge = XLSX.utils.json_to_sheet(ageRows);
  wsAge['!cols'] = [{wch:14},{wch:10}];
  XLSX.utils.book_append_sheet(wb, wsAge, 'Age Range');

  // ---- Summary: Feedback & notes ----
  const feedbackRows = shiftRows
    .filter(r => (r.customer_feedback && r.customer_feedback.trim()) || (r.notes && r.notes.trim()))
    .sort((a,b)=> a.work_date.localeCompare(b.work_date))
    .flatMap(r=>{
      const rows = [];
      const shiftLabel = shiftBlockLabel(r.shift);
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

  XLSX.writeFile(wb, `Golden_Panda_Report_${daily?'Daily':'Monthly'}_${periodLabel}.xlsx`);
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
