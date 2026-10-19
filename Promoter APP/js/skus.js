// ============================================================
// SKUs — two sheets.
//
// 1. SKU Record (openSkuRecord): the master list of every SKU. Add, edit and
//    delete SKUs here, each with Product name, Variation and a photo.
//    (A photo belongs to the product, so its variations share it.)
// 2. "+" in Stock Management (openSkuListSheet): just tick SKUs from that list
//    and add them to an outlet in one go — a brand-new outlet, or an outlet
//    that gained new SKUs. New rows take that outlet's own last closing count
//    when it has one, otherwise 0.
//
// This file is identical in the admin and promoter apps.
// ============================================================

let skuCatalog = [];                 // rows of the `skus` table
let skuSheet = { storeId:null, date:null, ticked:new Set() };
let skuRec = { form:false, editKey:null, busy:null };

function skuKey(name){ return canonicalSkuName(name).trim().toLowerCase(); }

function sortedSkus(){
  return [...skuCatalog].sort((a,b)=>(a.sort_order-b.sort_order) || a.product_name.localeCompare(b.product_name));
}

// First run only: fills an empty list with every SKU already in use (the
// standard list + anything in past records), so nothing added before is lost.
async function ensureSkuCatalog(){
  if(skuCatalog.length) return;
  const known = new Set();
  const wanted = new Map();
  PRODUCT_SUGGESTIONS.forEach((name,index)=>{
    const key = skuKey(name);
    if(!wanted.has(key)) wanted.set(key, { sku_key:key, product_name:canonicalSkuName(name), is_free_item:isGiveaway(name), sort_order:index });
  });
  salesReports.forEach(row=>{
    if(!row.product_name) return;
    const key = skuKey(row.product_name);
    if(!wanted.has(key)) wanted.set(key, { sku_key:key, product_name:canonicalSkuName(row.product_name), is_free_item:isFreeItem(row), sort_order:100 });
  });
  const missing = [...wanted.values()].filter(s=>!known.has(s.sku_key));
  if(!missing.length) return;
  await DB.upsertSkus(missing);
  skuCatalog = await DB.getSkus();
}

function skuAttr(key){ return esc(key).replace(/'/g,'&#39;'); }

// =================== 1. SKU Record ===================
function skuRecordHtml(){
  const head = (title, back) => `<div class="stock-summary-head"><div class="modal-title">${title}</div><button type="button" class="modal-close-btn" onclick="${back?'cancelSkuForm()':'closeModal()'}" aria-label="${back?'Back':'Close'}">${back?'‹':'✕'}</button></div>`;
  if(skuRec.form){
    const sku = skuRec.editKey ? skuCatalog.find(s=>s.sku_key===skuRec.editKey) : null;
    const parsed = sku ? parseProductName(sku.product_name) : { base:'', variation:'' };
    const free = !!(sku && sku.is_free_item);
    const url = sku ? productPhotoFor(sku.product_name) : null;
    return head(sku ? 'Edit SKU' : 'Add SKU', true) + `
      <div class="field"><label for="sku-f-product">Product name</label><input id="sku-f-product" value="${esc(free?(sku?sku.product_name:''):parsed.base)}" placeholder="e.g. 1L Bio Dishwash" autocomplete="off"></div>
      <div class="field" id="sku-f-variation-field" style="${free?'display:none;':''}"><label for="sku-f-variation">Variation (optional)</label><input id="sku-f-variation" value="${esc(free?'':parsed.variation)}" placeholder="e.g. Ginger" autocomplete="off"></div>
      <div class="field"><label class="checkbox-row"><input type="checkbox" id="sku-f-free" ${free?'checked':''} onchange="document.getElementById('sku-f-variation-field').style.display=this.checked?'none':''"> Free item (given away, not sold)</label></div>
      <div class="field"><label>Photo of the SKU</label>
        <div class="pp-row" style="border:0;padding:0;">
          <span class="pp-thumb">${url?`<img src="${esc(url)}" alt="">`:''}</span>
          <label class="btn btn-ghost btn-sm">${url?'Change photo':'Add photo'}<input type="file" id="sku-f-photo" accept="image/*" hidden onchange="document.getElementById('sku-f-photo-name').textContent=this.files[0]?this.files[0].name:''"></label>
          ${url?'<button type="button" class="btn btn-ghost btn-sm" onclick="removeSkuPhoto()">Remove</button>':''}
        </div>
        <div class="field-hint" id="sku-f-photo-name"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="cancelSkuForm()">Cancel</button>
        <button type="button" class="btn btn-primary" id="sku-f-save" onclick="saveSkuForm()">Save</button>
      </div>`;
  }
  const rows = sortedSkus().map(sku=>{
    const url = productPhotoFor(sku.product_name);
    const key = skuAttr(sku.sku_key);
    return `<div class="pp-row">
      <span class="pp-thumb">${url?`<img src="${esc(url)}" alt="">`:''}</span>
      <span class="pp-name">${esc(sku.product_name)}${sku.is_free_item?' <em class="sku-free-tag">free</em>':''}</span>
      ${skuRec.busy===sku.sku_key ? '<span class="pp-busy">Uploading…</span>' : `
        <label class="icon-btn" aria-label="${url?'Change':'Add'} photo of ${esc(sku.product_name)}" title="${url?'Change':'Add'} photo">📷<input type="file" accept="image/*" hidden onchange="uploadSkuPhoto(this,'${key}')"></label>
        <button type="button" class="icon-btn" onclick="openSkuForm('${key}')" aria-label="Edit ${esc(sku.product_name)}">✎</button>
        <button type="button" class="icon-btn danger" onclick="deleteSku('${key}')" aria-label="Delete ${esc(sku.product_name)}">✕</button>`}
    </div>`;
  }).join('');
  return head('SKU Record', false) + `
    <button type="button" class="btn btn-primary btn-block" style="margin-bottom:10px;" onclick="openSkuForm()">Add SKU</button>
    ${rows || '<div class="sku-empty">No SKUs yet — tap Add SKU.</div>'}`;
}

function refreshSkuRecord(){
  const sheet = document.getElementById('sku-record-sheet');
  if(sheet) sheet.innerHTML = skuRecordHtml();
}

function openSkuRecord(){
  skuRec = { form:false, editKey:null, busy:null };
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet" id="sku-record-sheet">${skuRecordHtml()}</div>`;
  showModal(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

function openSkuForm(key){ skuRec.form = true; skuRec.editKey = key || null; refreshSkuRecord(); }
function cancelSkuForm(){ skuRec.form = false; skuRec.editKey = null; refreshSkuRecord(); }

async function saveSkuPhotoFile(sku_name, file){
  const family = productFamilyName(sku_name);
  const compressed = await compressImageFile(file);
  const url = await uploadPhotoToCloudinary(compressed);
  await DB.setProductPhoto(family, url);
  productPhotos = await DB.getProductPhotos();
}

async function uploadSkuPhoto(input, key){
  const file = input.files && input.files[0];
  const sku = skuCatalog.find(s=>s.sku_key===key);
  if(!file || !sku) return;
  skuRec.busy = key; refreshSkuRecord();
  try{ await saveSkuPhotoFile(sku.product_name, file); showToast('Photo saved'); }
  catch(e){ console.error(e); showToast('Could not save the photo — ' + (e.message || 'check your connection')); }
  skuRec.busy = null; refreshSkuRecord(); render();
}

async function removeSkuPhoto(){
  const sku = skuCatalog.find(s=>s.sku_key===skuRec.editKey);
  if(!sku) return;
  try{
    await DB.deleteProductPhoto(productFamilyName(sku.product_name));
    productPhotos = await DB.getProductPhotos();
    showToast('Photo removed');
  }catch(e){ console.error(e); showToast('Could not remove — ' + (e.message || 'check your connection')); }
  refreshSkuRecord(); render();
}

// Add (no editKey) or edit. Renaming changes the SKU in every record that used
// it, past days included.
async function saveSkuForm(){
  const product = document.getElementById('sku-f-product').value.trim();
  const variation = document.getElementById('sku-f-variation').value.trim();
  const free = document.getElementById('sku-f-free').checked;
  const fileInput = document.getElementById('sku-f-photo');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if(!product){ showToast('Type the product name'); return; }
  const name = canonicalSkuName(free ? product : composeProductName(product, variation));
  const key = skuKey(name);
  const oldKey = skuRec.editKey;
  const sku = oldKey ? skuCatalog.find(s=>s.sku_key===oldKey) : null;
  if((!sku || key !== oldKey) && skuCatalog.some(s=>s.sku_key===key)){ showToast('That SKU is already in the list'); return; }
  const changed = sku && (key !== oldKey || free !== !!sku.is_free_item);
  const raws = sku ? [...new Set(salesReports.filter(r=>skuKey(r.product_name)===oldKey).map(r=>r.product_name))] : [];
  if(changed && raws.length && !confirm(`Change "${sku.product_name}" to "${name}"?\n\nThis updates every record that uses it, past days included.`)) return;
  const button = document.getElementById('sku-f-save');
  if(button){ button.disabled = true; button.textContent = 'Saving…'; }
  try{
    if(sku){
      await DB.updateSku(oldKey, { sku_key:key, product_name:name, is_free_item:free });
      if(changed && raws.length) await DB.renameSkuRows(raws, name, free);
    }else{
      await DB.upsertSkus([{ sku_key:key, product_name:name, is_free_item:free, sort_order:100 }]);
    }
    skuCatalog = await DB.getSkus();
    if(file) await saveSkuPhotoFile(name, file);
    skuRec.form = false; skuRec.editKey = null;
    if(changed) await refreshData();
    render();
    refreshSkuRecord();
    showToast(sku ? 'SKU updated' : `${name} added`);
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    if(button){ button.disabled = false; button.textContent = 'Save'; }
  }
}

// Removes the SKU from the list only; records already made keep it.
async function deleteSku(key){
  const sku = skuCatalog.find(s=>s.sku_key===key);
  if(!sku) return;
  if(!confirm(`Delete "${sku.product_name}" from the SKU Record?\n\nExisting records keep it. It just won't be offered when adding SKUs to an outlet.`)) return;
  try{
    await DB.deleteSku(key);
    skuCatalog = await DB.getSkus();
    skuSheet.ticked.delete(key);
    refreshSkuRecord();
    showToast('SKU deleted');
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}

// =================== 2. "+" — tick SKUs onto an outlet ===================
// Canonical names of the SKUs an outlet already has on a day.
function skuPresentNames(storeId, date){
  return new Set(salesReports.filter(r=>(r.store_id||null)===(storeId||null) && r.work_date===date).map(r=>skuKey(r.product_name)));
}

// Outlets the user can add SKUs to: the admin app offers every outlet; the
// promoter app only the outlets they are scheduled at today.
function skuOutletChoices(){
  if(!isPromoterApp()) return stores;
  const allowed = scheduledStoreIdsForDate(todayStr());
  return stores.filter(s=>allowed.has(s.id));
}

function skuSheetDate(){
  const input = document.getElementById('sku-date');
  return canEditPastSales() && input && input.value ? input.value : (skuSheet.date || todayStr());
}

function skuApplyLabel(){
  const present = skuPresentNames(skuSheet.storeId, skuSheetDate());
  const count = sortedSkus().filter(s=>!present.has(s.sku_key) && skuSheet.ticked.has(s.sku_key)).length;
  const outletName = (stores.find(s=>s.id===skuSheet.storeId)||{}).name || 'outlet';
  return { count, text:`Add ${count||''} ticked SKU${count===1?'':'s'} to ${outletName}` };
}

function skuSheetHtml(){
  const head = `<div class="stock-summary-head"><div class="modal-title">Add SKUs</div><button type="button" class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button></div>`;
  const choices = skuOutletChoices();
  if(!choices.length) return head + `<div class="sku-empty">Today is not a working date.</div>`;
  if(!skuSheet.storeId || !choices.some(s=>s.id===skuSheet.storeId)) skuSheet.storeId = choices[0].id;
  const date = skuSheetDate();
  const present = skuPresentNames(skuSheet.storeId, date);
  const list = sortedSkus().map(sku=>{
    const isPresent = present.has(sku.sku_key);
    const checked = isPresent || skuSheet.ticked.has(sku.sku_key);
    const url = productPhotoFor(sku.product_name);
    return `<div class="sku-row ${isPresent?'is-present':''}">
      <label class="sku-check">
        <input type="checkbox" ${checked?'checked':''} ${isPresent?'disabled':''} onchange="toggleSkuTick('${skuAttr(sku.sku_key)}',this.checked)">
        <span class="pp-thumb sku-mini">${url?`<img src="${esc(url)}" alt="">`:''}</span>
        <span class="sku-name">${esc(sku.product_name)}${sku.is_free_item?' <em>free</em>':''}</span>
      </label>
    </div>`;
  }).join('');
  const apply = skuApplyLabel();
  return head + `
    <div class="sku-pick">
      <div class="field"><label for="sku-outlet">Outlet</label>
        <select id="sku-outlet" onchange="onSkuOutletChange()">${choices.map(s=>`<option value="${s.id}" ${s.id===skuSheet.storeId?'selected':''}>${esc(s.name)}</option>`).join('')}</select>
      </div>
      ${canEditPastSales() ? `<div class="field"><label for="sku-date">Date</label><input id="sku-date" type="date" value="${date}" onchange="onSkuOutletChange()"></div>` : ''}
    </div>
    <div class="sku-tools">
      <button type="button" class="btn btn-ghost btn-sm" onclick="skuTickAll()">Select all</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="skuTickNone()">Clear</button>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="closeModal();openSkuRecord()">Manage SKUs</button>
    </div>
    <div class="sku-list">${list || '<div class="sku-empty">No SKUs yet — use Manage SKUs to add some.</div>'}</div>
    <div class="modal-actions" style="margin-top:12px;">
      <button type="button" class="btn btn-primary" id="sku-apply-btn" onclick="addTickedSkusToOutlet()" ${apply.count?'':'disabled'}>${esc(apply.text)}</button>
    </div>`;
}

function refreshSkuSheet(){
  const sheet = document.getElementById('sku-sheet');
  if(sheet) sheet.innerHTML = skuSheetHtml();
}

// storeId: open pre-selected on that outlet (an outlet with no SKUs yet starts
// with every SKU ticked, so one tap sets it up).
function openSkuListSheet(storeId){
  skuSheet = { storeId: storeId || scheduledStoreIdForDate(todayStr()) || null, date: todayStr(), ticked: new Set() };
  if(!skuOutletChoices().length && !canEditPastSales()){ showToast('Today is not a working date — nothing to set up'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet" id="sku-sheet"></div>`;
  showModal(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  if(skuSheet.storeId && !skuPresentNames(skuSheet.storeId, todayStr()).size) sortedSkus().forEach(s=>skuSheet.ticked.add(s.sku_key));
  refreshSkuSheet();
}

function onSkuOutletChange(){
  const select = document.getElementById('sku-outlet');
  skuSheet.storeId = select ? select.value : skuSheet.storeId;
  skuSheet.date = skuSheetDate();
  skuSheet.ticked = new Set();
  if(!skuPresentNames(skuSheet.storeId, skuSheet.date).size) sortedSkus().forEach(s=>skuSheet.ticked.add(s.sku_key));
  refreshSkuSheet();
}

function toggleSkuTick(key, checked){
  if(checked) skuSheet.ticked.add(key); else skuSheet.ticked.delete(key);
  const button = document.getElementById('sku-apply-btn');
  if(button){
    const apply = skuApplyLabel();
    button.disabled = !apply.count;
    button.textContent = apply.text;
  }
}
function skuTickAll(){ sortedSkus().forEach(s=>skuSheet.ticked.add(s.sku_key)); refreshSkuSheet(); }
function skuTickNone(){ skuSheet.ticked = new Set(); refreshSkuSheet(); }

// One insert for every ticked SKU the outlet doesn't have yet.
async function addTickedSkusToOutlet(){
  const storeId = skuSheet.storeId, date = skuSheetDate();
  if(!storeId){ showToast('Choose the outlet'); return; }
  const present = skuPresentNames(storeId, date);
  const chosen = sortedSkus().filter(s=>skuSheet.ticked.has(s.sku_key) && !present.has(s.sku_key));
  if(!chosen.length){ showToast('Tick the SKUs to add'); return; }
  const button = document.getElementById('sku-apply-btn');
  if(button){ button.disabled = true; button.textContent = 'Adding…'; }
  try{
    const entries = chosen.map(sku=>{
      const prior = storeRows(storeId).filter(r=>r.work_date < date && skuKey(r.product_name) === sku.sku_key).sort((a,b)=>b.work_date.localeCompare(a.work_date))[0];
      const carried = prior ? locationMapForStore(locationMap(prior,'closing'), storeId) : {};
      const total = locationMapTotal(carried, storeId);
      return {
        work_date: date, store_id: storeId, ...stockRecordAttribution(),
        product_name: sku.product_name, opening_qty: total, sales_qty: 0, closing_qty: total,
        remarks: null, photo_url: null, is_free_item: !!sku.is_free_item,
        location_qty: { ...carried }, closing_location_qty: { ...carried }
      };
    });
    await DB.addSalesReports(entries);
    await refreshData();
    skuSheet.ticked = new Set();
    render();
    refreshSkuSheet();
    const outletName = (stores.find(s=>s.id===storeId)||{}).name || 'the outlet';
    showToast(`${entries.length} SKU${entries.length>1?'s':''} added to ${outletName}`);
  }catch(e){
    console.error(e);
    showToast('Could not add — ' + (e.message || 'check your connection'));
    refreshSkuSheet();
  }
}
