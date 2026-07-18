// ============================================================
// Schedule — assign jobs, view the rolling 4-week roadshow calendar
// ============================================================

const JOB_POSITIONS = ['Promoter', 'Assistant', 'Mascot'];
let scheduleShowMore = false; // toggled by the "Show earlier & later jobs" button

function renderSchedule(){
  if(promoters.length===0){
    return emptyState('📅','Add promoters first','You need at least one promoter before building the schedule.');
  }
  if(jobs.length===0){
    return emptyState('🗓️','No jobs scheduled','Tap + to assign a promoter to a roadshow date.');
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const windowEnd = new Date(today); windowEnd.setDate(windowEnd.getDate() + 28);
  const todayStr = today.toISOString().slice(0,10);
  const windowEndStr = windowEnd.toISOString().slice(0,10);

  const nearJobs = jobs.filter(j => j.work_date >= todayStr && j.work_date <= windowEndStr);
  const otherJobs = jobs.filter(j => j.work_date < todayStr || j.work_date > windowEndStr);

  let html = `<div class="section-title">Next 4 weeks <span class="count-pill">${nearJobs.length}</span></div>`;

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
      html += renderJobList(otherJobs);
    }
  }

  return html;
}

function renderJobList(list){
  const sorted = [...list].sort((a,b)=> a.work_date.localeCompare(b.work_date));
  let lastDate = null;
  let html = '';
  sorted.forEach(j=>{
    if(j.work_date !== lastDate){
      html += `<div class="day-group-label">${formatDateLong(j.work_date)}</div>`;
      lastDate = j.work_date;
    }
    const promoterName = j.promoters ? j.promoters.full_name : '(promoter removed)';
    const storeName = j.stores ? j.stores.name : '(store removed)';
    const start = shortTime(j.start_time), end = shortTime(j.end_time);
    const d = new Date(j.work_date+'T00:00:00');
    const hrs = timeDiffHours(start, end);
    const position = j.position || 'Promoter';
    html += `
      <div class="job-card">
        <div class="job-date">
          <div class="dow">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
          <div class="dom">${d.getDate()}</div>
          <div class="mon">${d.toLocaleDateString('en-GB',{month:'short'})}</div>
        </div>
        <div class="job-body">
          <div class="job-store">${esc(storeName)}</div>
          <div class="job-promoter">${esc(promoterName)}</div>
          <span class="job-position job-position-${position.toLowerCase()}">${esc(position)}</span>
          <span class="job-time">${start}–${end} · ${hrs}h</span>
          <div class="job-pay">RM ${Number(j.pay||0).toFixed(2)}${j.commission?` + RM ${Number(j.commission).toFixed(2)} comm.`:''}</div>
        </div>
        <div class="job-actions">
          <div class="icon-btn" onclick="openJobForm('${j.id}')">✎</div>
          <div class="icon-btn danger" onclick="deleteJob('${j.id}')">✕</div>
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
          ${[...promoters].sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(p=>`<option value="${p.id}" ${editing&&editing.promoter_id===p.id?'selected':''}>${esc(p.full_name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Position</label>
        <select id="f-position">
          ${JOB_POSITIONS.map(pos=>`<option value="${pos}" ${currentPosition===pos?'selected':''}>${pos}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Store / location</label>
        <input id="f-store" list="store-list" value="${editing&&editing.stores?esc(editing.stores.name):''}" placeholder="e.g. Isetan Lot 10">
        <datalist id="store-list">${stores.map(s=>`<option value="${esc(s.name)}">`).join('')}</datalist>
        <div class="field-hint">Type an existing store or a new one — new ones are saved automatically.</div>
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
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
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
