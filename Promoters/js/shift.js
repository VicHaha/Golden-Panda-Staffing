// ============================================================
// Promoter Shift Report — engagement & conversion numbers for the
// Before Break / After Break shifts. Grouped-by-date view, same
// edit-only-today rule as Sales & stock reports.
// ============================================================

let shiftExpandedDates = new Set();

const SHIFT_LABELS = {
  before_break: 'Before Break (10am–2pm)',
  after_break: 'After Break (3pm–6pm)'
};

function shiftLabel(shift){
  return SHIFT_LABELS[shift] || shift;
}

function renderShift(){
  if(shiftReports.length === 0){
    return emptyState('📋','No shift reports yet','Tap + to log engagement numbers for a shift.');
  }

  const byDate = {};
  shiftReports.forEach(r=>{
    if(!byDate[r.work_date]) byDate[r.work_date] = [];
    byDate[r.work_date].push(r);
  });
  const dates = Object.keys(byDate).sort((a,b)=> b.localeCompare(a));
  const today = todayStr();

  let html = `<div class="section-title">Shift reports <span class="count-pill">${dates.length} date${dates.length>1?'s':''}</span></div>`;

  dates.forEach(date=>{
    const items = byDate[date].sort((a,b)=> a.shift.localeCompare(b.shift));
    const expanded = shiftExpandedDates.has(date);
    const totalEngaged = items.reduce((s,i)=>s + Number(i.engaged||0), 0);
    const totalPurchases = items.reduce((s,i)=>s + Number(i.purchases||0), 0);
    const isToday = date === today;

    html += `
      <div class="sales-group">
        <button class="sales-group-header" onclick="toggleShiftDate('${date}')">
          <div>
            <div class="sales-group-date">${formatDateLong(date)} ${isToday?'<span class="count-pill">Today</span>':''}</div>
            <div class="sales-group-sub">${items.length} shift${items.length>1?'s':''} logged · ${totalEngaged} engaged · ${totalPurchases} purchases</div>
          </div>
          <span class="sales-group-chevron ${expanded?'open':''}">▾</span>
        </button>
        ${expanded ? `<div class="sales-group-body">${renderShiftItems(items, isToday)}</div>` : ''}
      </div>
    `;
  });

  return html;
}

function renderShiftItems(items, isToday){
  return items.map(i=>{
    const engaged = Number(i.engaged||0);
    const successful = Number(i.successful_engagements||0);
    const purchases = Number(i.purchases||0);
    const avgTime = i.avg_engagement_time!=null && i.avg_engagement_time!=='' ? `${i.avg_engagement_time} min avg` : null;
    const rate = engaged>0 ? Math.round((successful/engaged)*100) : null;
    return `
      <div class="sales-item">
        <div class="sales-item-main">
          <div class="sales-item-name">${esc(shiftLabel(i.shift))}</div>
          <div class="sales-item-stats">
            Engaged <b>${engaged}</b> · Successful <b>${successful}</b>${rate!=null?` (${rate}%)`:''} · Purchases <b>${purchases}</b>
            ${avgTime ? ` · ${esc(avgTime)}` : ''}
          </div>
          ${i.stores ? `<div class="sales-item-remarks">${esc(i.stores.name)}</div>` : ''}
          ${i.promoters ? `<div class="sales-item-remarks">Logged by ${esc(i.promoters.full_name)}</div>` : ''}
          ${i.customer_feedback ? `<div class="sales-item-remarks">“${esc(i.customer_feedback)}”</div>` : ''}
          ${i.notes ? `<div class="sales-item-remarks">${esc(i.notes)}</div>` : ''}
        </div>
        ${isToday ? `
          <div class="job-actions">
            <div class="icon-btn" onclick="openShiftForm('${i.id}')">✎</div>
            <div class="icon-btn danger" onclick="deleteShiftReport('${i.id}')">✕</div>
          </div>
        ` : `<div class="sales-locked" title="Only today's reports can be edited">🔒</div>`}
      </div>
    `;
  }).join('');
}

function toggleShiftDate(date){
  if(shiftExpandedDates.has(date)) shiftExpandedDates.delete(date);
  else shiftExpandedDates.add(date);
  render();
}

function openShiftForm(id){
  const editing = id ? shiftReports.find(r=>r.id===id) : null;
  const today = todayStr();
  if(editing && editing.work_date !== today){
    showToast("Only today's reports can be edited"); return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${editing ? 'Edit shift report' : 'Add shift report'}</div>
      <div class="field-hint" style="margin-bottom:12px;">Logging as <b>${esc(currentPromoterName)}</b> · ${formatDateLong(today)}</div>
      <div class="field">
        <label>Shift</label>
        <select id="sh-shift">
          <option value="before_break" ${editing&&editing.shift==='before_break'?'selected':''}>${SHIFT_LABELS.before_break}</option>
          <option value="after_break" ${editing&&editing.shift==='after_break'?'selected':''}>${SHIFT_LABELS.after_break}</option>
        </select>
      </div>
      <div class="field">
        <label>Store (optional)</label>
        <select id="sh-store">
          <option value="">— Not specified —</option>
          ${stores.map(s=>`<option value="${s.id}" ${editing&&editing.store_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label>Engaged</label><input id="sh-engaged" type="number" min="0" step="1" value="${editing?editing.engaged:''}" placeholder="0"></div>
        <div class="field"><label>Successful</label><input id="sh-successful" type="number" min="0" step="1" value="${editing?editing.successful_engagements:''}" placeholder="0"></div>
        <div class="field"><label>Purchases</label><input id="sh-purchases" type="number" min="0" step="1" value="${editing?editing.purchases:''}" placeholder="0"></div>
      </div>
      <div class="field">
        <label>Avg engagement time (minutes)</label>
        <input id="sh-avg-time" type="number" min="0" step="0.1" value="${editing&&editing.avg_engagement_time!=null?editing.avg_engagement_time:''}" placeholder="e.g. 3.5">
      </div>
      <div class="field"><label>Customer feedback (optional)</label><input id="sh-feedback" value="${editing?esc(editing.customer_feedback||''):''}" placeholder="e.g. Liked the scent, found it pricey"></div>
      <div class="field"><label>Notes (optional)</label><input id="sh-notes" value="${editing?esc(editing.notes||''):''}" placeholder="e.g. Slow foot traffic after 4pm"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="shift-save-btn" onclick="saveShiftForm('${editing?editing.id:''}')">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

async function saveShiftForm(id){
  const work_date = todayStr(); // promoters can only ever save into today
  const shift = document.getElementById('sh-shift').value;
  const store_id = document.getElementById('sh-store').value || null;
  const engaged = parseInt(document.getElementById('sh-engaged').value, 10) || 0;
  const successful_engagements = parseInt(document.getElementById('sh-successful').value, 10) || 0;
  const purchases = parseInt(document.getElementById('sh-purchases').value, 10) || 0;
  const avgTimeRaw = document.getElementById('sh-avg-time').value;
  const avg_engagement_time = avgTimeRaw === '' ? null : parseFloat(avgTimeRaw);
  const customer_feedback = document.getElementById('sh-feedback').value.trim() || null;
  const notes = document.getElementById('sh-notes').value.trim() || null;

  if(successful_engagements > engaged){
    showToast('Successful engagements can\'t exceed engaged'); return;
  }
  if(purchases > successful_engagements){
    showToast('Purchases can\'t exceed successful engagements'); return;
  }

  const btn = document.getElementById('shift-save-btn');
  btn.disabled = true;
  try{
    const payload = { work_date, shift, store_id, promoter_id: currentPromoterId, engaged, successful_engagements, purchases, avg_engagement_time, customer_feedback, notes };
    btn.textContent = 'Saving…';
    if(id){
      await DB.updateShiftReport(id, payload);
    }else{
      await DB.addShiftReport(payload);
    }
    shiftExpandedDates.add(work_date);
    await refreshData();
    closeModal();
    render();
    showToast('Shift report saved');
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function deleteShiftReport(id){
  const entry = shiftReports.find(r=>r.id===id);
  if(entry && entry.work_date !== todayStr()){
    showToast("Only today's reports can be deleted"); return;
  }
  if(!confirm('Delete this shift report?')) return;
  try{
    await DB.deleteShiftReport(id);
    await refreshData();
    render();
    showToast('Shift report deleted');
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}
