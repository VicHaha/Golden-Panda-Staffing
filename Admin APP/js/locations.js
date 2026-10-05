// ============================================================
// Stock locations — the user-editable list behind the location boxes in
// Stock Management (Store Room, Home Shelf, Standee, Warehouse by default).
//
// Quantities live on each sales_reports row as two jsonb maps keyed by
// location id: location_qty (opening) and closing_location_qty (closing).
// Removing a location only hides it (active=false) so old rows keep their
// numbers. This file is identical in the admin and promoter apps; only the
// admin app shows the "Locations" manager (see canManageStockLocations()
// in each app's app.js).
// ============================================================

// A SKU is "low" when its closing stock (all locations added up) is below this.
const LOW_STOCK_THRESHOLD = 10;

let stockLocations = [];

function sortedStockLocations(){
  return [...stockLocations].sort((a,b)=>(a.sort_order-b.sort_order) || String(a.created_at||'').localeCompare(String(b.created_at||'')));
}
function activeStockLocations(){
  return sortedStockLocations().filter(loc=>loc.active !== false);
}

// field is 'opening' (default) or 'closing'
function locationMap(row, field){
  const map = field === 'closing' ? row.closing_location_qty : row.location_qty;
  return map && typeof map === 'object' ? map : {};
}
function locationQty(row, locationId, field){
  return Number(locationMap(row, field)[locationId] || 0);
}
// Total across the active locations only.
function stockTotal(row, field){
  return activeStockLocations().reduce((sum,loc)=>sum + locationQty(row, loc.id, field), 0);
}
// Same total, for a bare { locationId: qty } map (e.g. just read from a form).
function locationMapTotal(map){
  return activeStockLocations().reduce((sum,loc)=>sum + Number((map||{})[loc.id] || 0), 0);
}
// [{ loc, total }] — one entry per active location, summed over rows.
function stockLocationTotals(rows, field){
  return activeStockLocations().map(loc=>({
    loc,
    total: rows.reduce((sum,row)=>sum + locationQty(row, loc.id, field), 0)
  }));
}
function isLowClosing(row){
  return stockTotal(row,'closing') < LOW_STOCK_THRESHOLD;
}

// Reads the per-location inputs of a form (ids "<prefix><locationId>") into a
// map. Values for locations that are no longer active are kept as they were.
function readLocationInputs(prefix, existingMap){
  const map = { ...(existingMap || {}) };
  activeStockLocations().forEach(loc=>{
    const input = document.getElementById(prefix + loc.id);
    map[loc.id] = input ? Math.max(0, parseFloat(input.value) || 0) : Number(map[loc.id] || 0);
  });
  return map;
}
function sumLocationInputs(prefix){
  return activeStockLocations().reduce((sum,loc)=>{
    const input = document.getElementById(prefix + loc.id);
    return sum + (input ? (parseFloat(input.value) || 0) : 0);
  }, 0);
}
function renderLocationInputs(prefix, map, oninput){
  const locations = activeStockLocations();
  return `<div class="field-row field-row-wrap">${locations.map(loc=>`
    <div class="field"><label for="${prefix}${loc.id}">${esc(loc.name)}</label><input id="${prefix}${loc.id}" type="number" min="0" step="1" value="${map ? Number(map[loc.id]||0) : ''}" placeholder="0" oninput="${oninput}"></div>
  `).join('')}</div>`;
}

// Boxes like the wireframe: a small label above a big number, one per location.
function renderStockBoxes(totals){
  if(!totals.length) return '<div class="stock-location-empty">No stock locations yet</div>';
  return `<div class="stock-boxes">${totals.map(item=>`
    <span class="stock-box"><small title="${esc(item.loc.name)}">${esc(item.loc.name)}</small><b>${item.total}</b></span>
  `).join('')}</div>`;
}

// ---------------- Locations manager (admin app only) ----------------
function renderLocationsManagerHtml(){
  const locations = activeStockLocations();
  return `
    <div class="stock-summary-head"><div class="modal-title">Stock locations</div><button type="button" class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="field-hint" style="margin:-6px 0 12px;">These are the boxes shown on every stock card and form, in both apps. Removing one hides it — past records keep their numbers.</div>
    <div class="location-list">
      ${locations.map((loc,index)=>`
        <div class="location-row">
          <input type="text" value="${esc(loc.name)}" maxlength="40" aria-label="Location name" onchange="renameStockLocation('${loc.id}',this)" onkeydown="if(event.key==='Enter'){this.blur()}">
          <button type="button" class="icon-btn" onclick="moveStockLocation('${loc.id}',-1)" aria-label="Move up" ${index===0?'disabled':''}>↑</button>
          <button type="button" class="icon-btn" onclick="moveStockLocation('${loc.id}',1)" aria-label="Move down" ${index===locations.length-1?'disabled':''}>↓</button>
          <button type="button" class="icon-btn danger" onclick="removeStockLocation('${loc.id}')" aria-label="Remove ${esc(loc.name)}">✕</button>
        </div>`).join('')}
    </div>
    <div class="location-row location-add">
      <input id="new-location-name" type="text" maxlength="40" placeholder="New location, e.g. Car Boot" aria-label="New location name" onkeydown="if(event.key==='Enter'){addStockLocation()}">
      <button type="button" class="btn btn-primary" onclick="addStockLocation()">Add</button>
    </div>
  `;
}

function openStockLocationsManager(){
  if(typeof canManageStockLocations === 'function' && !canManageStockLocations()) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet" id="locations-sheet">${renderLocationsManagerHtml()}</div>`;
  showModal(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

async function reloadStockLocations(keepFocusId){
  stockLocations = await DB.getStockLocations();
  const sheet = document.getElementById('locations-sheet');
  if(sheet) sheet.innerHTML = renderLocationsManagerHtml();
  if(keepFocusId){ const el = document.getElementById(keepFocusId); if(el) el.focus(); }
  render();
}

function locationNameTaken(name, exceptId){
  const wanted = name.trim().toLowerCase();
  return activeStockLocations().some(loc=>loc.id !== exceptId && loc.name.trim().toLowerCase() === wanted);
}

async function addStockLocation(){
  const input = document.getElementById('new-location-name');
  const name = (input ? input.value : '').trim();
  if(!name){ showToast('Type a name for the new location'); return; }
  if(locationNameTaken(name)){ showToast('That location already exists'); return; }
  try{
    const nextOrder = stockLocations.reduce((max,loc)=>Math.max(max, Number(loc.sort_order)||0), 0) + 1;
    await DB.addStockLocation({ name, sort_order: nextOrder, active: true });
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
  if(locationNameTaken(name, id)){ input.value = loc.name; showToast('That location already exists'); return; }
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

async function moveStockLocation(id, direction){
  const list = activeStockLocations();
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
  if(activeStockLocations().length <= 1){ showToast('Keep at least one location'); return; }
  if(!confirm(`Remove "${loc.name}"? It disappears from all stock cards and forms. Past records keep their numbers.`)) return;
  try{
    await DB.updateStockLocation(id, { active: false });
    await reloadStockLocations();
    showToast(`${loc.name} removed`);
  }catch(e){
    console.error(e);
    showToast('Could not remove — ' + (e.message || 'check your connection'));
  }
}
