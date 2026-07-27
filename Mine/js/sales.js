// ============================================================
// Sales & Stock — per-product opening/sales/closing counts,
// grouped by working date, expand/collapse per date.
// As the office/admin app, editing is unrestricted by date — the
// promoter-facing app is the one limited to same-day edits.
// ============================================================

let salesExpandedDates = new Set(); // which date groups are currently expanded

// Suggested products — shown as autocomplete, but the field stays free
// text so new products can always be typed in and added on the fly.
const PRODUCT_SUGGESTIONS = [
  'Gift Set',
  'Bio Dishwash 1L (Bidara)',
  'Bio Dishwash 1L (Ginger)',
  'Bio Dishwash 1L (Melon)',
  'Refill Bio Dishwash 480ml (Bidara)',
  'Refill Bio Dishwash 480ml (Ginger)',
  'Refill Bio Dishwash 480ml (Melon)'
];

// Combines the fixed suggestions above with any product names already
// used in past reports, so custom products you've added before show up
// as suggestions too — the list grows on its own.
function getProductSuggestions(){
  const used = salesReports.map(r => r.product_name).filter(Boolean);
  return [...new Set([...PRODUCT_SUGGESTIONS, ...used])].sort();
}

function todayStr(){
  return new Date().toISOString().slice(0,10);
}

// Auto-creates today's row for every known SKU that doesn't already
// have one yet, so the daily list is pre-populated. Safe to call every
// load — only inserts what's missing. Opening stock carries over from
// that product's most recent prior closing count.
async function ensureTodaysStockRows(){
  const today = todayStr();
  const todaysProducts = new Set(salesReports.filter(r=>r.work_date===today).map(r=>r.product_name));
  const missing = PRODUCT_SUGGESTIONS.filter(p => !todaysProducts.has(p));
  if(missing.length === 0) return;

  for(const product of missing){
    const priorEntries = salesReports
      .filter(r => r.product_name === product && r.work_date < today)
      .sort((a,b) => b.work_date.localeCompare(a.work_date));
    const carryOver = priorEntries.length ? Number(priorEntries[0].closing_qty||0) : 0;

    try{
      await DB.addSalesReport({
        work_date: today,
        store_id: null,
        promoter_id: null,
        product_name: product,
        opening_qty: carryOver,
        sales_qty: 0,
        closing_qty: carryOver,
        remarks: null,
        photo_url: null
      });
    }catch(e){
      console.warn('Could not auto-create row for', product, e);
    }
  }
}

function renderSales(){
  if(salesReports.length===0){
    return emptyState('📦','No sales reports yet','Tap + to log opening stock, sales, and closing stock for a roadshow date.');
  }

  // Group entries by work_date, newest date first.
  const byDate = {};
  salesReports.forEach(r=>{
    if(!byDate[r.work_date]) byDate[r.work_date] = [];
    byDate[r.work_date].push(r);
  });
  const dates = Object.keys(byDate).sort((a,b)=> b.localeCompare(a));
  const today = todayStr();

  let html = `<div class="section-title">Sales &amp; stock reports <span class="count-pill">${dates.length} date${dates.length>1?'s':''}</span></div>`;

  dates.forEach(date=>{
    const items = byDate[date];
    const expanded = salesExpandedDates.has(date);
    const totalSales = items.reduce((s,i)=>s + Number(i.sales_qty||0), 0);
    const storeNames = [...new Set(items.filter(i=>i.stores).map(i=>i.stores.name))];
    const isToday = date === today;
    html += `
      <div class="sales-group">
        <button class="sales-group-header" onclick="toggleSalesDate('${date}')">
          <div>
            <div class="sales-group-date">${formatDateLong(date)} ${isToday?'<span class="count-pill">Today</span>':''}</div>
            <div class="sales-group-sub">${items.length} product${items.length>1?'s':''}${storeNames.length?' · '+esc(storeNames.join(', ')):''} · ${totalSales} sold</div>
          </div>
          <span class="sales-group-chevron ${expanded?'open':''}">▾</span>
        </button>
        ${expanded ? `<div class="sales-group-body">${renderSalesItems(items)}</div>` : ''}
      </div>
    `;
  });

  return html;
}

function renderSalesItems(items){
  return items.map(i=>{
    const opening = Number(i.opening_qty||0), sales = Number(i.sales_qty||0), closing = Number(i.closing_qty||0);
    const expectedClosing = opening - sales;
    const variance = closing - expectedClosing;
    return `
      <div class="sales-item">
        ${i.photo_url ? `<img class="sales-item-photo" src="${esc(i.photo_url)}" alt="${esc(i.product_name)}" onclick="window.open('${esc(i.photo_url)}','_blank')">` : ''}
        <div class="sales-item-main">
          <div class="sales-item-name">${esc(i.product_name)}</div>
          <div class="sales-item-stats">
            Open <b>${opening}</b> · Sold <b>${sales}</b> · Close <b>${closing}</b>
            ${variance !== 0 ? `<span class="sales-variance ${variance<0?'short':'over'}">${variance>0?'+':''}${variance} vs expected</span>` : ''}
          </div>
          ${i.promoters ? `<div class="sales-item-remarks">Logged by ${esc(i.promoters.full_name)}</div>` : ''}
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

function toggleSalesDate(date){
  if(salesExpandedDates.has(date)) salesExpandedDates.delete(date);
  else salesExpandedDates.add(date);
  render();
}

function openSalesForm(id){
  const editing = id ? salesReports.find(r=>r.id===id) : null;
  // Suggest dates that are actually on the schedule, most recent first.
  const scheduledDates = [...new Set(jobs.map(j=>j.work_date))].sort((a,b)=>b.localeCompare(a));
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${editing ? 'Edit stock report' : 'Add stock report'}</div>
      <div class="field">
        <label>Photo (optional)</label>
        <div class="photo-picker">
          <img id="photo-preview" class="photo-preview" src="${editing&&editing.photo_url?esc(editing.photo_url):''}" style="${editing&&editing.photo_url?'':'display:none;'}">
          <div id="photo-preview-empty" class="photo-preview photo-preview-empty" style="${editing&&editing.photo_url?'display:none;':''}">📷</div>
          <div class="photo-picker-actions">
            <label class="btn btn-ghost" for="s-photo">Take / choose photo</label>
            <input type="file" id="s-photo" accept="image/*" capture="environment" style="display:none;" onchange="previewSalesPhoto(this)">
          </div>
        </div>
        <input type="hidden" id="s-photo-url" value="${editing&&editing.photo_url?esc(editing.photo_url):''}">
      </div>
      <div class="field">
        <label>Date</label>
        <input id="s-date" list="scheduled-dates" type="date" value="${editing?editing.work_date:(scheduledDates[0]||todayStr())}">
        <datalist id="scheduled-dates">${scheduledDates.map(d=>`<option value="${d}">`).join('')}</datalist>
        <div class="field-hint">Pulled from your schedule — pick a working date, or type any date.</div>
      </div>
      <div class="field">
        <label>Store (optional)</label>
        <select id="s-store">
          <option value="">— Not specified —</option>
          ${stores.map(s=>`<option value="${s.id}" ${editing&&editing.store_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Logged by (optional)</label>
        <select id="s-promoter">
          <option value="">— Not specified —</option>
          ${[...promoters].sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(p=>`<option value="${p.id}" ${editing&&editing.promoter_id===p.id?'selected':''}>${esc(p.full_name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Product name</label>
        <input id="s-product" list="product-list" value="${editing?esc(editing.product_name):''}" placeholder="e.g. Bio Dishwash 1L (Bidara)">
        <datalist id="product-list">${getProductSuggestions().map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
      </div>
      <div class="field-row">
        <div class="field"><label>Opening stock</label><input id="s-opening" type="number" min="0" step="1" value="${editing?editing.opening_qty:''}" placeholder="0"></div>
        <div class="field"><label>Sales qty</label><input id="s-sales" type="number" min="0" step="1" value="${editing?editing.sales_qty:''}" placeholder="0"></div>
        <div class="field"><label>Closing stock</label><input id="s-closing" type="number" min="0" step="1" value="${editing?editing.closing_qty:''}" placeholder="0"></div>
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
}

async function previewSalesPhoto(input){
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

async function saveSalesForm(id){
  const work_date = document.getElementById('s-date').value;
  const store_id = document.getElementById('s-store').value || null;
  const promoter_id = document.getElementById('s-promoter').value || null;
  const product_name = document.getElementById('s-product').value.trim();
  const opening_qty = parseFloat(document.getElementById('s-opening').value) || 0;
  const sales_qty = parseFloat(document.getElementById('s-sales').value) || 0;
  const closing_qty = parseFloat(document.getElementById('s-closing').value) || 0;
  const remarks = document.getElementById('s-remarks').value.trim();
  const photoFile = document.getElementById('s-photo').files[0];
  let photo_url = document.getElementById('s-photo-url').value || null;

  if(!work_date || !product_name){
    showToast('Date and product name are required'); return;
  }

  const btn = document.getElementById('sales-save-btn');
  btn.disabled = true;
  try{
    if(photoFile){
      btn.textContent = 'Uploading photo…';
      const compressed = await compressImageFile(photoFile);
      photo_url = await uploadPhotoToCloudinary(compressed);
    }

    btn.textContent = 'Saving…';
    const payload = { work_date, store_id, promoter_id, product_name, opening_qty, sales_qty, closing_qty, remarks, photo_url };
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
