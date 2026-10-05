// ============================================================
// Stock locations — the user-editable list behind the location boxes in
// Stock Management (Store Room, Home Shelf, Standee, Warehouse by default).
//
// Locations can apply to every outlet (store_id null) or belong to a single
// outlet; a shared location can also be hidden for specific outlets
// (hidden_for). Quantities live on each sales_reports row as two jsonb maps
// keyed by location id: location_qty (opening) and closing_location_qty
// (closing). Removing a location only hides it (active=false / hidden_for)
// so old rows keep their numbers. This file is identical in the admin and
// promoter apps; only the admin app shows the "Locations" manager (see
// canManageStockLocations() in each app's app.js).
// ============================================================

// A SKU is "low" when its closing stock (all locations added up) is below this.
const LOW_STOCK_THRESHOLD = 10;

let stockLocations = [];

// Outlets that have someone scheduled on `date` (from the Schedule). Today's
// Sales Section and Stock Management only show these outlets, so both stay in
// sync with the schedule: no job today, no cards.
function scheduledStoreIdsForDate(date){
  const ids = new Set();
  jobs.forEach(job=>{
    if(job.work_date !== date) return;
    // The promoter app only counts the signed-in promoter's own shifts.
    if(typeof jobCountsForSchedule === 'function' && !jobCountsForSchedule(job)) return;
    const id = job.store_id || (job.stores && job.stores.id);
    if(id) ids.add(id);
  });
  // Admin app: records added or kept by hand count too, so nothing the admin
  // can edit is ever hidden. (The promoter app only follows its own shifts.)
  if(!isPromoterApp()) salesReports.forEach(row=>{ if(row.work_date === date && row.store_id) ids.add(row.store_id); });
  return ids;
}

// The outlet a job is at (the promoter app's job query nests it under stores).
function jobStoreId(job){
  return job.store_id || (job.stores && job.stores.id) || null;
}
// Every outlet with a job on `date`, whoever is working it.
function jobStoreIdsForDate(date){
  const ids = new Set();
  jobs.forEach(job=>{ const id = jobStoreId(job); if(job.work_date === date && id) ids.add(id); });
  return ids;
}

// <option>s for a Store dropdown. New records can only go to outlets that are
// scheduled today (the Schedule decides where stock and sales are recorded);
// editing an existing record still offers every outlet.
function storeOptionsHtml(selectedId, editing){
  const scheduled = scheduledStoreIdsForDate(todayStr());
  const list = editing ? stores : stores.filter(s=>scheduled.has(s.id));
  return (editing ? '<option value="">— Not specified —</option>' : '')
    + list.map(s=>`<option value="${s.id}" ${selectedId===s.id?'selected':''}>${esc(s.name)}</option>`).join('');
}

// Only the promoter app defines jobCountsForSchedule (it counts the signed-in
// promoter's own shifts), so its presence tells the apps apart.
function isPromoterApp(){
  return typeof jobCountsForSchedule === 'function';
}
// The most recent working date before today (for the promoter app: the last
// day THIS promoter worked). On a non-working day the promoter app shows that
// one previous record, view only.
function previousWorkingDate(){
  const today = todayStr();
  let latest = null;
  jobs.forEach(job=>{
    if(job.work_date >= today) return;
    if(isPromoterApp() && !jobCountsForSchedule(job)) return;
    if(!latest || job.work_date > latest) latest = job.work_date;
  });
  return latest;
}

function normalizeStoreId(storeId){
  return storeId && storeId !== '__none__' ? storeId : null;
}

// Does this location's quantity count toward the opening/closing totals?
// (Warehouse is shown but kept out of the totals.) Defaults to yes.
function locationCounts(loc){
  return loc.counts_in_total !== false;
}

function sortedStockLocations(){
  return [...stockLocations].sort((a,b)=>(a.sort_order-b.sort_order) || String(a.created_at||'').localeCompare(String(b.created_at||'')));
}

// Does this location show for the given outlet? With no storeId argument at
// all (the Excel export) every active location counts.
function locationAppliesTo(loc, storeId){
  if(loc.active === false) return false;
  if(storeId === undefined) return true;
  const sid = normalizeStoreId(storeId);
  if(loc.store_id) return loc.store_id === sid;
  return !(sid && (loc.hidden_for || []).includes(sid));
}
function activeStockLocations(storeId){
  return sortedStockLocations().filter(loc=>locationAppliesTo(loc, storeId));
}

// field is 'opening' (default) or 'closing'
function locationMap(row, field){
  const map = field === 'closing' ? row.closing_location_qty : row.location_qty;
  return map && typeof map === 'object' ? map : {};
}
function locationQty(row, locationId, field){
  return Number(locationMap(row, field)[locationId] || 0);
}
// Total across the locations that apply to the row's outlet.
function stockTotal(row, field){
  const locations = activeStockLocations(row.store_id || null).filter(locationCounts);
  return locations.reduce((sum,loc)=>sum + locationQty(row, loc.id, field), 0);
}
// Same total, for a bare { locationId: qty } map (e.g. just read from a form).
function locationMapTotal(map, storeId){
  return activeStockLocations(storeId === undefined ? null : storeId).filter(locationCounts).reduce((sum,loc)=>sum + Number((map||{})[loc.id] || 0), 0);
}
// Keeps only the entries for locations that apply to the outlet.
function locationMapForStore(map, storeId){
  const out = {};
  activeStockLocations(storeId === undefined ? null : storeId).forEach(loc=>{ out[loc.id] = Number((map||{})[loc.id] || 0); });
  return out;
}
// [{ loc, total }] — one entry per location of the outlet, summed over its rows.
function stockLocationTotals(rows, field, storeId){
  return activeStockLocations(storeId === undefined ? null : storeId).map(loc=>({
    loc,
    total: rows.reduce((sum,row)=>sum + locationQty(row, loc.id, field), 0)
  }));
}
function isLowClosing(row){
  return stockTotal(row,'closing') < LOW_STOCK_THRESHOLD;
}

// Reads the per-location inputs of a form (ids "<prefix><locationId>") into a
// map. Values for locations not shown in the form are kept as they were.
function readLocationInputs(prefix, existingMap, storeId){
  const map = { ...(existingMap || {}) };
  activeStockLocations(storeId).forEach(loc=>{
    const input = document.getElementById(prefix + loc.id);
    map[loc.id] = input ? Math.max(0, parseFloat(input.value) || 0) : Number(map[loc.id] || 0);
  });
  return map;
}
function sumLocationInputs(prefix, storeId){
  return activeStockLocations(storeId).filter(locationCounts).reduce((sum,loc)=>{
    const input = document.getElementById(prefix + loc.id);
    return sum + (input ? (parseFloat(input.value) || 0) : 0);
  }, 0);
}
function renderLocationInputs(prefix, map, oninput, storeId){
  const locations = activeStockLocations(storeId);
  return `<div class="field-row field-row-wrap">${locations.map(loc=>`
    <div class="field"><label for="${prefix}${loc.id}">${esc(loc.name)}${locationCounts(loc)?'':' <small>(not in total)</small>'}</label><input id="${prefix}${loc.id}" type="number" min="0" step="1" value="${map ? Number(map[loc.id]||0) : ''}" placeholder="0" oninput="${oninput}"></div>
  `).join('')}</div>`;
}

// Boxes like the wireframe: a small label above a big number, one per location.
function renderStockBoxes(totals){
  if(!totals.length) return '<div class="stock-location-empty">No stock locations yet</div>';
  return `<div class="stock-boxes">${totals.map(item=>`
    <span class="stock-box ${locationCounts(item.loc)?'':'excluded'}" ${locationCounts(item.loc)?'':'title="Not counted in the total"'}><small title="${esc(item.loc.name)}">${esc(item.loc.name)}</small><b>${item.total}</b></span>
  `).join('')}</div>`;
}

// ---------------- Locations manager (admin app only) ----------------
// Pick an outlet (or "All outlets") and edit the locations for it:
//  • All outlets  — the shared locations every outlet starts with
//  • one outlet   — add locations just for it, and hide shared ones here
let locationsScope = '__all__';

function locationsScopeStoreId(){ return locationsScope === '__all__' ? null : locationsScope; }

// Locations editable in the current scope, in display order.
function editableLocationsInScope(){
  const sid = locationsScopeStoreId();
  return sortedStockLocations().filter(loc=>loc.active !== false && (sid ? loc.store_id === sid : !loc.store_id));
}

function renderLocationsManagerHtml(){
  const sid = locationsScopeStoreId();
  const editable = editableLocationsInScope();
  const shared = sid ? activeStockLocations(sid).filter(loc=>!loc.store_id) : [];
  const hidden = sid ? sortedStockLocations().filter(loc=>loc.active !== false && !loc.store_id && (loc.hidden_for||[]).includes(sid)) : [];
  const outletName = sid ? ((stores.find(s=>s.id===sid)||{}).name || 'this outlet') : 'all outlets';
  return `
    <div class="stock-summary-head"><div class="modal-title">Stock locations</div><button type="button" class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="field">
      <label for="locations-scope">Outlet</label>
      <select id="locations-scope" onchange="setLocationsScope(this.value)">
        <option value="__all__" ${!sid?'selected':''}>All outlets (shared)</option>
        ${stores.map(s=>`<option value="${s.id}" ${sid===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
      </select>
      <div class="field-hint">${sid
        ? `Locations for ${esc(outletName)}: the shared ones plus any you add here. Past records keep their numbers.`
        : 'Shared locations appear on every outlet unless hidden for it. Removing one hides it everywhere.'}</div>
    </div>
    <div class="location-list">
      ${shared.map(loc=>`
        <div class="location-row">
          <div class="location-shared"><span>${esc(loc.name)}</span><small>All outlets</small></div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="hideSharedLocation('${loc.id}')">Hide here</button>
        </div>`).join('')}
      ${editable.map((loc,index)=>`
        <div class="location-row">
          <input type="text" value="${esc(loc.name)}" maxlength="40" aria-label="Location name" onchange="renameStockLocation('${loc.id}',this)" onkeydown="if(event.key==='Enter'){this.blur()}">
          <label class="location-count" title="Add this location's stock to the opening/closing totals"><input type="checkbox" ${locationCounts(loc)?'checked':''} onchange="setLocationCounts('${loc.id}',this.checked)"><span>Total</span></label>
          <button type="button" class="icon-btn" onclick="moveStockLocation('${loc.id}',-1)" aria-label="Move up" ${index===0?'disabled':''}>↑</button>
          <button type="button" class="icon-btn" onclick="moveStockLocation('${loc.id}',1)" aria-label="Move down" ${index===editable.length-1?'disabled':''}>↓</button>
          <button type="button" class="icon-btn danger" onclick="removeStockLocation('${loc.id}')" aria-label="Remove ${esc(loc.name)}">✕</button>
        </div>`).join('')}
      ${!shared.length && !editable.length ? '<div class="stock-location-empty">No locations here yet — add one below.</div>' : ''}
    </div>
    <div class="location-row location-add">
      <input id="new-location-name" type="text" maxlength="40" placeholder="${sid?`New location for ${esc(outletName)}`:'New shared location, e.g. Car Boot'}" aria-label="New location name" onkeydown="if(event.key==='Enter'){addStockLocation()}">
      <button type="button" class="btn btn-primary" onclick="addStockLocation()">Add</button>
    </div>
    ${hidden.length ? `<div class="location-hidden"><div class="field-hint">Hidden for ${esc(outletName)}</div>${hidden.map(loc=>`
      <div class="location-row"><div class="location-shared"><span>${esc(loc.name)}</span></div><button type="button" class="btn btn-ghost btn-sm" onclick="restoreSharedLocation('${loc.id}')">Show again</button></div>`).join('')}</div>` : ''}
  `;
}

function openStockLocationsManager(){
  if(typeof canManageStockLocations === 'function' && !canManageStockLocations()) return;
  locationsScope = '__all__';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet" id="locations-sheet">${renderLocationsManagerHtml()}</div>`;
  showModal(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

function setLocationsScope(value){
  locationsScope = value;
  const sheet = document.getElementById('locations-sheet');
  if(sheet) sheet.innerHTML = renderLocationsManagerHtml();
}

async function reloadStockLocations(keepFocusId){
  stockLocations = await DB.getStockLocations();
  const sheet = document.getElementById('locations-sheet');
  if(sheet) sheet.innerHTML = renderLocationsManagerHtml();
  if(keepFocusId){ const el = document.getElementById(keepFocusId); if(el) el.focus(); }
  render();
}

// Every location visible in the current scope (what the user sees listed).
function scopeLocations(){
  const sid = locationsScopeStoreId();
  return sid ? activeStockLocations(sid) : sortedStockLocations().filter(loc=>loc.active !== false && !loc.store_id);
}

function locationNameTaken(name, exceptId){
  const wanted = name.trim().toLowerCase();
  return scopeLocations().some(loc=>loc.id !== exceptId && loc.name.trim().toLowerCase() === wanted);
}

async function addStockLocation(){
  const input = document.getElementById('new-location-name');
  const name = (input ? input.value : '').trim();
  if(!name){ showToast('Type a name for the new location'); return; }
  if(locationNameTaken(name)){ showToast('That location already exists here'); return; }
  try{
    const nextOrder = stockLocations.reduce((max,loc)=>Math.max(max, Number(loc.sort_order)||0), 0) + 1;
    await DB.addStockLocation({ name, sort_order: nextOrder, active: true, store_id: locationsScopeStoreId() });
    await reloadStockLocations('new-location-name');
    showToast(`Added ${name}`);
  }catch(e){
    console.error(e);
    showToast('Could not add — ' + (e.message || 'check your connection'));
  }
}

async function renameStockLocation(id, input){
  const loc = stockLocations.find(l=>l.id===id);
  const name = input.value.trim();
  if(!loc) return;
  if(!name){ input.value = loc.name; showToast('A location needs a name'); return; }
  if(name === loc.name) return;
  if(locationNameTaken(name, id)){ input.value = loc.name; showToast('That location already exists here'); return; }
  try{
    await DB.updateStockLocation(id, { name });
    await reloadStockLocations();
    showToast('Location renamed');
  }catch(e){
    console.error(e);
    input.value = loc.name;
    showToast('Could not rename — ' + (e.message || 'check your connection'));
  }
}

async function setLocationCounts(id, counts){
  try{
    await DB.updateStockLocation(id, { counts_in_total: !!counts });
    await reloadStockLocations();
    showToast(counts ? 'Counts in the total' : 'No longer counts in the total');
  }catch(e){
    console.error(e);
    showToast('Could not change — ' + (e.message || 'check your connection'));
    await reloadStockLocations().catch(()=>{});
  }
}

async function moveStockLocation(id, direction){
  const list = editableLocationsInScope();
  const index = list.findIndex(l=>l.id===id);
  const other = list[index + direction];
  if(index === -1 || !other) return;
  const a = list[index];
  try{
    // Swap the two sort_order values (nudge one of them if they happen to tie).
    const aOrder = Number(a.sort_order)||0;
    let bOrder = Number(other.sort_order)||0;
    if(aOrder === bOrder) bOrder += direction > 0 ? 1 : -1;
    await Promise.all([
      DB.updateStockLocation(a.id, { sort_order: bOrder }),
      DB.updateStockLocation(other.id, { sort_order: aOrder })
    ]);
    await reloadStockLocations();
  }catch(e){
    console.error(e);
    showToast('Could not reorder — ' + (e.message || 'check your connection'));
  }
}

async function removeStockLocation(id){
  const loc = stockLocations.find(l=>l.id===id);
  if(!loc) return;
  if(scopeLocations().length <= 1){ showToast('Keep at least one location'); return; }
  const where = loc.store_id ? 'this outlet' : 'every outlet';
  if(!confirm(`Remove "${loc.name}"? It disappears from the stock cards and forms of ${where}. Past records keep their numbers.`)) return;
  try{
    await DB.updateStockLocation(id, { active: false });
    await reloadStockLocations();
    showToast(`${loc.name} removed`);
  }catch(e){
    console.error(e);
    showToast('Could not remove — ' + (e.message || 'check your connection'));
  }
}

// Hide / restore a SHARED location for just the outlet being edited.
async function hideSharedLocation(id){
  const loc = stockLocations.find(l=>l.id===id);
  const sid = locationsScopeStoreId();
  if(!loc || !sid) return;
  if(activeStockLocations(sid).length <= 1){ showToast('Keep at least one location'); return; }
  try{
    await DB.updateStockLocation(id, { hidden_for: [...new Set([...(loc.hidden_for||[]), sid])] });
    await reloadStockLocations();
    showToast(`${loc.name} hidden for this outlet`);
  }catch(e){
    console.error(e);
    showToast('Could not hide — ' + (e.message || 'check your connection'));
  }
}
async function restoreSharedLocation(id){
  const loc = stockLocations.find(l=>l.id===id);
  const sid = locationsScopeStoreId();
  if(!loc || !sid) return;
  try{
    await DB.updateStockLocation(id, { hidden_for: (loc.hidden_for||[]).filter(x=>x!==sid) });
    await reloadStockLocations();
  }catch(e){
    console.error(e);
    showToast('Could not restore — ' + (e.message || 'check your connection'));
  }
}
