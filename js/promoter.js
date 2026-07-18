// ============================================================
// Promoters — list, add, edit, delete
// ============================================================

function renderPromoters(){
  if(promoters.length===0){
    return emptyState('👤','No promoters yet','Tap the + button to add your first promoter.');
  }
  const sorted = [...promoters].sort((a,b)=>a.full_name.localeCompare(b.full_name));
  return `
    <div class="section-title">Your team <span class="count-pill">${promoters.length}</span></div>
    ${sorted.map(p=>`
      <div class="badge">
        <div class="badge-hole"></div>
        <div class="badge-top">
          <div>
            <div class="badge-name">${esc(p.full_name)}</div>
            <span class="badge-ic">${esc(p.ic_number||'—')}</span>
          </div>
        </div>
        <div class="badge-meta">
          <b>Age:</b> ${p.age||'—'} &nbsp;·&nbsp; <b>Phone:</b> ${esc(p.phone||'—')}<br>
          <b>Address:</b> ${esc(p.address||'—')}
        </div>
        <div class="badge-actions">
          <button class="btn btn-ghost" onclick="openPromoterForm('${p.id}')">Edit</button>
          <button class="btn btn-danger-ghost" onclick="deletePromoter('${p.id}')">Delete</button>
        </div>
      </div>
    `).join('')}
  `;
}

function openPromoterForm(id){
  const editing = id ? promoters.find(p=>p.id===id) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${editing ? 'Edit promoter' : 'Add promoter'}</div>
      <div class="field"><label>Full name</label><input id="f-name" value="${editing?esc(editing.full_name):''}" placeholder="e.g. Nur Aisyah binti Ahmad"></div>
      <div class="field"><label>IC number</label><input id="f-ic" value="${editing?esc(editing.ic_number||''):''}" placeholder="e.g. 950101-01-1234"></div>
      <div class="field-row">
        <div class="field"><label>Age</label><input id="f-age" type="number" min="16" max="80" value="${editing?editing.age||'':''}" placeholder="e.g. 24"></div>
        <div class="field"><label>Phone</label><input id="f-phone" value="${editing?esc(editing.phone||''):''}" placeholder="e.g. 012-3456789"></div>
      </div>
      <div class="field"><label>Address</label><input id="f-addr" value="${editing?esc(editing.address||''):''}" placeholder="Home address"></div>
      <div class="field-row">
        <div class="field"><label>Bank name</label><input id="f-bank" value="${editing?esc(editing.bank_name||''):''}" placeholder="e.g. Maybank"></div>
        <div class="field"><label>Bank account</label><input id="f-bankacc" value="${editing?esc(editing.bank_account||''):''}" placeholder="e.g. 1234567890"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="promoter-save-btn" onclick="savePromoterForm('${editing?editing.id:''}')">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
}

async function savePromoterForm(id){
  const full_name = document.getElementById('f-name').value.trim();
  const ic_number = document.getElementById('f-ic').value.trim();
  const age = parseInt(document.getElementById('f-age').value, 10) || null;
  const phone = document.getElementById('f-phone').value.trim();
  const address = document.getElementById('f-addr').value.trim();
  const bank_name = document.getElementById('f-bank').value.trim();
  const bank_account = document.getElementById('f-bankacc').value.trim();

  if(!full_name){ showToast('Name is required'); return; }

  const payload = { full_name, ic_number, age, phone, address, bank_name, bank_account };

  try{
    if(id){
      await DB.updatePromoter(id, payload);
    }else{
      await DB.addPromoter(payload);
    }
    await refreshData();
    closeModal();
    render();
    showToast('Promoter saved');
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
  }
}

async function deletePromoter(id){
  const linkedJobs = jobs.filter(j=>j.promoter_id===id).length;
  const msg = linkedJobs>0
    ? `This promoter has ${linkedJobs} job(s) on the schedule, which will also be deleted. Continue?`
    : 'Delete this promoter?';
  if(!confirm(msg)) return;
  try{
    await DB.deletePromoter(id); // jobs cascade-delete via the DB foreign key (on delete cascade)
    await refreshData();
    render();
    showToast('Promoter deleted');
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}
