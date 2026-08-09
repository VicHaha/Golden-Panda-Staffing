// ============================================================
// Sales & Stock — grouped-by-date view. Any logged-in promoter can
// edit/delete TODAY's entries (regardless of who logged them); past
// dates are locked for promoters and only editable from the office app.
// ============================================================

let salesExpandedDates = new Set();
let salesShowPast = false;

// Suggested products — shown as autocomplete, but the field stays free
// text so new products can always be typed in and added on the fly.
// These are base names only (no variation suffix) and are what
// auto-seeds each working date's rows — see ensureStockRowsForDate.
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
// always be overridden by hand, per row. Matched case-insensitively.
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
    // Warehouse stock (admin-only field, not shown in this app's form) is
    // a running total, not a daily transaction — carry the last known
    // figure forward untouched so it stays correct no matter which app
    // ends up creating the next date's row.
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
    visibleDates.forEach(date=>{
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
          ${renderDayPhotoRow(date, isToday)}
          ${renderStockTabs(date, grouped, active)}
          ${activeItems.length ? renderSalesItems(activeItems, isToday, active==='free') : `<div class="stock-tab-empty">No products in this group yet.</div>`}
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

// `compact` is used for the Free tab — giveaways don't need the full
// open/sold/close breakdown, just how many went out, so the list stays
// quick to scan while keying in samples/coupons/etc.
function renderSalesItems(items, isToday, compact){
  return items.map(i=>{
    const giveaway = isFreeItem(i);
    const opening = Number(i.opening_qty||0), sales = Number(i.sales_qty||0), closing = Number(i.closing_qty||0);
    const statsHtml = compact
      ? `Given out <b>${sales}</b> · Logged by <b>${esc(loggedByLabel(i))}</b>`
      : (()=>{
          const expectedClosing = opening - sales;
          const variance = closing - expectedClosing;
          return `
            Open <b>${opening}</b> · ${giveaway?'Given out':'Sold'} <b>${sales}</b> · Close <b>${closing}</b> · Logged by <b>${esc(loggedByLabel(i))}</b>
            ${variance !== 0 ? `<span class="sales-variance ${variance<0?'short':'over'}">${variance>0?'+':''}${variance} vs expected</span>` : ''}
            ${giveaway ? `<span class="count-pill">Free item</span>` : ''}
          `;
        })();
    return `
      <div class="sales-item">
        <div class="sales-item-main">
          <div class="sales-item-name">${esc(displayProductName(i))}</div>
          <div class="sales-item-stats">${statsHtml}</div>
          ${i.remarks ? `<div class="sales-item-remarks">${esc(i.remarks)}</div>` : ''}
        </div>
        ${isToday ? `
          <div class="job-actions">
            <div class="icon-btn" onclick="openSalesForm('${i.id}')">✎</div>
            <div class="icon-btn danger" onclick="deleteSalesReport('${i.id}')">✕</div>
          </div>
        ` : `<div class="sales-locked" title="Only today's reports can be edited">🔒</div>`}
      </div>
    `;
  }).join('');
}

// Any number of overall photos allowed per working date (booth/table
// setup, crowd shots, etc.) — separate from each product's own
// opening/sales/closing row. All of a date's photos sit in a single
// horizontally-scrolling row of thumbnails, with an "add" tile right
// after the last photo (only for today — past dates are locked).
function renderDayPhotoRow(date, isToday){
  const photos = dayPhotos.filter(d => d.work_date === date);
  const photoThumbs = photos.map(dp => `
    <div class="day-photo-thumb" onclick="${isToday ? `openDayPhotoForm('${date}','${dp.id}')` : (dp.photo_url ? `window.open('${esc(dp.photo_url)}','_blank')` : '')}" title="${isToday?'Edit day photo':'View day photo'}">
      ${dp.photo_url
        ? `<img src="${esc(dp.photo_url)}" alt="Day photo">`
        : `<div class="day-photo-thumb-empty">📷</div>`}
      ${isToday ? `<button class="day-photo-thumb-delete" onclick="event.stopPropagation(); deleteDayPhotoRow('${dp.id}')" title="Delete">✕</button>` : ''}
    </div>
  `).join('');

  if(!isToday) return `<div class="day-photo-strip">${photoThumbs}</div>`;

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
  const today = todayStr();
  if(editing && editing.work_date !== today){
    showToast("Only today's reports can be edited"); return;
  }
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
          ${stores.map(s=>`<option value="${s.id}" ${editing&&editing.store_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
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
      <div class="field-hint" style="margin:-8px 0 14px;">Saved together as one product, e.g. "Bio Dishwash 1L (Bidara)" — leave blank for items with no flavor.</div>
      <div class="field">
        <label class="checkbox-row">
          <input type="checkbox" id="s-free-item" ${(editing?isFreeItem(editing):isGiveaway(''))?'checked':''} onchange="onFreeItemToggle()">
          Free item (given away, not sold)
        </label>
        <div class="field-hint">Gift Set, Flyer, Small Samples, and Coupons are ticked automatically — untick or tick any product as needed.</div>
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
      <div class="field"><label>Remarks (optional)</label><input id="s-remarks" value="${editing?esc(editing.remarks||''):''}" placeholder="e.g. 2 units damaged"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="sales-save-btn" onclick="saveSalesForm('${editing?editing.id:''}')">Save</button>
      </div>
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
  // Free items: "given out" is never typed in — it's always opening minus
  // closing. Regular products: sales qty is entered by hand as before.
  const sales_qty = is_free_item ? Math.max(0, opening_qty - closing_qty) : (parseFloat(document.getElementById('s-sales').value) || 0);
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
    salesExpandedDates.add(work_date);
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
    render();
    showToast('Stock report deleted');
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}

// ---------------- Day photo (one overall photo per working date) ----------------

function openDayPhotoForm(date, id){
  const today = todayStr();
  if(date !== today){
    showToast("Only today's photo can be edited"); return;
  }
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
  if(date !== todayStr()){
    showToast("Only today's photo can be edited"); return;
  }
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
