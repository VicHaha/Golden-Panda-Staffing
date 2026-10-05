// ============================================================
// Stock Management — one card per outlet for the current stock day, each
// with an Opening block and a Closing block of location boxes (the list of
// locations is user-editable, see js/locations.js). A "LOW" flag shows on
// Closing when any SKU's closing total is under LOW_STOCK_THRESHOLD.
// "Past Records" expands the same cards for earlier days.
//
// This file is identical in the admin and promoter apps.
// ============================================================

// The per-outlet low-stock setting used to live in the browser; the rule is
// now a fixed threshold, so tidy the old key away.
try{ localStorage.removeItem('gp-stock-low-thresholds-v1'); }catch(e){}

let stockSummaryActiveTab = {};
let stockSummaryCountMode = {};
let stockPastOpen = false;

function stockOutletKey(row){ return row.store_id || '__none__'; }
function isStockManagedItem(row){ return !isFreeItem(row) && !isGiveaway(row.product_name); }

function stockOutletName(row){
  if(row.stores && row.stores.name) return row.stores.name;
  const store = stores.find(s=>s.id===row.store_id);
  return store ? store.name : 'Unspecified outlet';
}

// One row per outlet + SKU. Older app versions could leave duplicates; keep
// the most recently saved.
function dedupeStockRows(rows){
  const latest = new Map();
  rows.forEach(row=>{
    const key = `${stockOutletKey(row)}|${canonicalSkuName(row.product_name).toLowerCase()}`;
    const savedAt = Date.parse(row.updated_at || row.created_at || '') || 0;
    const prior = latest.get(key);
    if(!prior || savedAt >= prior.savedAt) latest.set(key, { row, savedAt });
  });
  return [...latest.values()].map(item=>item.row);
}

// Dates that have stock records, newest first.
function stockDatesDesc(){
  return [...new Set(salesReports.filter(isStockManagedItem).map(r=>r.work_date))].sort((a,b)=>b.localeCompare(a));
}

// The day the main cards describe: today when anything is happening today
// (stock rows or a scheduled job), otherwise the most recent stock day.
function stockActiveDate(){
  const today = todayStr();
  const dates = stockDatesDesc();
  if(dates.includes(today) || jobs.some(j=>j.work_date===today)) return today;
  return dates[0] || today;
}

// [{ key, name, rows }] — outlets that have stock on `date`, A–Z.
function outletStocksForDate(date){
  const rows = dedupeStockRows(salesReports.filter(r=>r.work_date===date && isStockManagedItem(r)));
  const byKey = new Map();
  rows.forEach(row=>{
    const key = stockOutletKey(row);
    if(!byKey.has(key)) byKey.set(key, { key, name: stockOutletName(row), rows: [] });
    byKey.get(key).rows.push(row);
  });
  const outlets = [...byKey.values()];
  outlets.forEach(outlet=>outlet.rows.sort((a,b)=>skuOrderIndex(a)-skuOrderIndex(b)));
  return outlets.sort((a,b)=>a.name.localeCompare(b.name));
}

// Low SKUs across every outlet for `date`: [{ outlet, row, closing }].
function lowStockEntries(date){
  const entries = [];
  outletStocksForDate(date).forEach(outlet=>{
    outlet.rows.forEach(row=>{
      const closing = stockTotal(row,'closing');
      if(closing < LOW_STOCK_THRESHOLD) entries.push({ outlet, row, closing });
    });
  });
  return entries;
}

function renderStockBlock(label, rows, field, showLow){
  const totals = stockLocationTotals(rows, field);
  const total = totals.reduce((sum,item)=>sum+item.total,0);
  const lowCount = showLow ? rows.filter(isLowClosing).length : 0;
  return `<span class="stock-block ${lowCount?'is-low':''}">
    <span class="stock-block-head">
      <span class="stock-block-label">${label}</span>
      <span class="stock-block-total">${lowCount?`<em class="stock-low-flag" title="${lowCount} SKU${lowCount>1?'s':''} under ${LOW_STOCK_THRESHOLD}">LOW</em>`:''}<b>${total}</b></span>
    </span>
    ${renderStockBoxes(totals)}
  </span>`;
}

function renderStockOutletCard(outlet, date){
  const hasLow = outlet.rows.some(isLowClosing);
  return `<button type="button" class="stock-outlet-card ${hasLow?'has-alert':''}" onclick="openOutletStockSummary('${outlet.key}','${date}')">
    <span class="stock-outlet-top"><strong>${esc(outlet.name)}</strong><small>${date===todayStr()?'Today':formatDateShort(date)} · ${outlet.rows.length} SKUs</small></span>
    ${renderStockBlock('Opening', outlet.rows, 'opening', false)}
    ${renderStockBlock('Closing', outlet.rows, 'closing', true)}
  </button>`;
}

function renderStockPastRecords(activeDate){
  const dates = stockDatesDesc().filter(d=>d!==activeDate);
  if(!dates.length) return '';
  let html = `<button type="button" class="btn btn-ghost stock-history-toggle" aria-expanded="${stockPastOpen}" onclick="toggleStockPast()">Past Records <span aria-hidden="true">${stockPastOpen?'▴':'▾'}</span></button>`;
  if(stockPastOpen){
    html += dates.map(date=>`
      <div class="stock-past-day">
        <div class="stock-past-date">${formatDateLong(date)}</div>
        <div class="stock-outlet-grid">${outletStocksForDate(date).map(outlet=>renderStockOutletCard(outlet,date)).join('')}</div>
      </div>`).join('');
  }
  return html;
}

function toggleStockPast(){
  stockPastOpen = !stockPastOpen;
  render();
}

function renderStockManagement(){
  const date = stockActiveDate();
  const outlets = outletStocksForDate(date);
  const manage = typeof canManageStockLocations === 'function' && canManageStockLocations();
  let html = `<div class="stock-page-head">
      <div class="section-title">Stock Management</div>
      ${manage?`<button type="button" class="btn btn-ghost btn-sm" onclick="openStockLocationsManager()">⚙ Locations</button>`:''}
    </div>`;
  if(!outlets.length){
    return html + emptyState('🏬','No outlet stock yet','Tap + to add the first stock record.');
  }
  if(date !== todayStr()) html += `<div class="field-hint" style="margin:-6px 0 12px;">Nothing scheduled today — showing the latest records, ${formatDateLong(date)}.</div>`;
  html += `<div class="stock-outlet-grid">${outlets.map(outlet=>renderStockOutletCard(outlet,date)).join('')}</div>`;
  html += renderStockPastRecords(date);
  return html;
}

// ---------------- Outlet summary sheet (tap a card) ----------------
function renderStockSummaryTabs(stateKey, groups, active){
  return `<div class="stock-tabs stock-summary-tabs">${groups.map(group=>`
    <button type="button" class="stock-tab ${active===group.key?'active':''}" aria-pressed="${active===group.key}" onclick="setStockSummaryTab('${stateKey}','${group.key}')">
      ${esc(group.label)} <span class="stock-tab-count">${group.items.length}</span>
    </button>`).join('')}</div>`;
}

function setStockSummaryTab(stateKey, key){
  stockSummaryActiveTab[stateKey] = key;
  refreshOutletStockSummary(...stateKey.split('|'));
}

function setStockSummaryCountMode(stateKey, field){
  stockSummaryCountMode[stateKey] = field === 'closing' ? 'closing' : 'opening';
  refreshOutletStockSummary(...stateKey.split('|'));
}

function stockLocationChips(row, field){
  const locations = activeStockLocations();
  if(!locations.length) return '<span class="stock-location-empty">No stock locations</span>';
  return locations.map(loc=>`<span class="stock-location-chip"><small>${esc(loc.name)}</small><b>${locationQty(row,loc.id,field)}</b></span>`).join('');
}

function stockSummaryInnerHtml(outletKey, date){
  const outlet = outletStocksForDate(date).find(item=>item.key===outletKey);
  if(!outlet) return null;
  const stateKey = `${outlet.key}|${date}`;
  const openingTotal = outlet.rows.reduce((sum,row)=>sum+stockTotal(row,'opening'),0);
  const closingTotal = outlet.rows.reduce((sum,row)=>sum+stockTotal(row,'closing'),0);
  const productGroups = groupByProductTabs(outlet.rows,false);
  const active = activeProductTab(stateKey,productGroups,stockSummaryActiveTab);
  const activeGroup = productGroups.find(group=>group.key===active);
  const visibleRows = activeGroup ? activeGroup.items : [];
  const field = stockSummaryCountMode[stateKey] === 'closing' ? 'closing' : 'opening';
  const rows = visibleRows.map(row=>{
    const total = stockTotal(row,field);
    const low = field === 'closing' && total < LOW_STOCK_THRESHOLD;
    return `<button type="button" class="stock-summary-sku ${low?'is-low':''}" onclick="openStockLocationForm('${row.id}','${field}',true)">
      <span class="stock-summary-sku-head"><strong>${esc(displayProductName(row))}</strong><span><b>${total}</b> ${field} ${low?'<em>Low</em>':''}</span></span>
      <span class="stock-location-chips">${stockLocationChips(row,field)}</span>
      <span class="stock-summary-edit">Counted ${formatDateShort(row.work_date)} · Tap to edit</span>
    </button>`;
  }).join('');
  return `
    <div class="stock-summary-head"><div class="modal-title">${esc(outlet.name)}</div><button type="button" class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="stock-summary-meta"><span>${formatDateLong(date)} · ${outlet.rows.length} SKUs</span></div>
    <div class="stock-count-switch">
      <button type="button" class="${field==='opening'?'active':''}" onclick="setStockSummaryCountMode('${stateKey}','opening')"><span>Opening</span><b>${openingTotal}</b></button>
      <button type="button" class="${field==='closing'?'active':''}" onclick="setStockSummaryCountMode('${stateKey}','closing')"><span>Closing</span><b>${closingTotal}</b></button>
    </div>
    ${renderStockSummaryTabs(stateKey,productGroups,active)}
    <div class="stock-summary-list">${rows}</div>
  `;
}

function openOutletStockSummary(outletKey, date, reuseOverlay=false){
  const html = stockSummaryInnerHtml(outletKey, date);
  if(html === null){ showToast('No stock found for that outlet'); return; }
  const existing = reuseOverlay ? document.querySelector('.modal-overlay') : null;
  const overlay = existing || document.createElement('div');
  if(existing) overlay.classList.add('stock-modal-reuse');
  if(!existing) overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet stock-summary-sheet" id="stock-summary-sheet">${html}</div>`;
  if(!existing){
    showModal(overlay);
    overlay.addEventListener('click',event=>{ if(event.target===overlay) closeModal(); });
  }
}

// Refreshes only the summary sheet's own contents in place so switching
// tabs doesn't flicker (the overlay and its open animation stay put).
function refreshOutletStockSummary(outletKey, date){
  const sheet = document.getElementById('stock-summary-sheet');
  const html = stockSummaryInnerHtml(outletKey, date);
  if(sheet && html !== null) sheet.innerHTML = html;
}

// ---------------- Edit form (one SKU, opening or closing) ----------------
function openStockLocationForm(id, field='opening', reuseOverlay=false){
  const editing = salesReports.find(r=>r.id===id);
  if(!editing){ showToast('Could not find that record'); return; }
  if(!isStockManagedItem(editing)){ showToast('Free items are not tracked in Stock Management'); return; }
  const closing = field === 'closing';

  const existing = reuseOverlay ? document.querySelector('.modal-overlay') : null;
  const overlay = existing || document.createElement('div');
  if(existing) overlay.classList.add('stock-modal-reuse');
  if(!existing) overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="form-title-row"><div class="modal-title">Edit ${closing?'closing':'opening'} stock</div><button type="button" class="calculator-launch" onclick="openCalculator(this)" aria-label="Open calculator" title="Calculator">🧮</button></div>
      <div class="field-hint" style="margin-bottom:12px;">${esc(displayProductName(editing))} · ${formatDateLong(editing.work_date)}</div>
      <div class="field">
        <label>Store</label>
        <select id="sl-store">
          <option value="">— Not specified —</option>
          ${stores.map(s=>`<option value="${s.id}" ${editing.store_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="stock-section-heading"><h2>${closing?'Closing':'Opening'} stock</h2><span id="sl-total">${stockTotal(editing,field)}</span></div>
      ${renderLocationInputs('sl-loc-', locationMap(editing,field), 'updateStockLocationHint()')}
      <div class="field-hint" id="sl-location-hint">This ${field} total syncs to Sales.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="stock-location-save-btn" onclick="saveStockLocationForm('${id}','${field}')">Save</button>
      </div>
    </div>
  `;
  if(!existing){
    showModal(overlay);
    overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  }
  updateStockLocationHint();
}

function updateStockLocationHint(){
  const total = sumLocationInputs('sl-loc-');
  const display = document.getElementById('sl-total');
  if(display) display.textContent = total;
}

async function saveStockLocationForm(id, field='opening'){
  const editing = salesReports.find(row=>row.id===id);
  if(!editing){ showToast('Could not find that record'); return; }
  const closing = field === 'closing';
  const store_id = document.getElementById('sl-store').value || null;
  const map = readLocationInputs('sl-loc-', locationMap(editing,field));
  const total = locationMapTotal(map);

  const btn = document.getElementById('stock-location-save-btn');
  btn.disabled = true;
  try{
    btn.textContent = 'Saving…';
    const payload = { store_id };
    if(closing) Object.assign(payload,{ closing_location_qty:map, closing_qty:total });
    else Object.assign(payload,{ location_qty:map, opening_qty:total });
    await DB.updateSalesReport(id, payload);
    if(closing) await carryClosingToNextEvent(editing.product_name,editing.work_date,total,map);
    await refreshData();
    render();
    openOutletStockSummary(store_id || '__none__',editing.work_date,true);
    showToast(`${closing?'Closing':'Opening'} stock saved · ${total}`);
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

// ---------------- Add form ----------------
// Lets someone add a brand-new stock record straight from this tab, rather
// than only editing rows that were auto-seeded. Product name and Store reuse
// the same suggestion list and outlet list as the Sales Section. If a record
// already exists for this exact product + date + store, saving updates it.
function openAddStockRecordForm(){
  const defaultStoreId = scheduledStoreIdForDate(todayStr());
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="form-title-row"><div class="modal-title">Add stock record</div><button type="button" class="calculator-launch" onclick="openCalculator(this)" aria-label="Open calculator" title="Calculator">🧮</button></div>
      <div class="field-hint" style="margin-bottom:12px;">${formatDateLong(todayStr())}</div>
      <div class="field-row">
        <div class="field" style="flex:1.6;">
          <label>Product name</label>
          <input id="asr-product" list="product-list" placeholder="e.g. 1L Bio Dishwash" oninput="onAddStockProductChange()">
          <datalist id="product-list">${getProductSuggestions().filter(p=>!isGiveaway(p)).map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label>Variation (optional)</label>
          <input id="asr-variation" list="variation-list" placeholder="Type any variation" oninput="onAddStockProductChange()">
          <datalist id="variation-list"></datalist>
        </div>
      </div>
      <div class="field">
        <label>Store</label>
        <select id="asr-store" onchange="onAddStockProductChange()">
          <option value="">— Not specified —</option>
          ${stores.map(s=>`<option value="${s.id}" ${defaultStoreId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="stock-section-heading"><h2>Opening stock</h2><span id="asr-opening-total">0</span></div>
      ${renderLocationInputs('asr-open-', null, 'updateAddStockOpeningTotal()')}
      <div class="stock-section-heading"><h2>Closing stock</h2><span id="asr-closing-total">0</span></div>
      ${renderLocationInputs('asr-close-', null, 'updateAddStockOpeningTotal()')}
      <div class="field-hint" id="asr-hint">Opening and closing totals sync to Sales.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="add-stock-record-save-btn" onclick="saveAddStockRecordForm()">Save</button>
      </div>
    </div>
  `;
  showModal(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

function updateAddStockOpeningTotal(){
  const opening = document.getElementById('asr-opening-total');
  const closing = document.getElementById('asr-closing-total');
  if(opening) opening.textContent = sumLocationInputs('asr-open-');
  if(closing) closing.textContent = sumLocationInputs('asr-close-');
}

function fillAddStockInputs(openingMap, closingMap){
  activeStockLocations().forEach(loc=>{
    const open = document.getElementById('asr-open-' + loc.id);
    const close = document.getElementById('asr-close-' + loc.id);
    if(open) open.value = openingMap ? Number(openingMap[loc.id]||0) : '';
    if(close) close.value = closingMap ? Number(closingMap[loc.id]||0) : '';
  });
  updateAddStockOpeningTotal();
}

// Re-fills the counts for whatever product/store is selected: today's
// existing record if there is one, otherwise the product's last closing
// figures carried forward (same store first), otherwise empty.
function onAddStockProductChange(){
  updateVariationDatalist('asr-product','variation-list');
  const base = document.getElementById('asr-product').value.trim();
  const variation = document.getElementById('asr-variation').value;
  const productName = composeProductName(base, variation);
  const hint = document.getElementById('asr-hint');
  if(!productName){
    fillAddStockInputs(null,null);
    hint.textContent = 'Opening and closing totals sync to Sales.';
    return;
  }
  const storeId = document.getElementById('asr-store').value || null;
  const existing = salesReports.find(row=>
    row.work_date===todayStr()
    && (row.store_id||null)===storeId
    && canonicalSkuName(row.product_name)===canonicalSkuName(productName)
  );
  if(existing){
    fillAddStockInputs(locationMap(existing,'opening'), locationMap(existing,'closing'));
    hint.textContent = "Today's record already exists — saving will update its counts, not add another row.";
    return;
  }
  const priorEntries = salesReports
    .filter(r => canonicalSkuName(r.product_name) === canonicalSkuName(productName))
    .sort((a,b) => b.work_date.localeCompare(a.work_date));
  const prior = priorEntries.find(r=>(r.store_id||null)===storeId) || priorEntries[0];
  if(prior){
    const carried = locationMap(prior,'closing');
    fillAddStockInputs(carried, carried);
    hint.textContent = `Carried forward from ${formatDateShort(prior.work_date)}'s closing figures — edit if they've changed.`;
  }else{
    fillAddStockInputs(null,null);
    hint.textContent = 'No prior record for this product yet — starting from 0.';
  }
}

async function saveAddStockRecordForm(){
  const work_date = todayStr();
  const productBase = document.getElementById('asr-product').value.trim();
  const variation = document.getElementById('asr-variation').value;
  const product_name = composeProductName(productBase, variation);
  if(!productBase){ showToast('Product name is required'); return; }
  if(isGiveaway(product_name)){ showToast('Free items are not tracked in Stock Management'); return; }

  const store_id = document.getElementById('asr-store').value || null;
  const location_qty = readLocationInputs('asr-open-', {});
  const closing_location_qty = readLocationInputs('asr-close-', {});
  const openingTotal = locationMapTotal(location_qty);
  const closingTotal = locationMapTotal(closing_location_qty);

  const btn = document.getElementById('add-stock-record-save-btn');
  btn.disabled = true;
  try{
    btn.textContent = 'Saving…';
    const existing = salesReports.find(row=>
      row.work_date===work_date
      && (row.store_id||null)===store_id
      && canonicalSkuName(row.product_name)===canonicalSkuName(product_name)
    );
    if(existing){
      await DB.updateSalesReport(existing.id,{ location_qty:{...locationMap(existing,'opening'),...location_qty}, closing_location_qty:{...locationMap(existing,'closing'),...closing_location_qty}, opening_qty:openingTotal, closing_qty:closingTotal });
    }else{
      await DB.addSalesReport({
        work_date, store_id, ...stockRecordAttribution(), product_name,
        opening_qty:openingTotal, sales_qty: 0, closing_qty:closingTotal,
        remarks: null, photo_url: null, is_free_item: false,
        location_qty, closing_location_qty
      });
    }
    await carryClosingToNextEvent(product_name,work_date,closingTotal,closing_location_qty);
    await refreshData();
    render();
    openOutletStockSummary(store_id || '__none__',work_date,true);
    showToast(`${existing ? 'Stock count updated' : 'Stock record added'} · Opening ${openingTotal} · Closing ${closingTotal}`);
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}
