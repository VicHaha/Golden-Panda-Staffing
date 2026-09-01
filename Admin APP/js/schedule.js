// ============================================================
// Schedule — assign jobs, view the rolling 4-week roadshow calendar
// ============================================================

const JOB_POSITIONS = ['Promoter', 'Assistant', 'Mascot'];
let scheduleShowMore = false; // toggled by the "Show earlier & later jobs" button

// Default shift presets: pay auto-fills when a position is chosen.
// Promoter has two common shift lengths, so it gets a second dropdown
// to pick between them (or "Custom" to type your own).
const SHIFT_PRESETS = {
  Promoter: [
    { key:'p_full', start:'10:00', end:'18:00', pay:140, label:'10:00–18:00 · RM140' },
    { key:'p_half', start:'10:30', end:'13:30', pay:60,  label:'10:30–13:30 · RM60' }
  ],
  Mascot: [
    { key:'m_std', start:'11:00', end:'13:00', pay:100, label:'11:00–13:00 · RM100' }
  ],
  Assistant: [
    { key:'a_std', start:'11:00', end:'13:00', pay:80, label:'11:00–13:00 · RM80' }
  ]
};

function renderSchedule(){
  if(jobs.length===0){
    return emptyState('🗓️','No jobs scheduled','Tap + to assign a promoter, or use the calendar button to add an unassigned working date.');
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const windowEnd = new Date(today); windowEnd.setDate(windowEnd.getDate() + 28);
  const todayStr = today.toISOString().slice(0,10);
  const windowEndStr = windowEnd.toISOString().slice(0,10);
  const now = new Date();

  function hasEnded(j){
    const end = new Date(j.work_date + 'T' + (j.end_time || '23:59'));
    return end < now;
  }

  const nearJobs = jobs.filter(j => !hasEnded(j) && j.work_date <= windowEndStr);
  const pastJobs = jobs.filter(j => hasEnded(j));
  const futureJobs = jobs.filter(j => !hasEnded(j) && j.work_date > windowEndStr);
  const otherJobs = [...pastJobs, ...futureJobs];

  let html = `<div class="section-title">Current and upcoming activity <span class="count-pill">${nearJobs.length}</span></div>`;

  if(nearJobs.length === 0){
    html += emptyState('🗓️','Nothing in the next 4 weeks','Tap + to assign a job, or check "earlier & later jobs" below.');
  }else{
    html += renderJobList(nearJobs);
  }

  if(otherJobs.length > 0){
    html += `
      <button class="btn btn-ghost btn-block" style="margin-top:14px;" onclick="toggleScheduleMore()">
        ${scheduleShowMore ? 'Hide' : 'Show'} earlier &amp; later jobs (${otherJobs.length})
      </button>
    `;
    if(scheduleShowMore){
      html += `<div class="day-group-label" style="margin-top:18px;">Outside the next 4 weeks</div>`;
      html += renderJobList(pastJobs, 'desc');
      html += renderJobList(futureJobs, 'asc');
    }
  }

  return html;
}

function renderJobList(list, sortDir){
  sortDir = sortDir || 'asc';
  const sorted = [...list].sort((a,b)=> sortDir === 'desc'
    ? b.work_date.localeCompare(a.work_date)
    : a.work_date.localeCompare(b.work_date));
  let lastDate = null;
  let html = '';
  sorted.forEach(j=>{
    const highlightTomorrow = isTomorrowScheduleHighlighted(j.work_date);
    if(j.work_date !== lastDate){
      html += `<div class="day-group-label${highlightTomorrow?' tomorrow-schedule-label':''}">${formatDateLong(j.work_date)}${highlightTomorrow?'<span class="tomorrow-highlight-pill">Tomorrow</span>':''}</div>`;
      lastDate = j.work_date;
    }
    const unassigned = !j.promoter_id;
    const promoterName = j.promoters ? displayName(j.promoters) : (unassigned ? 'Promoter not assigned' : '(promoter removed)');
    const storeName = j.stores ? j.stores.name : '(store removed)';
    const start = shortTime(j.start_time), end = shortTime(j.end_time);
    const d = new Date(j.work_date+'T00:00:00');
    const hrs = timeDiffHours(start, end);
    const position = j.position || 'Promoter';

    html += `
      <div class="job-card${highlightTomorrow?' tomorrow-schedule-job':''}">
        <div class="job-date">
          <div class="dow">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
          <div class="dom">${d.getDate()}</div>
          <div class="mon">${d.toLocaleDateString('en-GB',{month:'short'})}</div>
        </div>
        <div class="job-body">
          <div class="job-store">${esc(storeName)}</div>
          <div class="job-promoter">${esc(promoterName)}</div>
          ${unassigned?'<span class="job-position job-position-open">Open date</span>':`<span class="job-position job-position-${position.toLowerCase()}">${esc(position)}</span>`}
          <span class="job-time">${start}–${end} · ${hrs}h</span>
          ${unassigned?'':`<div class="job-pay">RM ${Number(j.pay||0).toFixed(2)}${j.commission?` + RM ${Number(j.commission).toFixed(2)} comm.`:''}</div>`}
        </div>
        <div class="job-actions">
          <button type="button" class="icon-btn" onclick="${unassigned?'openWorkDateForm':'openJobForm'}('${j.id}')" aria-label="Edit ${unassigned?'working date':'job'} at ${esc(storeName)}" title="Edit ${unassigned?'working date':'job'}">✎</button>
          <button type="button" class="icon-btn danger" onclick="deleteJob('${j.id}')" aria-label="Delete job at ${esc(storeName)}" title="Delete job">✕</button>
        </div>
      </div>
    `;
  });
  return html;
}

function toggleScheduleMore(){
  scheduleShowMore = !scheduleShowMore;
  render();
}

function openJobForm(id){
  const editing = id ? jobs.find(j=>j.id===id) : null;
  const currentPosition = editing ? (editing.position || 'Promoter') : 'Promoter';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${editing ? 'Edit job' : 'Assign job'}</div>
      <div class="field">
        <label>Promoter</label>
        <select id="f-promoter">
          ${[...promoters].filter(p=>isActive(p) || (editing && editing.promoter_id===p.id)).sort((a,b)=>displayName(a).localeCompare(displayName(b))).map(p=>`<option value="${p.id}" ${editing&&editing.promoter_id===p.id?'selected':''}>${esc(displayName(p))}${!isActive(p)?' (hidden)':''}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Position</label>
        <select id="f-position" onchange="onPositionChange(true)">
          ${JOB_POSITIONS.map(pos=>`<option value="${pos}" ${currentPosition===pos?'selected':''}>${pos}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Shift (sets default pay)</label>
        <select id="f-shift-preset" onchange="applyShiftPreset(this.value)"></select>
      </div>
      <div class="field">
        <label>Store / location</label>
        <input id="f-store" list="store-list" value="${editing&&editing.stores?esc(editing.stores.name):''}" placeholder="e.g. Isetan Lot 10">
        <datalist id="store-list">${stores.map(s=>`<option value="${esc(s.name)}">`).join('')}</datalist>
      </div>
      <div class="field"><label>Date</label><input id="f-date" type="date" value="${editing?editing.work_date:''}"></div>
      <div class="field-row">
        <div class="field"><label>Start time</label><input id="f-start" type="time" value="${editing?shortTime(editing.start_time):'10:00'}"></div>
        <div class="field"><label>End time</label><input id="f-end" type="time" value="${editing?shortTime(editing.end_time):'18:00'}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Pay (RM)</label><input id="f-pay" type="number" min="0" step="0.01" value="${editing?editing.pay:''}" placeholder="e.g. 120"></div>
        <div class="field"><label>Commission (RM, optional)</label><input id="f-comm" type="number" min="0" step="0.01" value="${editing&&editing.commission?editing.commission:''}" placeholder="e.g. 30"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="job-save-btn" onclick="saveJobForm('${editing?editing.id:''}')">Save</button>
      </div>
    </div>
  `;
  showModal(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });

  // Build the shift-preset list for the current position, and try to
  // match it to this job's existing values (edit) or apply the first
  // preset's defaults (new job).
  onPositionChange(!editing);
  if(editing){
    const matchKey = findMatchingPresetKey(currentPosition, shortTime(editing.start_time), shortTime(editing.end_time), Number(editing.pay));
    document.getElementById('f-shift-preset').value = matchKey || 'custom';
  }
}

function openWorkDateForm(id){
  const editing = id ? jobs.find(job=>job.id===id) : null;
  if(editing && editing.promoter_id){ openJobForm(id); return; }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${editing ? 'Edit working date' : 'Add working date'}</div>
      <div class="field-hint" style="margin-bottom:14px;">Promoter details can be assigned later.</div>
      <div class="field"><label>Date</label><input id="wd-date" type="date" value="${editing?editing.work_date:''}" required></div>
      <div class="field">
        <label>Store / venue</label>
        <input id="wd-store" list="work-date-store-list" value="${editing&&editing.stores?esc(editing.stores.name):''}" placeholder="e.g. Isetan Lot 10" required>
        <datalist id="work-date-store-list">${stores.map(store=>`<option value="${esc(store.name)}">`).join('')}</datalist>
      </div>
      <div class="field-row">
        <div class="field"><label>Start time</label><input id="wd-start" type="time" value="${editing?shortTime(editing.start_time):'10:00'}" required></div>
        <div class="field"><label>End time</label><input id="wd-end" type="time" value="${editing?shortTime(editing.end_time):'18:00'}" required></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" id="work-date-save-btn" onclick="saveWorkDateForm('${editing?editing.id:''}')">Save</button>
      </div>
      ${editing?`<button type="button" class="btn btn-ghost btn-block" style="margin-top:10px;" onclick="closeModal();openJobForm('${editing.id}')">Assign promoter details</button>`:''}
    </div>`;
  showModal(overlay);
  overlay.addEventListener('click',event=>{ if(event.target===overlay) closeModal(); });
}

async function saveWorkDateForm(id){
  const work_date = document.getElementById('wd-date').value;
  const storeName = document.getElementById('wd-store').value.trim();
  const start_time = document.getElementById('wd-start').value;
  const end_time = document.getElementById('wd-end').value;
  if(!work_date || !storeName || !start_time || !end_time){
    showToast('Date, venue, start time, and end time are required');
    return;
  }
  const btn = document.getElementById('work-date-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try{
    const store = await DB.getOrCreateStore(storeName);
    const payload = { promoter_id:null, position:'Promoter', store_id:store.id, work_date, start_time, end_time, pay:0, commission:0 };
    if(id) await DB.updateJob(id,payload);
    else await DB.addJob(payload);
    await linkUnassignedSalesRecordsToJob(work_date,store.id);
    await refreshData();
    closeModal();
    render();
    showToast('Working date saved');
  }catch(e){
    console.error(e);
    showToast('Could not save — '+(e.message||'check your connection'));
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

function buildShiftPresetOptions(position){
  const presets = SHIFT_PRESETS[position] || [];
  const opts = presets.map(p=>`<option value="${p.key}">${p.label}</option>`).join('');
  return opts + `<option value="custom">Custom (set manually)</option>`;
}

function findMatchingPresetKey(position, start, end, pay){
  const presets = SHIFT_PRESETS[position] || [];
  const match = presets.find(p => p.start === start && p.end === end && Number(p.pay) === Number(pay));
  return match ? match.key : null;
}

// Rebuilds the shift-preset dropdown for whichever position is now selected.
// applyDefault=true also fills in the first preset's time/pay (used when
// the person actively changes position, or opens the form for a new job).
function onPositionChange(applyDefault){
  const position = document.getElementById('f-position').value;
  const presetSelect = document.getElementById('f-shift-preset');
  presetSelect.innerHTML = buildShiftPresetOptions(position);
  if(applyDefault){
    const presets = SHIFT_PRESETS[position] || [];
    if(presets.length){
      presetSelect.value = presets[0].key;
      applyShiftPreset(presets[0].key);
    }else{
      presetSelect.value = 'custom';
    }
  }
}

function applyShiftPreset(key){
  if(key === 'custom') return;
  const position = document.getElementById('f-position').value;
  const preset = (SHIFT_PRESETS[position] || []).find(p => p.key === key);
  if(!preset) return;
  document.getElementById('f-start').value = preset.start;
  document.getElementById('f-end').value = preset.end;
  document.getElementById('f-pay').value = preset.pay;
}

async function saveJobForm(id){
  const promoter_id = document.getElementById('f-promoter').value;
  const position = document.getElementById('f-position').value;
  const storeName = document.getElementById('f-store').value.trim();
  const work_date = document.getElementById('f-date').value;
  const start_time = document.getElementById('f-start').value;
  const end_time = document.getElementById('f-end').value;
  const pay = parseFloat(document.getElementById('f-pay').value) || 0;
  const commission = parseFloat(document.getElementById('f-comm').value) || 0;

  if(!promoter_id || !storeName || !work_date || !start_time || !end_time){
    showToast('Please fill in all required fields'); return;
  }

  const btn = document.getElementById('job-save-btn');
  btn.disabled = true;
  try{
    const store = await DB.getOrCreateStore(storeName);
    const payload = { promoter_id, position, store_id: store.id, work_date, start_time, end_time, pay, commission };

    if(id){
      await DB.updateJob(id, payload);
    }else{
      await DB.addJob(payload);
    }
    await linkUnassignedSalesRecordsToJob(work_date, store.id);
    await refreshData();
    closeModal();
    render();
    showToast('Job saved');
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
  }
}

async function deleteJob(id){
  if(!confirm('Remove this job from the schedule?')) return;
  try{
    await DB.deleteJob(id);
    await refreshData();
    render();
    showToast('Job removed');
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}
