// ============================================================
// Stock — opening and closing counts by working date + outlet.
// These views edit the existing opening_qty / closing_qty columns only.
// ============================================================

let stockShowPast = false;
let stockCardActiveTab = {};

function stockGroupKey(date, storeKey){ return `${date}|${storeKey || '__none__'}`; }

function stockWorkingGroups(){
  const groups = [];
  const byKey = {};
  salesReports.forEach(row=>{
    const storeKey = row.store_id || '__none__';
    const key = stockGroupKey(row.work_date,storeKey);
    if(!byKey[key]){
      byKey[key] = {
        key,
        date:row.work_date,
        storeKey,
        location:row.stores ? row.stores.name : 'Location not specified',
        items:[]
      };
      groups.push(byKey[key]);
    }
    byKey[key].items.push(row);
  });
  groups.forEach(group=>group.items.sort((a,b)=>skuOrderIndex(a)-skuOrderIndex(b)));
  return groups.sort((a,b)=>b.date.localeCompare(a.date) || a.location.localeCompare(b.location));
}

function renderStockManagement(){
  const today = todayStr();
  const allGroups = stockWorkingGroups();
  const pastGroups = allGroups.filter(group=>group.date<today);
  const visible = stockShowPast ? allGroups : allGroups.filter(group=>group.date>=today);
  let html = `<div class="section-title">Stock <span class="count-pill">${allGroups.length} location-day${allGroups.length===1?'':'s'}</span></div>
    <p class="section-intro">Count stock twice per working day. Closing automatically becomes the next working date's opening, and that opening can still be edited.</p>`;
  if(!visible.length){
    html += emptyState('📦','No stock days yet','Stock cards appear automatically for scheduled working days.');
  }else{
    html += `<div class="stock-day-list">${visible.map(renderStockDayGroup).join('')}</div>`;
  }
  if(pastGroups.length){
    html += `<button class="btn btn-ghost btn-block" style="margin-top:14px;" onclick="stockShowPast=!stockShowPast;render()">${stockShowPast?'Hide':'Show'} past stock (${pastGroups.length})</button>`;
  }
  return html;
}

function renderStockDayGroup(group){
  const opening = group.items.reduce((sum,row)=>sum+Number(row.opening_qty||0),0);
  const closing = group.items.reduce((sum,row)=>sum+Number(row.closing_qty||0),0);
  const locked = group.date!==todayStr();
  return `<section class="stock-day-group">
    <div class="stock-day-head"><div><strong>${formatDateLong(group.date)}</strong><small>${esc(group.location)}</small></div>${group.date===todayStr()?'<span>Today</span>':'<span class="is-locked">🔒 Locked</span>'}</div>
    <div class="stock-count-grid">
      ${renderStockCountCard(group,'opening',opening,locked)}
      ${renderStockCountCard(group,'closing',closing,locked)}
    </div>
  </section>`;
}

function renderStockCountCard(group,phase,total,locked){
  const label = phase==='opening' ? 'Opening' : 'Closing';
  const hint = phase==='opening' ? 'Start-of-day count' : 'End-of-day count';
  return `<button type="button" class="stock-count-card ${phase}" onclick="openStockCountCard('${group.date}','${group.storeKey}','${phase}')">
    <span class="stock-count-label">${label}</span><b>${total}</b><small>${hint}</small><em>${locked?'View':'Tap to edit'} ›</em>
  </button>`;
}

function stockCardRows(date,storeKey){
  return salesReports.filter(row=>row.work_date===date && (row.store_id||'__none__')===storeKey).sort((a,b)=>skuOrderIndex(a)-skuOrderIndex(b));
}

function promoterStockLocationText(row){
  const locations = [
    ['Store room',Number(row.store_room_qty||0)],
    ['Home shelf',Number(row.home_shelf_qty||0)],
    ['Standee',Number(row.standee_qty||0)],
    ['Warehouse',Number(row.warehouse_qty||0)]
  ];
  return locations.map(([name,qty])=>`${name} ${qty}`).join(' · ');
}

function stockCountCardHtml(date,storeKey,phase){
  const rows = stockCardRows(date,storeKey);
  if(!rows.length) return null;
  const groups = groupByStockCategory(rows);
  const key = stockGroupKey(date,storeKey);
  const active = stockCardActiveTab[key] && groups[stockCardActiveTab[key]] && groups[stockCardActiveTab[key]].length ? stockCardActiveTab[key] : (STOCK_CATEGORIES.find(cat=>groups[cat.key].length)||STOCK_CATEGORIES[0]).key;
  stockCardActiveTab[key] = active;
  const location = rows[0].stores ? rows[0].stores.name : 'Location not specified';
  const editable = date===todayStr();
  const label = phase==='opening' ? 'Opening stock' : 'Closing stock';
  return `<div class="stock-summary-head"><div><div class="modal-title">${label}</div><div class="sales-summary-meta">${formatDateLong(date)} · ${esc(location)}</div></div><button type="button" class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="stock-tabs">${STOCK_CATEGORIES.map(cat=>`<button class="stock-tab ${active===cat.key?'active':''}" onclick="setStockCardTab('${date}','${storeKey}','${phase}','${cat.key}')">${cat.label}<span class="stock-tab-count">${groups[cat.key].length}</span></button>`).join('')}</div>
    <div class="stock-count-list">${groups[active].map(row=>`<div class="stock-count-row"><button type="button" class="stock-count-main" ${editable?`onclick="closeModal();openStockCountForm('${row.id}','${phase}')"`:'disabled'}>
      <span><strong>${esc(displayProductName(row))}</strong><small>${isFreeItem(row)?'Free item · ':''}${promoterStockLocationText(row)}</small></span><b>${Number(row[phase+'_qty']||0)}</b><em>${editable?'Edit ›':'🔒'}</em>
    </button>${editable?`<button type="button" class="stock-location-link" onclick="closeModal();openPromoterStockLocationForm('${row.id}','${phase}')">Locations</button>`:''}</div>`).join('')}</div>
    ${!editable?'<p class="stock-readonly-note">Past stock records are view-only in the Promoter app.</p>':''}`;
}

function openStockCountCard(date,storeKey,phase){
  const html = stockCountCardHtml(date,storeKey,phase);
  if(html===null){ showToast('No stock records found'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay modal-overlay-centered';
  overlay.innerHTML = `<div class="modal-sheet stock-summary-sheet" id="stock-count-sheet">${html}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{ if(event.target===overlay) closeModal(); });
}

function setStockCardTab(date,storeKey,phase,tab){
  stockCardActiveTab[stockGroupKey(date,storeKey)] = tab;
  const sheet = document.getElementById('stock-count-sheet');
  if(sheet) sheet.innerHTML = stockCountCardHtml(date,storeKey,phase);
}

function openStockCountForm(id,phase){
  const row = salesReports.find(item=>item.id===id);
  if(!row || !['opening','closing'].includes(phase)) return;
  const storeKey = row.store_id || '__none__';
  const label = phase==='opening' ? 'Opening stock' : 'Closing stock';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet">
    <div class="form-title-row"><div class="modal-title">Edit ${label.toLowerCase()}</div><button type="button" class="calculator-launch" onclick="openCalculator()" aria-label="Open calculator">🧮</button></div>
    <div class="field-hint" style="margin-bottom:12px;">${esc(displayProductName(row))} · ${formatDateLong(row.work_date)} · ${esc(row.stores?row.stores.name:'Location not specified')}</div>
    <div class="field"><label>${label}</label><div class="qty-stepper">
      <button type="button" class="qty-btn qty-minus" onclick="stepQty('stock-count-qty',-1)" aria-label="Decrease count">−</button>
      <input id="stock-count-qty" type="number" min="0" step="1" value="${Number(row[phase+'_qty']||0)}">
      <button type="button" class="qty-btn qty-plus" onclick="stepQty('stock-count-qty',1)" aria-label="Increase count">+</button>
    </div></div>
    ${phase==='opening'?'<div class="field-hint">Carried from the previous working date by default. You can edit it when the physical count differs.</div>':'<div class="field-hint">Saving this count updates the next working date\'s opening automatically.</div>'}
    <div class="modal-actions"><button class="btn btn-ghost" onclick="returnToStockCard('${row.work_date}','${storeKey}','${phase}')">Cancel</button><button class="btn btn-primary" id="stock-count-save-btn" onclick="saveStockCountForm('${id}','${phase}')">Save</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{ if(event.target===overlay) returnToStockCard(row.work_date,storeKey,phase); });
}

function returnToStockCard(date,storeKey,phase){
  closeModal();
  render();
  openStockCountCard(date,storeKey,phase);
}

async function saveStockCountForm(id,phase){
  const row = salesReports.find(item=>item.id===id);
  if(!row) return;
  const quantity = Math.max(0,parseFloat(document.getElementById('stock-count-qty').value)||0);
  const btn = document.getElementById('stock-count-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try{
    await DB.updateSalesReport(id,{[phase+'_qty']:quantity});
    if(phase==='closing') await carryClosingToNextEvent(row.product_name,row.work_date,quantity);
    await refreshData();
    returnToStockCard(row.work_date,row.store_id||'__none__',phase);
    showToast(`${phase==='opening'?'Opening':'Closing'} stock saved`);
  }catch(e){
    console.error(e);
    showToast('Could not save — '+(e.message||'check your connection'));
    btn.disabled = false; btn.textContent = 'Save';
  }
}

function openPromoterStockLocationForm(id,phase){
  const row = salesReports.find(item=>item.id===id);
  if(!row || row.work_date!==todayStr()) return;
  const storeKey = row.store_id || '__none__';
  const label = phase==='opening' ? 'Opening' : 'Closing';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet">
    <div class="form-title-row"><div class="modal-title">${label} stock locations</div><button type="button" class="calculator-launch" onclick="openCalculator()" aria-label="Open calculator">🧮</button></div>
    <div class="field-hint" style="margin-bottom:12px;">${esc(displayProductName(row))} · ${formatDateLong(row.work_date)} · ${esc(row.stores?row.stores.name:'Location not specified')}</div>
    <div class="field"><label>${label} stock total</label><input id="psl-stock-total" type="text" value="${Number(row[phase+'_qty']||0)}" disabled></div>
    <div class="field-row"><div class="field"><label>Store Room</label><input id="psl-store-room" type="number" min="0" step="1" value="${Number(row.store_room_qty||0)}" oninput="updatePromoterStockLocationHint()"></div><div class="field"><label>Home Shelf</label><input id="psl-home-shelf" type="number" min="0" step="1" value="${Number(row.home_shelf_qty||0)}" oninput="updatePromoterStockLocationHint()"></div></div>
    <div class="field-row"><div class="field"><label>Standee</label><input id="psl-standee" type="number" min="0" step="1" value="${Number(row.standee_qty||0)}" oninput="updatePromoterStockLocationHint()"></div><div class="field"><label>Warehouse</label><input id="psl-warehouse" type="number" min="0" step="1" value="${Number(row.warehouse_qty||0)}"></div></div>
    <div class="field-hint" id="psl-location-hint"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="returnToStockCard('${row.work_date}','${storeKey}','${phase}')">Cancel</button><button class="btn btn-primary" id="promoter-stock-location-save-btn" onclick="savePromoterStockLocationForm('${id}','${phase}')">Save</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay)returnToStockCard(row.work_date,storeKey,phase);});
  updatePromoterStockLocationHint();
}

function updatePromoterStockLocationHint(){
  const hint = document.getElementById('psl-location-hint');
  if(!hint) return;
  const total = Number(document.getElementById('psl-stock-total').value)||0;
  const allocated = ['psl-store-room','psl-home-shelf','psl-standee'].reduce((sum,id)=>sum+(Number(document.getElementById(id).value)||0),0);
  hint.textContent = allocated===total ? `✓ On-site locations match the stock total (${total}).` : `${allocated} allocated on site · stock total is ${total}. Warehouse is tracked separately.`;
  hint.classList.toggle('field-hint-error',allocated!==total);
}

async function carryPromoterStockLocationsToNextEvent(row,payload){
  const nextDate = [...new Set([...scheduledDates,...salesReports.map(item=>item.work_date)])].filter(date=>date>row.work_date).sort()[0];
  if(!nextDate) return;
  const nextRows = salesReports.filter(item=>item.work_date===nextDate&&canonicalSkuName(item.product_name)===canonicalSkuName(row.product_name));
  for(const nextRow of nextRows) await DB.updateSalesReport(nextRow.id,payload);
}

async function savePromoterStockLocationForm(id,phase){
  const row = salesReports.find(item=>item.id===id);
  if(!row) return;
  const payload = {
    store_room_qty:Math.max(0,Number(document.getElementById('psl-store-room').value)||0),
    home_shelf_qty:Math.max(0,Number(document.getElementById('psl-home-shelf').value)||0),
    standee_qty:Math.max(0,Number(document.getElementById('psl-standee').value)||0),
    warehouse_qty:Math.max(0,Number(document.getElementById('psl-warehouse').value)||0)
  };
  const btn = document.getElementById('promoter-stock-location-save-btn');
  btn.disabled=true;btn.textContent='Saving…';
  try{
    await DB.updateSalesReport(id,payload);
    await carryPromoterStockLocationsToNextEvent(row,payload);
    await refreshData();
    returnToStockCard(row.work_date,row.store_id||'__none__',phase);
    showToast('Stock locations saved');
  }catch(e){
    console.error(e);showToast('Could not save — '+(e.message||'check your connection'));btn.disabled=false;btn.textContent='Save';
  }
}
