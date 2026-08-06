// ============================================================
// App shell — boot, layout, tab routing, data loading & sync
// ============================================================

let promoters = [];
let jobs = [];
let stores = [];
let salesReports = [];
let dayPhotos = [];
let shiftReports = [];
let currentTab = 'roster';
let reportMonth = new Date().toISOString().slice(0,7);
let realtimeChannel = null;

// The signed-in admin's identity — set once login + the one-time "type
// your name" step are done. Everything saved to the database from this
// app onward is tagged with currentAdminName (see js/supabase.js).
let currentAdminId = null;
let currentAdminName = null;
let currentAdminEmail = null;

function boot(){
  const root = document.getElementById('root');

  if(typeof DB === 'undefined' || typeof sb === 'undefined'){
    root.innerHTML = `
      <div class="phone" style="align-items:center; justify-content:center; text-align:center; padding:32px;">
        <div class="brand-mark" style="width:52px;height:52px;font-size:22px;border-radius:14px;margin-bottom:18px;">GP</div>
        <h2 style="font-family:'Fraunces',serif; font-size:18px;">Couldn't start the app</h2>
        <p style="font-size:13px; color:var(--ink-soft); max-width:320px;">
          A required script failed to load (likely <code>js/vendor/supabase-sdk.js</code>).
          Open your browser's console (F12) for the exact error, and make sure every file
          from the app folder — not just index.html — was deployed.
        </p>
      </div>
    `;
    return;
  }

  checkAuthThenProceed();
}

// ---------- Admin login gate ----------

async function checkAuthThenProceed(){
  let session;
  try{
    session = await Auth.getSession();
  }catch(e){
    console.error(e);
    session = null;
  }
  if(session){
    loadAdminIdentityThenProceed(session.user);
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
      <h2>${isSignup ? 'Create your admin account' : 'Office log in'}</h2>
      <p>${isSignup
        ? 'First time here? Set a password to log in with next time.'
        : 'Enter your email and password to open the office app.'}</p>
      <input id="auth-email" type="email" placeholder="Email" value="${prefillEmail ? esc(prefillEmail) : ''}" autocapitalize="off" autocomplete="email">
      <input id="auth-password" type="password" placeholder="Password" autocomplete="${isSignup?'new-password':'current-password'}">
      <button class="btn btn-primary btn-block" id="auth-submit-btn" onclick="${isSignup?'submitAdminSignup()':'submitAdminLogin()'}">${isSignup ? 'Create account' : 'Log in'}</button>
      <p class="fineprint">
        ${isSignup
          ? `Already have an account? <a href="#" onclick="event.preventDefault(); renderAuthGate('login')">Log in</a>`
          : `No account yet? <a href="#" onclick="event.preventDefault(); renderAuthGate('signup')">Create one</a>`}
      </p>
    </div>
  `;
  document.getElementById('auth-email').focus();
}

async function submitAdminSignup(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if(!email || !password){ showToast('Enter an email and password'); return; }
  if(password.length < 6){ showToast('Password must be at least 6 characters'); return; }

  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  try{
    const result = await Auth.signUp(email, password);
    if(result.session){
      loadAdminIdentityThenProceed(result.session.user);
    }else{
      showToast('Account created — check your email to confirm, then log in');
      renderAuthGate('login', email);
    }
  }catch(e){
    console.error(e);
    showToast(e.message || 'Could not create account');
    btn.disabled = false; btn.textContent = 'Create account';
  }
}

async function submitAdminLogin(){
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if(!email || !password){ showToast('Enter your email and password'); return; }

  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true; btn.textContent = 'Logging in…';
  try{
    const result = await Auth.signIn(email, password);
    loadAdminIdentityThenProceed(result.user);
  }catch(e){
    console.error(e);
    showToast(e.message || 'Could not log in');
    btn.disabled = false; btn.textContent = 'Log in';
  }
}

// After signing in, look up (or create) this admin's row in `users` so
// every record they save can be attributed to a real typed name rather
// than just an email address.
async function loadAdminIdentityThenProceed(user){
  let row;
  try{
    row = await AdminDirectory.getMyRow(user.id);
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
  if(row){
    currentAdminId = row.id;
    currentAdminName = row.full_name;
    currentAdminEmail = row.email;
    startApp();
  }else{
    renderAdminNameGate(user);
  }
}

function renderAdminNameGate(user){
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="gate">
      <div class="brand-mark">GP</div>
      <h2>What's your name?</h2>
      <p>This is shown on everything you add or edit, so the rest of the team knows who entered it.</p>
      <input id="gate-admin-name" placeholder="e.g. Victoria Tan" autocomplete="name">
      <button class="btn btn-primary btn-block" onclick="submitAdminName('${user.id}','${esc(user.email||'')}')">Continue</button>
      <p class="fineprint">You can't change this later without asking a developer — take a moment to get it right.</p>
    </div>
  `;
  document.getElementById('gate-admin-name').focus();
}

async function submitAdminName(userId, userEmail){
  const nameInput = document.getElementById('gate-admin-name');
  const full_name = nameInput.value.trim();
  if(!full_name){ showToast('Enter your name'); return; }
  try{
    const row = await AdminDirectory.createMyRow(userId, userEmail, full_name);
    currentAdminId = row.id;
    currentAdminName = row.full_name;
    currentAdminEmail = row.email;
    startApp();
  }catch(e){
    console.error(e);
    showToast(e.message || 'Could not save your name');
  }
}

async function logOutAdmin(){
  if(!confirm('Log out of the office app on this device?')) return;
  currentAdminId = null;
  currentAdminName = null;
  currentAdminEmail = null;
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  try{ await Auth.signOut(); }catch(e){ console.error(e); }
  renderAuthGate('login');
}

// ---------- Main app shell (only reached once logged in) ----------

function startApp(){
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="phone">
      <div class="app-header">
        <div class="brand-row">
          <div class="brand-mark">GP</div>
          <div class="brand-text">
            <h1>Golden Panda</h1>
            <p>Roadshow Staffing</p>
          </div>
          <div class="sync-dot off" id="sync-dot" title="Syncing"></div>
          <div class="identity-chip" onclick="logOutAdmin()">${esc(currentAdminName)}</div>
        </div>
      </div>
      <div class="content" id="content"></div>
      <div class="fab" id="fab"><button onclick="openFab()" aria-label="Add">+</button></div>
      <div class="tabbar">
        <button class="tab" data-tab="roster" onclick="switchTab('roster')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
          Schedule
        </button>
        <button class="tab" data-tab="sales" onclick="switchTab('sales')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 8L12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
          Stock
        </button>
        <button class="tab" data-tab="analysis" onclick="switchTab('analysis')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="0.5"/><rect x="12" y="8" width="3" height="10" rx="0.5"/><rect x="17" y="4" width="3" height="14" rx="0.5"/></svg>
          Analysis
        </button>
        <button class="tab" data-tab="reports" onclick="switchTab('reports')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>
          Payout
        </button>
      </div>
    </div>
  `;
  loadInitialData();
}

async function loadInitialData(){
  try{
    await DB.purgeOldJobs().catch(e=>console.warn('Purge old jobs failed (non-fatal):', e));
    await DB.purgeOldSalesReports().catch(e=>console.warn('Purge old sales reports failed (non-fatal):', e));
    await DB.purgeOldDayPhotos().catch(e=>console.warn('Purge old day photos failed (non-fatal):', e));
    await DB.purgeOldShiftReports().catch(e=>console.warn('Purge old shift reports failed (non-fatal):', e));
    await refreshData();
    await ensureTodaysStockRows().catch(e=>console.warn('Auto-seed today\'s stock rows failed (non-fatal):', e));
    await refreshData(); // re-fetch so any newly auto-created rows show up
    setSyncDot(true);
    subscribeRealtime();
  }catch(e){
    console.error(e);
    setSyncDot(false);
    showToast('Could not connect to Supabase — check your internet connection');
  }
  switchTab('roster');
}

// Re-fetches promoters, jobs, stores, sales reports, day photos, and shift reports from Supabase.
async function refreshData(){
  const [p, j, s, sr, dp, shr] = await Promise.all([DB.getPromoters(), DB.getJobs(), DB.getStores(), DB.getSalesReports(), DB.getDayPhotos(), DB.getShiftReports()]);
  promoters = p;
  jobs = j;
  stores = s;
  salesReports = sr;
  dayPhotos = dp;
  shiftReports = shr;
  setSyncDot(true);
}

// Live sync: any change made from another phone updates this view automatically.
function subscribeRealtime(){
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb
    .channel('gp-staffing-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promoters' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_reports' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'day_photos' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_reports' }, handleRemoteChange)
    .subscribe(status=>{
      setSyncDot(status === 'SUBSCRIBED');
    });
}

async function handleRemoteChange(){
  // Don't yank the screen while someone is mid-edit in a form.
  if(document.querySelector('.modal-overlay')) return;
  try{
    await refreshData();
    render();
  }catch(e){
    console.error(e);
  }
}

// ---------- Tabs ----------
function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  render();
}

function openFab(){
  if(currentTab==='roster'){
    if(rosterPage==='schedule') openJobForm();
    else openPromoterForm();
  }
  else if(currentTab==='sales') openSalesForm();
  else showToast('Switch to Schedule or Stock to add');
}

function render(){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===currentTab));
  const c = document.getElementById('content');
  if(!c) return;
  if(currentTab==='roster') c.innerHTML = renderRosterSection();
  else if(currentTab==='sales') c.innerHTML = renderSales();
  else if(currentTab==='analysis') c.innerHTML = renderAnalysis();
  else c.innerHTML = renderReports();
  if(currentTab==='reports') wireReportControls();
  else if(currentTab==='roster') wireRosterSectionControls();
  else if(currentTab==='sales') wireStockExportControls();
  else if(currentTab==='analysis') wireAnalysisControls();

  // No "+" action makes sense on Analysis or Payout — hide the FAB there.
  const fab = document.getElementById('fab');
  if(fab) fab.classList.toggle('hidden', currentTab==='analysis' || currentTab==='reports');
}

// ---------- Service worker (offline shell + installability) ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js').catch(err=>console.warn('SW registration failed', err));
  });
}

// ---------- Init ----------
boot();
