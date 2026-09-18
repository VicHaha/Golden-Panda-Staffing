// Stock Management is current-inventory first: the newest sellable row
// for every outlet + SKU is treated as that item's present count.
const STOCK_THRESHOLD_KEY = 'gp-stock-low-thresholds-v1';
let stockSummaryActiveTab = {};
let stockThresholdScope = '__all__';
let stockShowMore = false;

function stockOutletKey(row){ return row.store_id || '__none__'; }
function stockOpeningTotal(row){
  return Number(row.store_room_qty||0) + Number(row.home_shelf_qty||0) + Number(row.standee_qty||0);
}
function stockClosingTotal(row){
  return Number(row.closing_store_room_qty||0) + Number(row.closing_home_shelf_qty||0) + Number(row.closing_standee_qty||0);
}
function stockRowTotal(row){
  return stockClosingTotal(row) + Number(row.warehouse_qty||0);
}
function stockLocationTotals(rows, field='opening'){
  const prefix = field === 'closing' ? 'closing_' : '';
  return rows.reduce((sum,row)=>({
    storeRoom:sum.storeRoom+Number(row[`${prefix}store_room_qty`]||0),
    homeShelf:sum.homeShelf+Number(row[`${prefix}home_shelf_qty`]||0),
    standee:sum.standee+Number(row[`${prefix}standee_qty`]||0),
    warehouse:sum.warehouse+Number(row.warehouse_qty||0)
  }),{storeRoom:0,homeShelf:0,standee:0,warehouse:0});
}
function getStockThresholds(){
  try{ return JSON.parse(localStorage.getItem(STOCK_THRESHOLD_KEY) || '{}'); }
  catch(e){ return {}; }
}
function stockThreshold(outletKey){
  const settings = getStockThresholds();
  const outletValue = Number(settings[outletKey]);
  if(Number.isFinite(outletValue) && outletValue >= 0) return outletValue;
  const allStoresValue = Number(settings.__all__);
  return Number.isFinite(allStoresValue) && allStoresValue >= 0 ? allStoresValue : 10;
}
function isLowStock(row, threshold){ return threshold > 0 && stockRowTotal(row) <= threshold; }
function isStockManagedItem(row){ return !isFreeItem(row) && !isGiveaway(row.product_name); }

function currentStockRows(){
  const latest = new Map();
  salesReports.filter(isStockManagedItem).forEach(row=>{
    const key = `${stockOutletKey(row)}|${canonicalSkuName(row.product_name).toLowerCase()}`;
    const prior = latest.get(key);
    if(!prior || row.work_date > prior.work_date) latest.set(key,row);
  });
  return [...latest.values()];
}

function currentOutletStocks(){
  const snapshots = currentStockRows();
  const outlets = stores.map(store=>({ key:store.id, name:store.name, rows:[] }));
  const byKey = Object.fromEntries(outlets.map(outlet=>[outlet.key,outlet]));
  snapshots.forEach(row=>{
    const key = stockOutletKey(row);
    if(!byKey[key]){
      const outlet = { key, name:row.stores ? row.stores.name : 'Unspecified outlet', rows:[] };
      byKey[key] = outlet;
      outlets.push(outlet);
    }
    byKey[key].rows.push(row);
  });
  outlets.forEach(outlet=>outlet.rows.sort((a,b)=>skuOrderIndex(a)-skuOrderIndex(b)));
  return outlets.filter(outlet=>outlet.rows.length);
}

function stockLocationChips(row, field, includeZero){
  const prefix = field === 'closing' ? 'closing_' : '';
  const locations = [
    ['Store room',Number(row[`${prefix}store_room_qty`]||0)],
    ['Home shelf',Number(row[`${prefix}home_shelf_qty`]||0)],
    ['Standee',Number(row[`${prefix}standee_qty`]||0)]
  ].filter(([,qty])=>includeZero || qty > 0);
  if(!locations.length) return '<span class="stock-location-empty">No stock allocated</span>';
  return locations.map(([name,qty])=>`<span class="stock-location-chip"><small>${name}</small><b>${qty}</b></span>`).join('');
}

function renderOutletCards(outlets){
  if(!outlets.length) return emptyState('🏬','No outlet stock yet','Tap + to add the first stock record.');
  const sortedOutlets = [...outlets].sort((a,b)=>{
    const aDate = a.rows.reduce((latest,row)=>row.work_date>latest?row.work_date:latest,'');
    const bDate = b.rows.reduce((latest,row)=>row.work_date>latest?row.work_date:latest,'');
    return bDate.localeCompare(aDate);
  });
  const visibleOutlets = stockShowMore ? sortedOutlets : sortedOutlets.slice(0,1);
  const hiddenCount = Math.max(0,sortedOutlets.length-1);
  const cards = `<div class="stock-outlet-grid">${visibleOutlets.map(outlet=>{
    const threshold = stockThreshold(outlet.key);
    const low = outlet.rows.filter(row=>isLowStock(row,threshold));
    const openingTotals = stockLocationTotals(outlet.rows,'opening');
    const closingTotals = stockLocationTotals(outlet.rows,'closing');
    const opening = openingTotals.storeRoom + openingTotals.homeShelf + openingTotals.standee;
    const closing = closingTotals.storeRoom + closingTotals.homeShelf + closingTotals.standee;
    const variance = outlet.rows.reduce((sum,row)=>sum + stockClosingTotal(row) - (stockOpeningTotal(row) - Number(row.sales_qty||0)),0);
    const latestDate = outlet.rows.reduce((latest,row)=>row.work_date>latest?row.work_date:latest,'');
    return `<button type="button" class="stock-outlet-card ${low.length?'has-alert':''}" onclick="openOutletStockSummary('${outlet.key}')">
        <span class="stock-outlet-top"><span><strong>${esc(outlet.name)}</strong><small>Updated ${formatDateShort(latestDate)}</small></span><span class="stock-outlet-total"><b>${closing}</b><small>closing</small></span></span>
        <span class="stock-outlet-locations"><span>Opening <b>${opening}</b></span><span>Closing <b>${closing}</b></span><span>Warehouse <b>${closingTotals.warehouse}</b></span>${variance!==0?`<span>Variance <b>${variance>0?'+':''}${variance}</b></span>`:''}</span>
        <span class="stock-outlet-footer">${low.length?`<span class="stock-low-badge">⚠ ${low.length} low</span>`:`<span class="stock-ok-badge">✓ Stock healthy</span>`}<span>View SKU summary ›</span></span>
      </button>`;
  }).join('')}</div>`;
  return cards + (hiddenCount ? `<button class="btn btn-ghost btn-block stock-history-toggle" onclick="toggleStockShowMore()">${stockShowMore?'Hide':'Show'} earlier stock records (${hiddenCount})</button>` : '');
}

function toggleStockShowMore(){ stockShowMore=!stockShowMore; render(); }

function stockThresholdScopeValue(){
  const settings = getStockThresholds();
  if(stockThresholdScope==='__all__'){
    const globalValue = Number(settings.__all__);
    return Number.isFinite(globalValue) && globalValue>=0 ? globalValue : 10;
  }
  return stockThreshold(stockThresholdScope);
}

function renderStockThresholdControl(outlets){
  if(stockThresholdScope!=='__all__' && !outlets.some(outlet=>outlet.key===stockThresholdScope)) stockThresholdScope='__all__';
  return `<div class="stock-alert-control">
    <strong>Low-stock alert</strong>
    <select id="stock-threshold-scope" aria-label="Choose low-stock alert scope" onchange="setStockThresholdScope(this.value)">
      <option value="__all__" ${stockThresholdScope==='__all__'?'selected':''}>All stores</option>
      ${outlets.map(outlet=>`<option value="${outlet.key}" ${stockThresholdScope===outlet.key?'selected':''}>${esc(outlet.name)}</option>`).join('')}
    </select>
    <label class="stock-threshold-inline"><input id="stock-threshold-scope-value" type="number" min="0" step="1" value="${stockThresholdScopeValue()}" aria-label="Low stock threshold" onchange="saveStockThresholdScope()" onkeydown="if(event.key==='Enter'){this.blur()}"><small>units</small></label>
  </div>`;
}

function setStockThresholdScope(scope){
  stockThresholdScope = scope;
  render();
}

function saveStockThresholdScope(){
  const input = document.getElementById('stock-threshold-scope-value');
  if(!input) return;
  const value = Math.max(0,Math.floor(Number(input.value)||0));
  const settings = getStockThresholds();
  if(stockThresholdScope==='__all__'){
    Object.keys(settings).forEach(key=>{ if(key!=='__all__') delete settings[key]; });
    settings.__all__ = value;
  }else{
    settings[stockThresholdScope] = value;
  }
  try{ localStorage.setItem(STOCK_THRESHOLD_KEY,JSON.stringify(settings)); }
  catch(e){ showToast('Could not save alert setting'); return; }
  render();
  const scopeLabel = stockThresholdScope==='__all__' ? 'all stores' : (stores.find(store=>store.id===stockThresholdScope)||{}).name || 'this store';
  showToast(value ? `Low-stock alert set to ${value} for ${scopeLabel}` : `Low-stock alert turned off for ${scopeLabel}`);
}

function renderStockManagement(){
  const outlets = currentOutletStocks();
  const lowCount = outlets.reduce((sum,outlet)=>sum+outlet.rows.filter(row=>isLowStock(row,stockThreshold(outlet.key))).length,0);
  return `<div class="stock-page-head">
      <div class="section-title">Stock Management</div>
      ${lowCount?`<span class="stock-page-alert">⚠ ${lowCount} low</span>`:''}
    </div>
    ${renderStockThresholdControl(outlets)}
    <div class="stock-section-heading"><h2>By outlet</h2></div>
    ${renderOutletCards(outlets)}`;
}

function renderStockSummaryTabs(outletKey, groups, active){
  return `<div class="stock-tabs stock-summary-tabs">${groups.map(group=>`
    <button type="button" class="stock-tab ${active===group.key?'active':''}" aria-pressed="${active===group.key}" onclick="setStockSummaryTab('${outletKey}','${group.key}')">
      ${esc(group.label)} <span class="stock-tab-count">${group.items.length}</span>
    </button>`).join('')}</div>`;
}

function setStockSummaryTab(outletKey, key){
  stockSummaryActiveTab[outletKey] = key;
  refreshOutletStockSummary(outletKey);
}

function stockSummaryInnerHtml(outletKey){
  const outlet = currentOutletStocks().find(item=>item.key===outletKey);
  if(!outlet) return null;
  const threshold = stockThreshold(outlet.key);
  const openingTotal = outlet.rows.reduce((sum,row)=>sum+stockOpeningTotal(row),0);
  const closingTotal = outlet.rows.reduce((sum,row)=>sum+stockClosingTotal(row),0);
  const productGroups = groupByProductTabs(outlet.rows,false);
  const active = activeProductTab(outlet.key,productGroups,stockSummaryActiveTab);
  const activeGroup = productGroups.find(group=>group.key===active);
  const visibleRows = activeGroup ? activeGroup.items : [];
  const rows = visibleRows.map(row=>{
    const low = isLowStock(row,threshold);
    const variance = stockClosingTotal(row)-(stockOpeningTotal(row)-Number(row.sales_qty||0));
    return `<div class="stock-summary-sku ${low?'is-low':''}">
      <span class="stock-summary-sku-head"><strong>${esc(displayProductName(row))}</strong><span><b>${stockClosingTotal(row)}</b> closing ${low?'<em>Low</em>':''}</span></span>
      <span class="field-hint">Opening ${stockOpeningTotal(row)} · Closing ${stockClosingTotal(row)}${variance!==0?` · Variance ${variance>0?'+':''}${variance}`:''}</span>
      <button type="button" class="stock-count-card" onclick="closeModal();openStockLocationForm('${row.id}','opening')">
        <small>Opening locations</small><span class="stock-location-chips">${stockLocationChips(row,'opening',true)}</span>
      </button>
      <button type="button" class="stock-count-card" onclick="closeModal();openStockLocationForm('${row.id}','closing')">
        <small>Closing locations</small><span class="stock-location-chips">${stockLocationChips(row,'closing',true)}</span>
      </button>
      <span class="stock-summary-edit">Counted ${formatDateShort(row.work_date)} · Tap to edit</span>
    </div>`;
  }).join('');
  return `
    <div class="stock-summary-head"><div class="modal-title">${esc(outlet.name)}</div><button type="button" class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="stock-summary-meta"><span>Opening ${openingTotal} · Closing ${closingTotal} · ${outlet.rows.length} SKUs</span></div>
    ${renderStockSummaryTabs(outlet.key,productGroups,active)}
    <div class="stock-summary-list">${rows}</div>
  `;
}

function openOutletStockSummary(outletKey){
  const html = stockSummaryInnerHtml(outletKey);
  if(html === null){ showToast('No stock found for that outlet'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet stock-summary-sheet" id="stock-summary-sheet">${html}</div>`;
  showModal(overlay);
  overlay.addEventListener('click',event=>{ if(event.target===overlay) closeModal(); });
}

// Refreshes only the stock summary sheet's own contents in place — used
// by the product-tab switch above so it doesn't flicker: the overlay and
// sheet elements stay in the DOM, so the backdrop never flashes and the
// sheet's open animation never replays.
function refreshOutletStockSummary(outletKey){
  const sheet = document.getElementById('stock-summary-sheet');
  const html = stockSummaryInnerHtml(outletKey);
  if(sheet && html !== null) sheet.innerHTML = html;
}

// ---------------- Edit form ----------------
function openStockLocationForm(id, field='opening'){
  const editing = salesReports.find(r=>r.id===id);
  if(!editing){ showToast('Could not find that record'); return; }
  if(!isStockManagedItem(editing)){ showToast('Free items are not tracked in Stock Management'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="form-title-row"><div class="modal-title">Edit ${field==='closing'?'closing':'opening'} stock</div><button type="button" class="calculator-launch" onclick="openCalculator(this)" aria-label="Open calculator" title="Calculator">🧮</button></div>
      <div class="field-hint" style="margin-bottom:12px;">${esc(displayProductName(editing))} · ${formatDateLong(editing.work_date)}</div>
      <div class="field">
        <label>Store</label>
        <select id="sl-store">
          <option value="">— Not specified —</option>
          ${stores.map(s=>`<option value="${s.id}" ${editing.store_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      ${field==='opening'?`<div class="stock-section-heading"><h2>Opening stock</h2><span id="sl-opening-total">${stockOpeningTotal(editing)}</span></div>
      <div class="field-row">
        <div class="field"><label>Store Room</label><input id="sl-store-room" type="number" min="0" step="1" value="${editing.store_room_qty||0}" placeholder="0" oninput="updateStockLocationHint()"></div>
        <div class="field"><label>Home Shelf</label><input id="sl-home-shelf" type="number" min="0" step="1" value="${editing.home_shelf_qty||0}" placeholder="0" oninput="updateStockLocationHint()"></div>
        <div class="field"><label>Standee</label><input id="sl-standee" type="number" min="0" step="1" value="${editing.standee_qty||0}" placeholder="0" oninput="updateStockLocationHint()"></div>
      </div>`:`<div class="stock-section-heading"><h2>Closing stock</h2><span id="sl-closing-total">${stockClosingTotal(editing)}</span></div>
      <div class="field-row">
        <div class="field"><label>Store Room</label><input id="sl-closing-store-room" type="number" min="0" step="1" value="${editing.closing_store_room_qty||0}" placeholder="0" oninput="updateStockLocationHint()"></div>
        <div class="field"><label>Home Shelf</label><input id="sl-closing-home-shelf" type="number" min="0" step="1" value="${editing.closing_home_shelf_qty||0}" placeholder="0" oninput="updateStockLocationHint()"></div>
        <div class="field"><label>Standee</label><input id="sl-closing-standee" type="number" min="0" step="1" value="${editing.closing_standee_qty||0}" placeholder="0" oninput="updateStockLocationHint()"></div>
      </div>`}
      <div class="field-hint" id="sl-location-hint">This ${field} total syncs to Sales. Warehouse is excluded.</div>
      <div class="field" style="margin-top:13px;">
        <label>Warehouse stock</label>
        <input id="sl-warehouse" type="number" min="0" step="1" value="${editing.warehouse_qty||0}" placeholder="0">
        <div class="field-hint">A running total — carries forward to the next working date automatically until edited again.</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="stock-location-save-btn" onclick="saveStockLocationForm('${id}','${field}')">Save</button>
      </div>
    </div>
  `;
  showModal(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  updateStockLocationHint();
}

function updateStockLocationHint(){
  const hint = document.getElementById('sl-location-hint');
  if(!hint) return;
  const opening = ['sl-store-room','sl-home-shelf','sl-standee'].reduce((sum,id)=>sum+(parseFloat(document.getElementById(id)?.value)||0),0);
  const closing = ['sl-closing-store-room','sl-closing-home-shelf','sl-closing-standee'].reduce((sum,id)=>sum+(parseFloat(document.getElementById(id)?.value)||0),0);
  const openingDisplay = document.getElementById('sl-opening-total');
  const closingDisplay = document.getElementById('sl-closing-total');
  if(openingDisplay) openingDisplay.textContent = opening;
  if(closingDisplay) closingDisplay.textContent = closing;
  hint.textContent = openingDisplay ? `Sales opening ${opening}. Warehouse is excluded.` : `Sales closing ${closing}. Warehouse is excluded.`;
  hint.classList.remove('field-hint-error');
}

async function saveStockLocationForm(id, field='opening'){
  const editing = salesReports.find(row=>row.id===id);
  if(!editing){ showToast('Could not find that record'); return; }
  const store_id = document.getElementById('sl-store').value || null;
  const store_room_qty = parseFloat(document.getElementById('sl-store-room')?.value) || 0;
  const home_shelf_qty = parseFloat(document.getElementById('sl-home-shelf')?.value) || 0;
  const standee_qty = parseFloat(document.getElementById('sl-standee')?.value) || 0;
  const closing_store_room_qty = parseFloat(document.getElementById('sl-closing-store-room')?.value) || 0;
  const closing_home_shelf_qty = parseFloat(document.getElementById('sl-closing-home-shelf')?.value) || 0;
  const closing_standee_qty = parseFloat(document.getElementById('sl-closing-standee')?.value) || 0;
  const warehouse_qty = parseFloat(document.getElementById('sl-warehouse').value) || 0;
  const openingTotal = store_room_qty + home_shelf_qty + standee_qty;
  const closingTotal = closing_store_room_qty + closing_home_shelf_qty + closing_standee_qty;

  const btn = document.getElementById('stock-location-save-btn');
  btn.disabled = true;
  try{
    btn.textContent = 'Saving…';
    const payload = { store_id, warehouse_qty };
    if(field==='closing') Object.assign(payload,{ closing_store_room_qty, closing_home_shelf_qty, closing_standee_qty, closing_qty:closingTotal });
    else Object.assign(payload,{ store_room_qty, home_shelf_qty, standee_qty, opening_qty:openingTotal });
    await DB.updateSalesReport(id, payload);
    if(field==='closing') await carryClosingToNextEvent(editing.product_name,editing.work_date,closingTotal,{storeRoom:closing_store_room_qty,homeShelf:closing_home_shelf_qty,standee:closing_standee_qty});
    await refreshData();
    closeModal();
    render();
    openOutletStockSummary(store_id || '__none__');
    showToast(`${field==='closing'?'Closing':'Opening'} stock saved · ${field==='closing'?closingTotal:openingTotal}`);
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

// ---------------- Add form ----------------
// Lets admin add a brand-new stock record straight from this tab,
// rather than only editing rows that were auto-seeded from the Sales
// tab. Product name and Store reuse the exact same suggestion list and
// outlet list as the Sales tab (getProductSuggestions/getVariationSuggestions
// and the shared `stores` global), so nothing has to be typed twice or
// risks drifting out of sync between the two tabs.
//
// Store Room + Home Shelf + Standee sync to the selected Sales Opening
// or Closing count. Warehouse remains separate. If a Sales entry already
// exists for this exact product + date + store, saving updates that row.
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
          <input id="asr-product" list="product-list" placeholder="e.g. Bio Dishwash 1L" oninput="onAddStockProductChange()">
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
      <div class="field-row">
        <div class="field"><label>Store Room</label><input id="asr-store-room" type="number" min="0" step="1" placeholder="0" oninput="updateAddStockOpeningTotal()"></div>
        <div class="field"><label>Home Shelf</label><input id="asr-home-shelf" type="number" min="0" step="1" placeholder="0" oninput="updateAddStockOpeningTotal()"></div>
        <div class="field"><label>Standee</label><input id="asr-standee" type="number" min="0" step="1" placeholder="0" oninput="updateAddStockOpeningTotal()"></div>
      </div>
      <div class="stock-section-heading"><h2>Closing stock</h2><span id="asr-closing-total">0</span></div>
      <div class="field-row">
        <div class="field"><label>Store Room</label><input id="asr-closing-store-room" type="number" min="0" step="1" placeholder="0" oninput="updateAddStockOpeningTotal()"></div>
        <div class="field"><label>Home Shelf</label><input id="asr-closing-home-shelf" type="number" min="0" step="1" placeholder="0" oninput="updateAddStockOpeningTotal()"></div>
        <div class="field"><label>Standee</label><input id="asr-closing-standee" type="number" min="0" step="1" placeholder="0" oninput="updateAddStockOpeningTotal()"></div>
      </div>
      <div class="field-hint" id="asr-opening-hint">Sales opening 0 · Sales closing 0. Warehouse is excluded.</div>
      <div class="field" style="margin-top:2px;">
        <label>Warehouse stock</label>
        <input id="asr-warehouse" type="number" min="0" step="1" value="0" placeholder="0">
        <div class="field-hint" id="asr-warehouse-hint">Auto-filled from this product's last known warehouse figure once you type a product name.</div>
      </div>
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
  const hint = document.getElementById('asr-opening-hint');
  if(!hint) return;
  const storeRoom = parseFloat(document.getElementById('asr-store-room').value) || 0;
  const homeShelf = parseFloat(document.getElementById('asr-home-shelf').value) || 0;
  const standee = parseFloat(document.getElementById('asr-standee').value) || 0;
  const closingStoreRoom = parseFloat(document.getElementById('asr-closing-store-room').value) || 0;
  const closingHomeShelf = parseFloat(document.getElementById('asr-closing-home-shelf').value) || 0;
  const closingStandee = parseFloat(document.getElementById('asr-closing-standee').value) || 0;
  const opening = storeRoom + homeShelf + standee;
  const closing = closingStoreRoom + closingHomeShelf + closingStandee;
  document.getElementById('asr-opening-total').textContent = opening;
  document.getElementById('asr-closing-total').textContent = closing;
  hint.textContent = `Sales opening ${opening} · Sales closing ${closing}. Warehouse is excluded.`;
}

// Re-looks-up the warehouse running total for whatever product name is
// currently typed, same carry-over idea as ensureStockRowsForDate in
// js/sales.js (most recent prior entry for that exact product name,
// across any date or store) — so Warehouse arrives pre-filled while
// Store Room / Home Shelf / Standee stay empty for a fresh count.
function onAddStockProductChange(){
  updateVariationDatalist('asr-product','variation-list');
  const base = document.getElementById('asr-product').value.trim();
  const variation = document.getElementById('asr-variation').value;
  const productName = composeProductName(base, variation);
  const warehouseInput = document.getElementById('asr-warehouse');
  const storeRoomInput = document.getElementById('asr-store-room');
  const homeShelfInput = document.getElementById('asr-home-shelf');
  const standeeInput = document.getElementById('asr-standee');
  const closingStoreRoomInput = document.getElementById('asr-closing-store-room');
  const closingHomeShelfInput = document.getElementById('asr-closing-home-shelf');
  const closingStandeeInput = document.getElementById('asr-closing-standee');
  const hint = document.getElementById('asr-warehouse-hint');
  if(!productName){
    storeRoomInput.value = '';
    homeShelfInput.value = '';
    standeeInput.value = '';
    closingStoreRoomInput.value = '';
    closingHomeShelfInput.value = '';
    closingStandeeInput.value = '';
    warehouseInput.value = 0;
    hint.textContent = "Auto-filled from this product's last known warehouse figure once you type a product name.";
    updateAddStockOpeningTotal();
    return;
  }
  const storeId = document.getElementById('asr-store').value || null;
  const existing = salesReports.find(row=>
    row.work_date===todayStr()
    && (row.store_id||null)===storeId
    && canonicalSkuName(row.product_name)===canonicalSkuName(productName)
  );
  if(existing){
    storeRoomInput.value = Number(existing.store_room_qty||0);
    homeShelfInput.value = Number(existing.home_shelf_qty||0);
    standeeInput.value = Number(existing.standee_qty||0);
    closingStoreRoomInput.value = Number(existing.closing_store_room_qty||0);
    closingHomeShelfInput.value = Number(existing.closing_home_shelf_qty||0);
    closingStandeeInput.value = Number(existing.closing_standee_qty||0);
    warehouseInput.value = Number(existing.warehouse_qty||0);
    hint.textContent = "Today's record already exists — saving will update its counts, not add another row.";
    updateAddStockOpeningTotal();
    return;
  }
  storeRoomInput.value = '';
  homeShelfInput.value = '';
  standeeInput.value = '';
  closingStoreRoomInput.value = '';
  closingHomeShelfInput.value = '';
  closingStandeeInput.value = '';
  const priorEntries = salesReports
    .filter(r => canonicalSkuName(r.product_name) === canonicalSkuName(productName))
    .sort((a,b) => b.work_date.localeCompare(a.work_date));
  if(priorEntries.length){
    warehouseInput.value = Number(priorEntries[0].warehouse_qty||0);
    hint.textContent = `Carried forward from ${formatDateShort(priorEntries[0].work_date)}'s figure for this product — edit if it's changed.`;
  }else{
    warehouseInput.value = 0;
    hint.textContent = 'No prior record for this product yet — starting from 0.';
  }
  updateAddStockOpeningTotal();
}

async function saveAddStockRecordForm(){
  const work_date = todayStr();
  const productBase = document.getElementById('asr-product').value.trim();
  const variation = document.getElementById('asr-variation').value;
  const product_name = composeProductName(productBase, variation);
  if(!productBase){ showToast('Product name is required'); return; }
  if(isGiveaway(product_name)){ showToast('Free items are not tracked in Stock Management'); return; }

  const store_id = document.getElementById('asr-store').value || null;
  const store_room_qty = parseFloat(document.getElementById('asr-store-room').value) || 0;
  const home_shelf_qty = parseFloat(document.getElementById('asr-home-shelf').value) || 0;
  const standee_qty = parseFloat(document.getElementById('asr-standee').value) || 0;
  const closing_store_room_qty = parseFloat(document.getElementById('asr-closing-store-room').value) || 0;
  const closing_home_shelf_qty = parseFloat(document.getElementById('asr-closing-home-shelf').value) || 0;
  const closing_standee_qty = parseFloat(document.getElementById('asr-closing-standee').value) || 0;
  const warehouse_qty = parseFloat(document.getElementById('asr-warehouse').value) || 0;
  const openingTotal = store_room_qty + home_shelf_qty + standee_qty;
  const closingTotal = closing_store_room_qty + closing_home_shelf_qty + closing_standee_qty;

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
      const payload = {store_room_qty,home_shelf_qty,standee_qty,closing_store_room_qty,closing_home_shelf_qty,closing_standee_qty,warehouse_qty,opening_qty:openingTotal,closing_qty:closingTotal};
      await DB.updateSalesReport(existing.id,payload);
    }else{
      await DB.addSalesReport({
        work_date, store_id, ...stockRecordAttribution(), product_name,
        opening_qty:openingTotal, sales_qty: 0, closing_qty:closingTotal,
        remarks: null, photo_url: null, is_free_item: false,
        store_room_qty, home_shelf_qty, standee_qty, closing_store_room_qty, closing_home_shelf_qty, closing_standee_qty, warehouse_qty
      });
    }
    await carryClosingToNextEvent(product_name,work_date,closingTotal,{storeRoom:closing_store_room_qty,homeShelf:closing_home_shelf_qty,standee:closing_standee_qty});
    await refreshData();
    closeModal();
    render();
    openOutletStockSummary(store_id || '__none__');
    showToast(`${existing ? 'Stock count updated' : 'Stock record added'} · Opening ${openingTotal} · Closing ${closingTotal}`);
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}
