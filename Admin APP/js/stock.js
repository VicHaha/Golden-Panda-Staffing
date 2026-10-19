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
let stockFormStoreId = null;  // outlet whose locations the open edit form shows

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

// The main cards always describe today; earlier days live under Past Records.
function stockActiveDate(){ return todayStr(); }

// [{ key, name, rows }] — outlets that have stock on `date`, A–Z. For today,
// only outlets that are scheduled today (see the Schedule) are included.
function outletStocksForDate(date){
  const scheduled = (date === todayStr() || isPromoterApp()) ? scheduledStoreIdsForDate(date) : null;
  const rows = dedupeStockRows(salesReports.filter(r=>r.work_date===date && isStockManagedItem(r) && (!scheduled || scheduled.has(r.store_id))));
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

// Variance = what was counted at closing minus what should be left
// (opening - sales). 0 means it tallies; negative = short, positive = over.
function stockVariance(row){
  return stockTotal(row,'closing') - (stockTotal(row,'opening') - Number(row.sales_qty||0));
}
function formatVariance(value){
  return `${value>0?'+':value<0?'−':'±'}${Math.abs(value)}`;
}

// One card per outlet: just the Opening and Closing totals (tap one to open
// that count), plus a variance line when SKUs don't tally. Which SKUs are low
// is shown in the Home "Stock Record" card.
function renderStockOutletCard(outlet, date){
  const sid = outlet.rows.length ? outlet.rows[0].store_id || null : null;
  const sum = totals => totals.filter(item=>locationCounts(item.loc)).reduce((acc,item)=>acc+item.total,0);
  const openTotal = sum(stockLocationTotals(outlet.rows, 'opening', sid));
  const closeTotal = sum(stockLocationTotals(outlet.rows, 'closing', sid));
  const variance = outlet.rows.reduce((acc,row)=>acc+stockVariance(row),0);
  const mismatched = outlet.rows.filter(row=>stockVariance(row)!==0).length;
  const action = (date === todayStr() || canEditPastSales()) ? 'Edit' : 'View';
  return `<section class="panel stock-card">
    <header class="panel-head"><h2>${esc(outlet.name)}</h2><span class="panel-meta">${date===todayStr()?'Today':formatDateShort(date)} · ${outlet.rows.length} SKUs</span></header>
    <div class="stock-totals">
      <button type="button" class="stock-total-btn" onclick="openOutletStockSummary('${outlet.key}','${date}',false,'opening')" aria-label="Opening stock — ${action.toLowerCase()}">
        <small>Opening</small><b>${openTotal}</b><span>${action} ›</span>
      </button>
      <button type="button" class="stock-total-btn" onclick="openOutletStockSummary('${outlet.key}','${date}',false,'closing')" aria-label="Closing stock — ${action.toLowerCase()}">
        <small>Closing</small><b>${closeTotal}</b><span>${action} ›</span>
      </button>
    </div>
    ${mismatched?`<div class="stock-variance ${variance<0?'short':'over'}">Variance ${formatVariance(variance)} · ${mismatched} SKU${mismatched>1?'s':''} don't tally</div>`:''}
  </section>`;
}

function renderStockPastRecords(activeDate){
  const dates = stockDatesDesc().filter(d=>d!==activeDate);
  if(!dates.length) return '';
  let html = `<button type="button" class="btn btn-ghost btn-block stock-history-toggle" style="margin-top:14px;" aria-expanded="${stockPastOpen}" onclick="toggleStockPast()">${stockPastOpen?'Hide':'Show'} earlier stock records (${dates.length})</button>`;
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
      <span class="stock-head-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick="openSkuRecord()">SKUs</button>
        ${manage?`<button type="button" class="btn btn-ghost btn-sm" onclick="openStockLocationsManager()">Locations</button>`:''}
      </span>
    </div>`;
  if(!scheduledStoreIdsForDate(date).size){
    // Not a working date: show the one previous working day instead (the
    // promoter app shows it view only; the admin app keeps everything editable).
    const previous = previousWorkingDate();
    const previousOutlets = previous ? outletStocksForDate(previous) : [];
    if(!previousOutlets.length) return html + emptyState('','Today is not a working date','Stock appears here on days you are scheduled.');
    html += `<div class="ss-prev-date">${formatDateShort(previous)}</div>`
      + `<div class="stock-outlet-grid">${previousOutlets.map(outlet=>renderStockOutletCard(outlet,previous)).join('')}</div>`;
    return isPromoterApp() ? html : html + renderStockPastRecords(previous);
  }
  // Scheduled outlets that have no SKUs yet wait here for their SKU list.
  const setupIds = [...scheduledStoreIdsForDate(date)].filter(id=>!outlets.some(o=>o.key===id));
  const setupCards = setupIds.map(id=>{
    const store = stores.find(x=>x.id===id);
    if(!store) return '';
    return `<section class="panel stock-card">
      <header class="panel-head"><h2>${esc(store.name)}</h2><span class="panel-meta">Today · 0 SKUs</span></header>
      <button type="button" class="btn btn-primary btn-block" onclick="openSkuListSheet('${id}')">Choose SKUs for this outlet</button>
    </section>`;
  }).join('');
  if(!outlets.length && !setupCards){
    html += emptyState('','No stock records yet today','Tap + to choose SKUs for an outlet.');
  }else{
    html += `<div class="stock-outlet-grid">${outlets.map(outlet=>renderStockOutletCard(outlet,date)).join('')}${setupCards}</div>`;
  }
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
  const locations = activeStockLocations(row.store_id || null);
  if(!locations.length) return '<span class="stock-location-empty">No stock locations</span>';
  return locations.map(loc=>`<span class="stock-location-chip ${locationCounts(loc)?'':'excluded'}"><small>${esc(loc.name)}${locationCounts(loc)?'':' (not in total)'}</small><b>${locationQty(row,loc.id,field)}</b></span>`).join('');
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
  const editable = date === todayStr() || canEditPastSales();
  const rows = visibleRows.map(row=>{
    const total = stockTotal(row,field);
    const low = field === 'closing' && total < LOW_STOCK_THRESHOLD;
    const variance = field === 'closing' ? stockVariance(row) : 0;
    const sold = Number(row.sales_qty||0);
    return `<${editable?'button type="button"':'div'} class="stock-summary-sku ${low?'is-low':''}" ${editable?`onclick="openStockLocationForm('${row.id}','${field}',true)"`:''}>
      <span class="stock-summary-sku-head"><strong>${esc(displayProductName(row))}</strong><span><b>${total}</b> ${field} ${low?'<em>Low</em>':''}</span></span>
      ${field==='closing'?`<span class="stock-variance-line ${variance===0?'ok':variance<0?'short':'over'}">Variance ${variance===0?'0':formatVariance(variance)}</span>`:''}
      <span class="stock-location-chips">${stockLocationChips(row,field)}</span>
    </${editable?'button':'div'}>`;
  }).join('');
  return `
    <div class="stock-summary-head"><div class="modal-title">${esc(outlet.name)} · ${field==='closing'?'Closing':'Opening'}</div><button type="button" class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="stock-summary-meta"><span>${formatDateLong(date)} · ${outlet.rows.length} SKUs · ${field==='closing'?closingTotal:openingTotal} total</span></div>
    ${renderStockSummaryTabs(stateKey,productGroups,active)}
    <div class="stock-summary-list">${rows}</div>
  `;
}

// mode ('opening' | 'closing') picks which count the sheet shows and edits;
// omitted, it keeps whatever the sheet last showed for this outlet and day.
function openOutletStockSummary(outletKey, date, reuseOverlay=false, mode){
  if(mode) stockSummaryCountMode[`${outletKey}|${date}`] = mode === 'closing' ? 'closing' : 'opening';
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
  if(editing.work_date !== todayStr() && !canEditPastSales()){ showToast("Only today's stock can be edited"); return; }
  const closing = field === 'closing';
  stockFormStoreId = editing.store_id || null;

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
      ${renderLocationInputs('sl-loc-', locationMap(editing,field), 'updateStockLocationHint()', stockFormStoreId)}
      <div class="field">
        <label for="sl-remarks">Remarks (optional)</label>
        <input id="sl-remarks" value="${esc(editing.remarks||'')}" placeholder="e.g. 2 units damaged">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="stock-location-save-btn" onclick="saveStockLocationForm('${id}','${field}')">Save</button>
      </div>
      ${(canEditPastSales() || editing.work_date===todayStr()) ? `<button type="button" class="btn btn-danger-ghost btn-block sales-delete-action" onclick="deleteStockSku('${id}')">Delete this SKU</button>` : ''}
    </div>
  `;
  if(!existing){
    showModal(overlay);
    overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  }
  updateStockLocationHint();
}

function updateStockLocationHint(){
  const total = sumLocationInputs('sl-loc-', stockFormStoreId);
  const display = document.getElementById('sl-total');
  if(display) display.textContent = total;
}

// Deletes one SKU's record (this outlet, this day): its stock counts and its sales.
async function deleteStockSku(id){
  const row = salesReports.find(r=>r.id===id);
  if(!row) return;
  if(row.work_date !== todayStr() && !canEditPastSales()){ showToast("Only today's stock can be deleted"); return; }
  if(!confirm(`Delete ${canonicalSkuName(row.product_name)} at ${stockOutletName(row)} on ${formatDateShort(row.work_date)}?

This removes its stock counts and sales for that day.`)) return;
  try{
    await DB.deleteSalesReport(id);
    await refreshData();
    render();
    const key = row.store_id || '__none__';
    if(stockSummaryInnerHtml(key, row.work_date) !== null) openOutletStockSummary(key, row.work_date, true);
    else closeModal();
    showToast(`${canonicalSkuName(row.product_name)} deleted`);
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}

async function saveStockLocationForm(id, field='opening'){
  const editing = salesReports.find(row=>row.id===id);
  if(!editing){ showToast('Could not find that record'); return; }
  const closing = field === 'closing';
  const store_id = document.getElementById('sl-store').value || null;
  const map = readLocationInputs('sl-loc-', locationMap(editing,field), stockFormStoreId);
  const total = locationMapTotal(map, stockFormStoreId);

  const btn = document.getElementById('stock-location-save-btn');
  btn.disabled = true;
  try{
    btn.textContent = 'Saving…';
    const payload = { store_id, remarks: document.getElementById('sl-remarks').value.trim() || null, ...stockRecordAttribution() };
    if(closing) Object.assign(payload,{ closing_location_qty:map, closing_qty:total });
    else Object.assign(payload,{ location_qty:map, opening_qty:total });
    await DB.updateSalesReport(id, payload);
    if(closing) await carryClosingToNextEvent(editing.product_name,editing.work_date,total,map,store_id);
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
