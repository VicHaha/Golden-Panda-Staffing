// ============================================================
// Sales & Stock — per-product opening/sales/closing counts,
// grouped by working date, expand/collapse per date.
// ============================================================

let salesExpandedDates = new Set(); // which date groups are currently expanded

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

  let html = `<div class="section-title">Sales &amp; stock reports <span class="count-pill">${dates.length} date${dates.length>1?'s':''}</span></div>`;

  dates.forEach(date=>{
    const items = byDate[date];
    const expanded = salesExpandedDates.has(date);
    const totalSales = items.reduce((s,i)=>s + Number(i.sales_qty||0), 0);
    const storeNames = [...new Set(items.filter(i=>i.stores).map(i=>i.stores.name))];

    html += `
      <div class="sales-group">
        <button class="sales-group-header" onclick="toggleSalesDate('${date}')">
          <div>
            <div class="sales-group-date">${formatDateLong(date)}</div>
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
        <div class="sales-item-main">
          <div class="sales-item-name">${esc(i.product_name)}</div>
          <div class="sales-item-stats">
            Open <b>${opening}</b> · Sold <b>${sales}</b> · Close <b>${closing}</b>
            ${variance !== 0 ? `<span class="sales-variance ${variance<0?'short':'over'}">${variance>0?'+':''}${variance} vs expected</span>` : ''}
          </div>
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
        <label>Date</label>
        <input id="s-date" list="scheduled-dates" type="date" value="${editing?editing.work_date:(scheduledDates[0]||'')}">
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
      <div class="field"><label>Product name</label><input id="s-product" value="${editing?esc(editing.product_name):''}" placeholder="e.g. Golden Panda Floor Cleaner 1L"></div>
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

async function saveSalesForm(id){
  const work_date = document.getElementById('s-date').value;
  const store_id = document.getElementById('s-store').value || null;
  const product_name = document.getElementById('s-product').value.trim();
  const opening_qty = parseFloat(document.getElementById('s-opening').value) || 0;
  const sales_qty = parseFloat(document.getElementById('s-sales').value) || 0;
  const closing_qty = parseFloat(document.getElementById('s-closing').value) || 0;
  const remarks = document.getElementById('s-remarks').value.trim();

  if(!work_date || !product_name){
    showToast('Date and product name are required'); return;
  }

  const btn = document.getElementById('sales-save-btn');
  btn.disabled = true;
  try{
    const payload = { work_date, store_id, product_name, opening_qty, sales_qty, closing_qty, remarks };
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
