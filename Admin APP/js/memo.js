// ============================================================
// Memo — a general list of notes (admin app only), opened from the memo
// button above the "+" on the Schedule screen. Newest first, with an
// optional date on each note. Stored in the `memos` table.
// ============================================================

let memos = [];

function renderMemoSheet(state){
  const list = state === 'loading'
    ? `<p class="ss-empty">Loading notes…</p>`
    : state === 'error'
      ? `<p class="ss-empty">Memos aren't set up yet — run <code>sql/migration_memos.sql</code> in Supabase, then reopen this.</p>`
      : memos.length
        ? `<ul class="memo-list">${memos.map(memo=>`
            <li class="memo-item">
              <div class="memo-meta">
                ${memo.note_date ? `<span class="memo-date">${formatDateShort(memo.note_date)}</span>` : ''}
                <small>${esc(memo.created_by || 'Admin')} · ${new Date(memo.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</small>
                <button type="button" class="icon-btn danger" onclick="deleteMemo('${memo.id}')" aria-label="Delete note">✕</button>
              </div>
              <div class="memo-text">${esc(memo.text)}</div>
            </li>`).join('')}</ul>`
        : `<p class="ss-empty">No notes yet. Add the first one below.</p>`;
  return `
    <div class="stock-summary-head"><div class="modal-title">Memo</div><button type="button" class="modal-close-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="field">
      <label for="memo-text">New note</label>
      <textarea id="memo-text" rows="3" placeholder="Write a note…"></textarea>
    </div>
    <div class="field-row memo-add-row">
      <div class="field"><label for="memo-date">Date (optional)</label><input id="memo-date" type="date"></div>
      <button type="button" class="btn btn-primary" id="memo-save-btn" onclick="saveMemo()">Add note</button>
    </div>
    ${list}
  `;
}

function refreshMemoSheet(state){
  const sheet = document.getElementById('memo-sheet');
  if(!sheet) return;
  // Keep whatever is half-typed while the list reloads.
  const draft = (document.getElementById('memo-text')||{}).value || '';
  const date = (document.getElementById('memo-date')||{}).value || '';
  sheet.innerHTML = renderMemoSheet(state);
  document.getElementById('memo-text').value = draft;
  document.getElementById('memo-date').value = date;
}

async function openMemoSection(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal-sheet" id="memo-sheet">${renderMemoSheet('loading')}</div>`;
  showModal(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  try{
    memos = await DB.getMemos();
    refreshMemoSheet('ready');
  }catch(e){
    console.error(e);
    refreshMemoSheet('error');
  }
}

async function saveMemo(){
  const text = document.getElementById('memo-text').value.trim();
  const note_date = document.getElementById('memo-date').value || null;
  if(!text){ showToast('Write a note first'); return; }
  const btn = document.getElementById('memo-save-btn');
  btn.disabled = true;
  try{
    const created = await DB.addMemo({ text, note_date, created_by: currentAdminName || null });
    memos.unshift(created);
    refreshMemoSheet('ready');
    document.getElementById('memo-text').value = '';
    document.getElementById('memo-date').value = '';
    showToast('Note added');
  }catch(e){
    console.error(e);
    showToast('Could not save — ' + (e.message || 'check your connection'));
    btn.disabled = false;
  }
}

async function deleteMemo(id){
  if(!confirm('Delete this note?')) return;
  try{
    await DB.deleteMemo(id);
    memos = memos.filter(memo=>memo.id !== id);
    refreshMemoSheet('ready');
  }catch(e){
    console.error(e);
    showToast('Could not delete — ' + (e.message || 'check your connection'));
  }
}
