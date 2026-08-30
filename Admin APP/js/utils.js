// ============================================================
// Shared helpers
// ============================================================

function esc(str){
  return (str||'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Promoters can have an optional nickname, shown everywhere in both apps
// instead of their full legal name — except the Payout report/export,
// which always uses full_name directly since it's tied to IC/bank details.
// Accepts either a promoter row or the small { full_name, nickname } shape
// returned by a Supabase join.
function displayName(p){
  if(!p) return '';
  const nick = (p.nickname || '').trim();
  return nick || p.full_name || '';
}

function formatDateLong(dateStr){
  return new Date(dateStr+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
}

// Compact "Thu, 6 Aug 2026" label — used in date-restricted dropdowns
// (Stock export) where formatDateLong() reads too long.
function formatDateShort(dateStr){
  return new Date(dateStr+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short', year:'numeric'});
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
  if(window.gpLastFocusedElement && document.contains(window.gpLastFocusedElement)) window.gpLastFocusedElement.focus();
}

// Applies consistent dialog semantics, Escape-to-close, and focus handling to
// every form sheet without duplicating that behavior in each feature file.
function showModal(overlay){
  window.gpLastFocusedElement = document.activeElement;
  const sheet = overlay.querySelector('.modal-sheet');
  const title = overlay.querySelector('.modal-title');
  if(sheet){
    sheet.setAttribute('role','dialog');
    sheet.setAttribute('aria-modal','true');
    if(title){
      title.id = title.id || `modal-title-${Date.now()}`;
      sheet.setAttribute('aria-labelledby',title.id);
    }
  }
  document.body.appendChild(overlay);
  const firstField = overlay.querySelector('input:not([type="hidden"]), select, textarea, button');
  if(firstField) requestAnimationFrame(()=>firstField.focus());
}

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && document.querySelector('.photo-lightbox-overlay')) closePhotoLightbox();
  if(e.key === 'Escape' && document.querySelector('.modal-overlay')) closeModal();
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
  const label = document.getElementById('sync-label');
  if(label) label.textContent = ok ? 'Synced' : 'Syncing or offline';
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

// Small, form-independent calculator. It deliberately uses a tiny parser
// instead of eval/Function so typed expressions cannot execute code.
function calculateExpression(expression){
  const tokens = (expression.replace(/\u00d7/g,'*').replace(/\u00f7/g,'/').match(/\d*\.?\d+|[()+\-*/]/g) || []);
  if(tokens.join('') !== expression.replace(/\s/g,'').replace(/\u00d7/g,'*').replace(/\u00f7/g,'/')) throw new Error('Invalid expression');
  let index = 0;
  function primary(){
    const token = tokens[index++];
    if(token === '('){ const value = add(); if(tokens[index++] !== ')') throw new Error('Missing )'); return value; }
    if(token === '-') return -primary();
    if(token === '+') return primary();
    const value = Number(token);
    if(!Number.isFinite(value)) throw new Error('Number expected');
    return value;
  }
  function multiply(){
    let value = primary();
    while(tokens[index] === '*' || tokens[index] === '/'){
      const operator = tokens[index++], right = primary();
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }
  function add(){
    let value = multiply();
    while(tokens[index] === '+' || tokens[index] === '-'){
      const operator = tokens[index++], right = multiply();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }
  const result = add();
  if(index !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid result');
  return Math.round((result + Number.EPSILON) * 1e10) / 1e10;
}

let calculatorTargetInput = null;

// Remember the quantity/amount field the user was editing. Tapping the
// calculator button moves focus away from that input, so document.activeElement
// alone is not enough to identify where the result should go.
document.addEventListener('focusin', event=>{
  const input = event.target;
  if(input instanceof HTMLInputElement && input.type === 'number' && input.id !== 'calculator-display'){
    calculatorTargetInput = input;
  }
});

function openCalculator(launcher){
  closeCalculator();
  const formScope = launcher && launcher.closest('.modal-overlay');
  const activeInput = document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number'
    ? document.activeElement
    : null;
  if(activeInput) calculatorTargetInput = activeInput;
  if(calculatorTargetInput && (!calculatorTargetInput.isConnected || (formScope && !formScope.contains(calculatorTargetInput)))){
    calculatorTargetInput = null;
  }
  const startingValue = calculatorTargetInput && calculatorTargetInput.value.trim() !== ''
    ? calculatorTargetInput.value
    : '0';
  const overlay = document.createElement('div');
  overlay.className = 'calculator-overlay';
  overlay.innerHTML = `<div class="calculator-card" role="dialog" aria-modal="true" aria-labelledby="calculator-title">
    <div class="calculator-head"><strong id="calculator-title">Calculator</strong><button type="button" onclick="closeCalculator()" aria-label="Close calculator">\u2715</button></div>
    <input id="calculator-display" class="calculator-display" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Calculation">
    <div class="calculator-result" id="calculator-result" aria-live="polite">&nbsp;</div>
    <div class="calculator-keys">
      ${['C','(',')','\u00f7','7','8','9','\u00d7','4','5','6','\u2212','1','2','3','+','0','.','\u232b','='].map(key=>`<button type="button" class="${key==='='?'equals':''}" onclick="calculatorKey('${key}')">${key}</button>`).join('')}
    </div>
  </div>`;
  overlay.addEventListener('click',event=>{ if(event.target===overlay) closeCalculator(); });
  document.body.appendChild(overlay);
  const display = document.getElementById('calculator-display');
  display.value = startingValue;
  display.addEventListener('keydown',event=>{ if(event.key==='Enter'){ event.preventDefault(); calculatorKey('='); } });
  display.focus();
  display.setSelectionRange(display.value.length, display.value.length);
}

function closeCalculator(){
  const overlay = document.querySelector('.calculator-overlay');
  if(overlay) overlay.remove();
}

function calculatorKey(key){
  const display = document.getElementById('calculator-display');
  const result = document.getElementById('calculator-result');
  if(!display) return;
  if(key === 'C'){ display.value=''; result.innerHTML='&nbsp;'; return; }
  if(key === '\u232b'){ display.value=display.value.slice(0,-1); return; }
  if(key === '='){
    try{
      const value=calculateExpression(display.value);
      result.textContent=`= ${value}`;
      display.value=String(value);
      if(calculatorTargetInput && calculatorTargetInput.isConnected){
        const target = calculatorTargetInput;
        target.value = String(value);
        target.dispatchEvent(new Event('input', { bubbles:true }));
        target.dispatchEvent(new Event('change', { bubbles:true }));
        closeCalculator();
        target.focus();
      }
    }
    catch(e){ result.textContent='Check the calculation'; }
    return;
  }
  display.value += key === '\u2212' ? '-' : key;
  display.focus();
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
