// ============================================================
// Promoter Shift Report — engagement & conversion numbers for the
// Before Break / After Break shifts. Grouped-by-date view. Unlike
// Sales & stock reports, shift reports stay editable/deletable by any
// logged-in promoter even after the working date has passed — only the
// list itself defaults to hiding older dates (see shiftShowPast below).
// ============================================================

let shiftExpandedDates = new Set();
let shiftShowPast = false;

const SHIFT_LABELS = {
  before_break: 'Before Break (10am–2pm)',
  after_break: 'After Break (3pm–6pm)'
};

const AGE_RANGE_LABELS = {
  under_18: 'Under 18',
  '18_25': '18–25',
  '26_35': '26–35',
  '36_50': '36–50',
  '50_plus': '50+'
};

function shiftLabel(shift){
  return SHIFT_LABELS[shift] || shift;
}

function ageRangeLabel(range){
  return AGE_RANGE_LABELS[range] || range;
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
  const allDates = Object.keys(byDate).sort((a,b)=> b.localeCompare(a));
  const today = todayStr();

  // Past reports are hidden by default so the list stays focused on
  // what's current — tap "Show past reports" to bring the history back.
  // They're still fully editable once shown (see renderShiftItems).
  const nearDates = allDates.filter(d => d >= today);
  const pastDates = allDates.filter(d => d < today);
  const visibleDates = shiftShowPast ? allDates : nearDates;

  let html = `<div class="section-title">Shift reports <span class="count-pill">${allDates.length} date${allDates.length>1?'s':''}</span></div>`;

  if(visibleDates.length === 0){
    html += emptyState('📋','No shift reports yet','Tap + to log engagement numbers for a shift.');
  }else{
    visibleDates.forEach(date=>{
      const items = byDate[date].sort((a,b)=> a.shift.localeCompare(b.shift));
      const expanded = shiftExpandedDates.has(date);
      const totalEngaged = items.reduce((s,i)=>s + Number(i.engaged||0), 0);
      const totalPurchases = items.reduce((s,i)=>s + Number(i.purchases||0), 0);
      const isToday = date === today;

      html += `
        <div class="shift-report-group">
          <button type="button" class="shift-report-header" onclick="toggleShiftDate('${date}')" aria-expanded="${expanded}">
            <div class="shift-report-summary">
              <div class="shift-report-date">${formatDateLong(date)} ${isToday?'<span class="count-pill">Today</span>':''}</div>
              <div class="shift-report-sub">${items.length} shift${items.length>1?'s':''} logged · ${totalEngaged} engaged · ${totalPurchases} purchases</div>
            </div>
            <span class="shift-report-chevron ${expanded?'open':''}" aria-hidden="true">▾</span>
          </button>
          ${expanded ? `<div class="shift-report-body">${renderShiftItems(items)}</div>` : ''}
        </div>
      `;
    });
  }

  if(pastDates.length > 0){
    html += `
      <button class="btn btn-ghost btn-block" style="margin-top:14px;" onclick="toggleShiftShowPast()">
        ${shiftShowPast ? 'Hide' : 'Show'} past reports (${pastDates.length})
      </button>
    `;
  }

  return html;
}

function toggleShiftShowPast(){
  shiftShowPast = !shiftShowPast;
  render();
}

function renderShiftItems(items){
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
          ${i.promoters ? `<div class="sales-item-remarks">Logged by ${esc(displayName(i.promoters))}</div>` : ''}
          ${i.customer_age_range ? `<div class="sales-item-remarks">Customer age range: ${esc(ageRangeLabel(i.customer_age_range))}</div>` : ''}
          ${i.customer_feedback ? `<div class="sales-item-remarks">“${esc(i.customer_feedback)}”</div>` : ''}
        </div>
        <div class="job-actions">
          <div class="icon-btn" onclick="openShiftForm('${i.id}')">✎</div>
          <div class="icon-btn danger" onclick="deleteShiftReport('${i.id}')">✕</div>
        </div>
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
  const formDate = editing ? editing.work_date : today;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="form-title-row"><div class="modal-title">${editing ? 'Edit shift report' : 'Add shift report'}</div><button type="button" class="calculator-launch" onclick="openCalculator(this)" aria-label="Open calculator" title="Calculator">🧮</button></div>
      <div class="field-hint" style="margin-bottom:12px;">Logging as <b>${esc(currentPromoterName)}</b> · ${formatDateLong(formDate)}</div>
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
      <div class="field">
        <label>Customer age range</label>
        <select id="sh-age-range">
          <option value="">— Not specified —</option>
          <option value="under_18" ${editing&&editing.customer_age_range==='under_18'?'selected':''}>${AGE_RANGE_LABELS.under_18}</option>
          <option value="18_25" ${editing&&editing.customer_age_range==='18_25'?'selected':''}>${AGE_RANGE_LABELS['18_25']}</option>
          <option value="26_35" ${editing&&editing.customer_age_range==='26_35'?'selected':''}>${AGE_RANGE_LABELS['26_35']}</option>
          <option value="36_50" ${editing&&editing.customer_age_range==='36_50'?'selected':''}>${AGE_RANGE_LABELS['36_50']}</option>
          <option value="50_plus" ${editing&&editing.customer_age_range==='50_plus'?'selected':''}>${AGE_RANGE_LABELS['50_plus']}</option>
        </select>
      </div>
      <div class="field"><label>Customer feedback (optional)</label><input id="sh-feedback" value="${editing?esc(editing.customer_feedback||''):''}" placeholder="e.g. Liked the scent, found it pricey"></div>
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
  // New reports are always logged against today; editing an existing
  // report keeps its original working date (a promoter fixing last
  // week's numbers shouldn't accidentally move them onto today).
  const editing = id ? shiftReports.find(r=>r.id===id) : null;
  const work_date = editing ? editing.work_date : todayStr();
  const shift = document.getElementById('sh-shift').value;
  const store_id = document.getElementById('sh-store').value || null;
  const engaged = parseInt(document.getElementById('sh-engaged').value, 10) || 0;
  const successful_engagements = parseInt(document.getElementById('sh-successful').value, 10) || 0;
  const purchases = parseInt(document.getElementById('sh-purchases').value, 10) || 0;
  const avgTimeRaw = document.getElementById('sh-avg-time').value;
  const avg_engagement_time = avgTimeRaw === '' ? null : parseFloat(avgTimeRaw);
  const customer_age_range = document.getElementById('sh-age-range').value || null;
  const customer_feedback = document.getElementById('sh-feedback').value.trim() || null;

  if(successful_engagements > engaged){
    showToast('Successful engagements can\'t exceed engaged'); return;
  }
  if(purchases > successful_engagements){
    showToast('Purchases can\'t exceed successful engagements'); return;
  }

  const btn = document.getElementById('shift-save-btn');
  btn.disabled = true;
  try{
    const payload = { work_date, shift, store_id, promoter_id: currentPromoterId, engaged, successful_engagements, purchases, avg_engagement_time, customer_age_range, customer_feedback };
    btn.textContent = 'Saving…';
    if(id){
      await DB.updateShiftReport(id, payload);
    }else{
      await DB.addShiftReport(payload);
    }
    shiftExpandedDates.add(work_date);
    if(work_date < todayStr()) shiftShowPast = true;
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
