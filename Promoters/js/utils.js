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

// Resizes/compresses an image file in the browser before upload — phone
// camera photos are often 3-8MB, this brings them down to a small JPEG
// so uploads are fast and stay well within Cloudinary's free tier.
function compressImageFile(file, maxDim = 1000, quality = 0.8){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Could not decode image file'));
      img.onload = () => {
        let { width, height } = img;
        if(width > height && width > maxDim){
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        }else if(height > maxDim){
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob=>{
          if(blob) resolve(blob);
          else reject(new Error('Could not compress image'));
        }, 'image/jpeg', quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
