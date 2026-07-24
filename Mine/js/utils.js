// ============================================================
// Shared helpers
// ============================================================

function esc(str){
  return (str||'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatDateLong(dateStr){
  return new Date(dateStr+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
}

function timeDiffHours(start, end){
  if(!start || !end) return '—';
  const [sh,sm] = start.split(':').map(Number);
  const [eh,em] = end.split(':').map(Number);
  let diff = (eh*60+em) - (sh*60+sm);
  if(diff<0) diff += 24*60;
  return (diff/60).toFixed(1).replace(/\.0$/,'');
}

// Postgres "time" columns come back as "HH:MM:SS" — trim to "HH:MM" for display and <input type="time">.
function shortTime(t){
  return t ? t.slice(0,5) : t;
}

function emptyState(glyph, title, hint){
  return `<div class="empty-state"><div class="glyph">${glyph}</div><p>${title}</p><p class="hint">${hint}</p></div>`;
}

function closeModal(){
  const o = document.querySelector('.modal-overlay');
  if(o) o.remove();
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

function setSyncDot(ok){
  const dot = document.getElementById('sync-dot');
  if(dot) dot.classList.toggle('off', !ok);
}
