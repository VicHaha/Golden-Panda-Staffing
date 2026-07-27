// ============================================================
// App shell — identity gate, boot, data loading & sync
// ============================================================

let promoters = [];
let stores = [];
let scheduledDates = [];
let salesReports = [];
let realtimeChannel = null;
let currentPromoterId = localStorage.getItem('gp_stock_promoter_id') || null;
let currentPromoterName = localStorage.getItem('gp_stock_promoter_name') || null;

function boot(){
  const root = document.getElementById('root');

  if(typeof DB === 'undefined' || typeof sb === 'undefined'){
    root.innerHTML = `
      <div class="phone" style="align-items:center; justify-content:center; text-align:center; padding:32px;">
        <div class="brand-mark" style="width:52px;height:52px;font-size:22px;border-radius:14px;margin-bottom:18px;">GP</div>
        <h2 style="font-family:'Fraunces',serif; font-size:18px;">Couldn't start the app</h2>
        <p style="font-size:13px; color:var(--ink-soft); max-width:320px;">
          A required script failed to load (likely <code>js/vendor/supabase-sdk.js</code>).
          Open your browser's console (F12) for the exact error.
        </p>
      </div>
    `;
    return;
  }

  checkAuthThenProceed();
}

async function checkAuthThenProceed(){
  let session;
  try{
    session = await Auth.getSession();
  }catch(e){
    console.error(e);
    session = null;
  }
  if(session){
    loadPromotersThenGate();
  }else{
    renderAuthGate('login');
  }
}

// mode is 'login' or 'signup'
function renderAuthGate(mode, prefillEmail){
  const root = document.getElementById('root');
  const isSignup = mode === 'signup';
  root.innerHTML = `
    <div class="gate">
      <div class="brand-mark">GP</div>
      <h2>${isSignup ? 'Create your account' : 'Log in'}</h2>
      <p>${isSignup
        ? 'First time here? Set a password to log in with next time.'
        : 'Enter your email and password to log stock reports.'}</p>
      <input id="auth-email" type="email" placeholder="Email" value="${prefillEmail ? esc(prefillEmail) : ''}" autocapitalize="off" autocomplete="email">
      <input id="auth-password" type="password" placeholder="Password" autocomplete="${isSignup?'new-password':'current-password'}">
      <button class="btn btn-primary btn-block" id="auth-submit-btn" onclick="${isSignup?'submitSignup()':'submitLogin()'}">${isSignup ? 'Create account' : 'Log in'}</button>
      <p class="fineprint">
        ${isSignup
          ? `Already have an account? <a href="#" onclick="event.preventDefault(); renderAuthGate('login')">Log in</a>`
          : `No account yet? <a href="#" onclick="event.preventDefault(); renderAuthGate('signup')">Create one</a>`}
      </p>
    </div>
  `;
  document.getElementById('auth-email').focus();
}

async function submitSignup(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if(!email || !password){ showToast('Enter an email and password'); return; }
  if(password.length < 6){ showToast('Password must be at least 6 characters'); return; }

  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  try{
    const result = await Auth.signUp(email, password);
    if(result.session){
      // Signed in immediately (email confirmation is off in this project).
      loadPromotersThenGate();
    }else{
      // Email confirmation is on — they need to click a link before logging in.
      showToast('Account created — check your email to confirm, then log in');
      renderAuthGate('login', email);
    }
  }catch(e){
    console.error(e);
    showToast(e.message || 'Could not create account');
    btn.disabled = false; btn.textContent = 'Create account';
  }
}

async function submitLogin(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if(!email || !password){ showToast('Enter your email and password'); return; }

  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true; btn.textContent = 'Logging in…';
  try{
    await Auth.signIn(email, password);
    loadPromotersThenGate();
  }catch(e){
    console.error(e);
    showToast(e.message || 'Could not log in');
    btn.disabled = false; btn.textContent = 'Log in';
  }
}

async function logOut(){
  if(!confirm('Log out of this app on this phone?')) return;
  localStorage.removeItem('gp_stock_promoter_id');
  localStorage.removeItem('gp_stock_promoter_name');
  currentPromoterId = null;
  currentPromoterName = null;
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  try{ await Auth.signOut(); }catch(e){ console.error(e); }
  renderAuthGate('login');
}

async function loadPromotersThenGate(){
  try{
    promoters = await DB.getPromoters();
  }catch(e){
    console.error(e);
    document.getElementById('root').innerHTML = `
      <div class="gate">
        <div class="brand-mark">GP</div>
        <h2>Couldn't connect</h2>
        <p>Check your internet connection and reload the page.</p>
      </div>
    `;
    return;
  }

  // If a saved identity no longer matches a real promoter (deleted, etc), forget it.
  if(currentPromoterId && !promoters.find(p => p.id === currentPromoterId)){
    localStorage.removeItem('gp_stock_promoter_id');
    localStorage.removeItem('gp_stock_promoter_name');
    currentPromoterId = null;
    currentPromoterName = null;
  }

  if(!currentPromoterId){
    renderIdentityGate();
  }else{
    startApp();
  }
}

function renderIdentityGate(){
  const root = document.getElementById('root');
  if(promoters.length === 0){
    root.innerHTML = `
      <div class="gate">
        <div class="brand-mark">GP</div>
        <h2>No promoters found yet</h2>
        <p>Ask the office to add promoters in the main staffing app first, then reload this page.</p>
      </div>
    `;
    return;
  }
  root.innerHTML = `
    <div class="gate">
      <div class="brand-mark">GP</div>
      <h2>Which promoter are you?</h2>
      <p>Pick your name — it stays saved on this phone so you won't need to pick it again next time.</p>
      <select id="gate-promoter">
        ${[...promoters].sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(p=>`<option value="${p.id}">${esc(p.full_name)}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-block" onclick="submitIdentity()">Continue</button>
      <p class="fineprint">Not you on this phone in future? Tap your name at the top of the app to log out.</p>
    </div>
  `;
}

function submitIdentity(){
  const select = document.getElementById('gate-promoter');
  const id = select.value;
  const promoter = promoters.find(p => p.id === id);
  if(!promoter) return;
  currentPromoterId = id;
  currentPromoterName = promoter.full_name;
  localStorage.setItem('gp_stock_promoter_id', id);
  localStorage.setItem('gp_stock_promoter_name', promoter.full_name);
  startApp();
}

async function startApp(){
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="phone">
      <div class="app-header">
        <div class="brand-row">
          <div class="brand-mark">GP</div>
          <div class="brand-text">
            <h1>Golden Panda</h1>
            <p>Stock Report</p>
          </div>
          <div class="sync-dot off" id="sync-dot" title="Syncing"></div>
          <div class="identity-chip" onclick="logOut()">${esc(currentPromoterName)}</div>
        </div>
      </div>
      <div class="content" id="content"></div>
      <div class="fab" id="fab"><button onclick="openSalesForm()" aria-label="Add">+</button></div>
    </div>
  `;
  await loadInitialData();
}

async function loadInitialData(){
  try{
    await refreshData();
    await ensureTodaysStockRows().catch(e=>console.warn('Auto-seed today\'s stock rows failed (non-fatal):', e));
    await refreshData(); // re-fetch so any newly auto-created rows show up
    setSyncDot(true);
    subscribeRealtime();
  }catch(e){
    console.error(e);
    setSyncDot(false);
    showToast('Could not connect — check your internet connection');
  }
  render();
}

async function refreshData(){
  const [s, sd, sr] = await Promise.all([DB.getStores(), DB.getScheduledDates(), DB.getSalesReports()]);
  stores = s;
  scheduledDates = sd;
  salesReports = sr;
  setSyncDot(true);
}

function subscribeRealtime(){
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb
    .channel('gp-stock-report-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_reports' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, handleRemoteChange)
    .subscribe(status=>{
      setSyncDot(status === 'SUBSCRIBED');
    });
}

async function handleRemoteChange(){
  if(document.querySelector('.modal-overlay')) return;
  try{
    await refreshData();
    render();
  }catch(e){
    console.error(e);
  }
}

function render(){
  const c = document.getElementById('content');
  if(!c) return;
  c.innerHTML = renderSales();
}

// ---------- Service worker (offline shell + installability) ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js').catch(err=>console.warn('SW registration failed', err));
  });
}

// ---------- Init ----------
boot();
