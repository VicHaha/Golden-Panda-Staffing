// ============================================================
// Shared helpers
// ============================================================

function esc(str){
  return (str||'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Promoters can have an optional nickname, shown everywhere in both apps
// instead of their full legal name — except the Payout report/export in
// the Admin app, which always uses full_name directly since it's tied to
// IC/bank details. Accepts either a promoter row or the small
// { full_name, nickname } shape returned by a Supabase join.
function displayName(p){
  if(!p) return '';
  const nick = (p.nickname || '').trim();
  return nick || p.full_name || '';
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
  if(typeof stopDayPhotoCamera === 'function') stopDayPhotoCamera();
  const o = document.querySelector('.modal-overlay');
  if(o) o.remove();
}

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && document.querySelector('.photo-lightbox-overlay')) closePhotoLightbox();
});

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

// Increments/decrements a number input by 1, clamped to its min attribute
// (defaults to 0), then fires the input's own 'input' event so any existing
// oninput handler (e.g. the "given out" auto-preview) stays in sync. Powers
// the large +/- quantity steppers on the stock report form in both apps.
function stepQty(inputId, delta){
  const el = document.getElementById(inputId);
  if(!el) return;
  const min = el.min !== '' ? Number(el.min) : -Infinity;
  const current = parseFloat(el.value) || 0;
  let next = current + delta;
  if(next < min) next = min;
  el.value = next;
  el.dispatchEvent(new Event('input', { bubbles: true }));
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
