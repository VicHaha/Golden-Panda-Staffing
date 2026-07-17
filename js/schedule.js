// ============================================================
// Schedule — assign jobs, view the full roadshow calendar
// ============================================================

function renderSchedule(){
  if(promoters.length===0){
    return emptyState('📅','Add promoters first','You need at least one promoter before building the schedule.');
  }
  if(jobs.length===0){
    return emptyState('🗓️','No jobs scheduled','Tap + to assign a promoter to a roadshow date.');
  }
  const sorted = [...jobs].sort((a,b)=> a.work_date.localeCompare(b.work_date));
  let lastDate = null;
  let html = `<div class="section-title">Full schedule <span class="count-pill">${jobs.length}</span></div>`;
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

function openJobForm(id){
  const editing = id ? jobs.find(j=>j.id===id) : null;
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
    const payload = { promoter_id, store_id: store.id, work_date, start_time, end_time, pay, commission };

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
