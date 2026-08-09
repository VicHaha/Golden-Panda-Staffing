// ============================================================
// Stock Management — separate from the Sales tab. Same visual design
// (date groups that expand/collapse, category tabs, modal-sheet edit
// forms) as js/sales.js, but this tab only manages two things:
//
//   1. Stock by location — Store Room / Home Shelf / Standee, per
//      product per working date.
//   2. Warehouse stock — a running total per product, carried forward
//      automatically to each new working date (see ensureStockRowsForDate
//      in js/sales.js) until edited again here.
//
// Both fields already live on the same `sales_reports` rows the Sales
// tab reads and writes — this tab just edits a different slice of each
// row's columns, and never touches opening/sales/closing/remarks/
// customer_feedback (that's the Sales tab's job — see js/sales.js).
//
// Free items (Gift Set, Flyer, Small Samples, Coupons, or anything
// hand-marked "Free item") are excluded entirely — location and
// warehouse tracking is only meaningful for sellable stock.
//
// Also renders the "overview" strip at the top: total stock currently
// on hand at each outlet, plus total warehouse stock, both as of the
// most recent working date that has stock logged.
// ============================================================

let stockMgmtExpandedDates = new Set();

// Same idea as STOCK_CATEGORIES in js/sales.js, minus "Free" — free
// items don't carry a location/warehouse breakdown, so there's nothing
// for this tab to show or edit for them.
const STOCK_MGMT_CATEGORIES = STOCK_CATEGORIES.filter(c => c.key !== 'free');

let stockMgmtActiveTab = {};
function activeStockMgmtTab(date, grouped){
  const current = stockMgmtActiveTab[date];
  if(current && grouped[current] && grouped[current].length) return current;
  const firstNonEmpty = STOCK_MGMT_CATEGORIES.find(c => grouped[c.key].length);
  return firstNonEmpty ? firstNonEmpty.key : 'bottle';
}
function setStockMgmtTab(date, key){
  stockMgmtActiveTab[date] = key;
  render();
}
function renderStockMgmtTabs(date, grouped, active){
  return `<div class="stock-tabs">${STOCK_MGMT_CATEGORIES.map(c=>{
    const count = grouped[c.key].length;
    return `<button class="stock-tab ${active===c.key?'active':''}" onclick="setStockMgmtTab('${date}','${c.key}')">${c.label}${count?` <span class="stock-tab-count">${count}</span>`:''}</button>`;
  }).join('')}</div>`;
}

function toggleStockMgmtDate(date){
  if(stockMgmtExpandedDates.has(date)) stockMgmtExpandedDates.delete(date);
  else stockMgmtExpandedDates.add(date);
  render();
}

// ---------------- Overview: total stock per outlet ----------------
// Built from the most recent working date that has any (non-free)
// stock logged — a live snapshot of what's currently on hand, not a
// historical rollup.
function computeStockOverview(){
  const sellable = salesReports.filter(r => !isFreeItem(r));
  if(sellable.length === 0) return null;
  const latestDate = [...new Set(sellable.map(r => r.work_date))].sort((a,b)=> b.localeCompare(a))[0];
  const rows = sellable.filter(r => r.work_date === latestDate);

  const byStore = {};
  const bump = name => byStore[name] || (byStore[name] = { storeRoom:0, homeShelf:0, standee:0 });
  rows.forEach(r=>{
    const name = r.stores ? r.stores.name : '(store not specified)';
    const b = bump(name);
    b.storeRoom += Number(r.store_room_qty||0);
    b.homeShelf += Number(r.home_shelf_qty||0);
    b.standee += Number(r.standee_qty||0);
  });
  const totalWarehouse = rows.reduce((s,r)=> s + Number(r.warehouse_qty||0), 0);

  return { latestDate, byStore, totalWarehouse };
}

function renderStockOverview(){
  const ov = computeStockOverview();
  if(!ov){
    return emptyState('🏬','No stock to show yet','Log opening/closing stock for a product from the Sales tab first, then come back here to record where it sits.');
  }

  const storeEntries = Object.entries(ov.byStore)
    .map(([name, v])=> ({ name, total: v.storeRoom+v.homeShelf+v.standee, ...v }))
    .sort((a,b)=> b.total - a.total);
  const grandTotal = storeEntries.reduce((s,v)=> s+v.total, 0);

  let html = `
    <div class="section-title">Stock overview <span class="count-pill">as of ${formatDateShort(ov.latestDate)}</span></div>
    <div class="summary-strip">
      <div class="stat-card"><div class="num">${grandTotal}</div><div class="lbl">On floor (all outlets)</div></div>
      <div class="stat-card"><div class="num">${ov.totalWarehouse}</div><div class="lbl">Warehouse stock</div></div>
    </div>
  `;

  if(storeEntries.length === 0){
    html += emptyState('🏬','No outlet stock logged yet','Stock by location is entered per product below, grouped by store.');
  }else{
    html += `<div class="section-title" style="margin-top:2px;">By outlet</div>`;
    storeEntries.forEach((s,i)=>{
      html += `
        <div class="analysis-table-row">
          <div style="display:flex; align-items:center; min-width:0;">
            <span class="analysis-rank">${i+1}</span>
            <span>${esc(s.name)}</span>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div><b>${s.total}</b> units</div>
            <div style="font-size:11px; color:var(--ink-soft); margin-top:1px;">Store Room ${s.storeRoom} · Home Shelf ${s.homeShelf} · Standee ${s.standee}</div>
          </div>
        </div>
      `;
    });
  }

  return html;
}

// ---------------- Main render ----------------
function renderStockManagement(){
  let html = `<div class="section-title">Stock Management</div>`;
  html += `<div class="field-hint" style="margin:-8px 0 16px;">Where each product's stock currently sits — Store Room, Home Shelf, Standee, and the central warehouse. Opening/sold/closing counts live on the Sales tab.</div>`;
  html += renderStockOverview();

  const sellable = salesReports.filter(r => !isFreeItem(r));
  if(sellable.length === 0){
    return html;
  }

  const byDate = {};
  sellable.forEach(r=>{
    if(!byDate[r.work_date]) byDate[r.work_date] = [];
    byDate[r.work_date].push(r);
  });
  const dates = Object.keys(byDate).sort((a,b)=> b.localeCompare(a));
  const today = todayStr();

  html += `<div class="section-title" style="margin-top:22px;">By date <span class="count-pill">${dates.length} date${dates.length>1?'s':''}</span></div>`;

  dates.forEach(date=>{
    const items = byDate[date];
    const expanded = stockMgmtExpandedDates.has(date);
    const totalOnFloor = items.reduce((s,i)=> s + Number(i.store_room_qty||0) + Number(i.home_shelf_qty||0) + Number(i.standee_qty||0), 0);
    const storeNames = [...new Set(items.filter(i=>i.stores).map(i=>i.stores.name))];
    const isToday = date === today;

    let body = '';
    if(expanded){
      const grouped = groupByStockCategory(items);
      const active = activeStockMgmtTab(date, grouped);
      const activeItems = grouped[active];
      body = `<div class="sales-group-body">
        ${renderStockMgmtTabs(date, grouped, active)}
        ${activeItems.length ? renderStockMgmtItems(activeItems) : `<div class="stock-tab-empty">No products in this group yet.</div>`}
      </div>`;
    }

    html += `
      <div class="sales-group">
        <button class="sales-group-header" onclick="toggleStockMgmtDate('${date}')">
          <div>
            <div class="sales-group-date">${formatDateLong(date)} ${isToday?'<span class="count-pill">Today</span>':''}</div>
            <div class="sales-group-sub">${items.length} product${items.length>1?'s':''}${storeNames.length?' · '+esc(storeNames.join(', ')):''} · ${totalOnFloor} on floor</div>
          </div>
          <span class="sales-group-chevron ${expanded?'open':''}">▾</span>
        </button>
        ${body}
      </div>
    `;
  });

  return html;
}

function renderStockMgmtItems(items){
  return items.map(i=>{
    const storeRoom = Number(i.store_room_qty||0), homeShelf = Number(i.home_shelf_qty||0), standee = Number(i.standee_qty||0);
    const closing = Number(i.closing_qty||0);
    const sum = storeRoom + homeShelf + standee;
    return `
      <div class="sales-item">
        <div class="sales-item-main">
          <div class="sales-item-name">${esc(displayProductName(i))}</div>
          <div class="sales-item-stats">
            Store Room <b>${storeRoom}</b> · Home Shelf <b>${homeShelf}</b> · Standee <b>${standee}</b>
            ${sum !== closing ? `<span class="sales-variance ${sum<closing?'short':'over'}">${sum-closing>0?'+':''}${sum-closing} vs closing (${closing})</span>` : ''}
          </div>
          <div class="sales-item-stats" style="margin-top:2px;">Warehouse <b>${Number(i.warehouse_qty||0)}</b></div>
        </div>
        <div class="job-actions">
          <div class="icon-btn" onclick="openStockLocationForm('${i.id}')">✎</div>
        </div>
      </div>
    `;
  }).join('');
}

// ---------------- Edit form ----------------
function openStockLocationForm(id){
  const editing = salesReports.find(r=>r.id===id);
  if(!editing){ showToast('Could not find that record'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">Edit stock location</div>
      <div class="field-hint" style="margin-bottom:12px;">${esc(displayProductName(editing))} · ${formatDateLong(editing.work_date)}</div>
      <div class="field">
        <label>Store</label>
        <select id="sl-store">
          <option value="">— Not specified —</option>
          ${stores.map(s=>`<option value="${s.id}" ${editing.store_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Closing stock (from Sales tab)</label>
        <input id="sl-closing-display" type="text" value="${editing.closing_qty}" disabled>
      </div>
      <div class="field-row">
        <div class="field"><label>Store Room</label><input id="sl-store-room" type="number" min="0" step="1" value="${editing.store_room_qty||0}" placeholder="0" oninput="updateStockLocationHint()"></div>
        <div class="field"><label>Home Shelf</label><input id="sl-home-shelf" type="number" min="0" step="1" value="${editing.home_shelf_qty||0}" placeholder="0" oninput="updateStockLocationHint()"></div>
        <div class="field"><label>Standee</label><input id="sl-standee" type="number" min="0" step="1" value="${editing.standee_qty||0}" placeholder="0" oninput="updateStockLocationHint()"></div>
      </div>
      <div class="field-hint" id="sl-location-hint">Should add up to the closing stock above.</div>
      <div class="field" style="margin-top:13px;">
        <label>Warehouse stock</label>
        <input id="sl-warehouse" type="number" min="0" step="1" value="${editing.warehouse_qty||0}" placeholder="0">
        <div class="field-hint">A running total — carries forward to the next working date automatically until edited again.</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="stock-location-save-btn" onclick="saveStockLocationForm('${id}')">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  updateStockLocationHint();
}

function updateStockLocationHint(){
  const hint = document.getElementById('sl-location-hint');
  if(!hint) return;
  const closing = parseFloat(document.getElementById('sl-closing-display').value) || 0;
  const storeRoom = parseFloat(document.getElementById('sl-store-room').value) || 0;
  const homeShelf = parseFloat(document.getElementById('sl-home-shelf').value) || 0;
  const standee = parseFloat(document.getElementById('sl-standee').value) || 0;
  const sum = storeRoom + homeShelf + standee;

  if(sum === closing){
    hint.textContent = `✓ Matches closing stock (${closing}).`;
    hint.classList.remove('field-hint-error');
  }else{
    hint.textContent = `${sum} entered so far — closing stock is ${closing}.`;
    hint.classList.add('field-hint-error');
  }
}

async function saveStockLocationForm(id){
  const store_id = document.getElementById('sl-store').value || null;
  const store_room_qty = parseFloat(document.getElementById('sl-store-room').value) || 0;
  const home_shelf_qty = parseFloat(document.getElementById('sl-home-shelf').value) || 0;
  const standee_qty = parseFloat(document.getElementById('sl-standee').value) || 0;
  const warehouse_qty = parseFloat(document.getElementById('sl-warehouse').value) || 0;

  const btn = document.getElementById('stock-location-save-btn');
  btn.disabled = true;
  try{
    btn.textContent = 'Saving…';
    // Only touches these five columns — opening/sales/closing, remarks,
    // and everything else on the row stays untouched.
    await DB.updateSalesReport(id, { store_id, store_room_qty, home_shelf_qty, standee_qty, warehouse_qty });
    await refreshData();
    closeModal();
    render();
    showToast('Stock location saved');
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}
