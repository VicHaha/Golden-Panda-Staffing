// ============================================================
// App shell — boot, layout, tab routing, data loading & sync
// ============================================================

let promoters = [];
let jobs = [];
let stores = [];
let salesReports = [];
let dayPhotos = [];
let dayFeedback = [];
let shiftReports = [];
let currentTab = 'sales';
let reportMonth = new Date().toISOString().slice(0,7);
let realtimeChannel = null;

// Local-only identity, on top of the real Supabase account login below —
// a per-device display name (like the promoter app's "which promoter are
// you?" step) so the header/stock form can show who's using it, without
// needing that to double as the account email.
let currentAdminName = localStorage.getItem('gp_admin_name') || null;

function boot(){
  const root = document.getElementById('root');

  if(typeof DB === 'undefined' || typeof sb === 'undefined'){
    root.innerHTML = `
      <div class="phone" style="align-items:center; justify-content:center; text-align:center; padding:32px;">
        <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo" style="width:52px;height:52px;border-radius:14px;margin-bottom:18px;">
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

async function checkAuthThenProceed(){
  let session;
  try{
    session = await Auth.getSession();
  }catch(e){
    console.error(e);
    session = null;
  }
  if(session){
    if(!currentAdminName){
      renderNameGate();
    }else{
      renderApp();
    }
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
      <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo">
      <h2>${isSignup ? 'Create your account' : 'Log in'}</h2>
      <p>${isSignup
        ? 'First time here? Set a password to log in with next time.'
        : 'Enter your email and password to open the office app.'}</p>
      <div class="gate-form">
        <label for="auth-email">Email address</label>
        <input id="auth-email" type="email" inputmode="email" placeholder="name@example.com" value="${prefillEmail ? esc(prefillEmail) : ''}" autocapitalize="off" autocomplete="email">
        <label for="auth-password">Password</label>
        <input id="auth-password" type="password" placeholder="Enter your password" autocomplete="${isSignup?'new-password':'current-password'}">
        <button class="btn btn-primary btn-block" id="auth-submit-btn" onclick="${isSignup?'submitSignup()':'submitLogin()'}">${isSignup ? 'Create account' : 'Log in'}</button>
      </div>
      <p class="fineprint">
        ${isSignup
          ? `Already have an account? <a href="#" onclick="event.preventDefault(); renderAuthGate('login')">Log in</a>`
          : `No account yet? <a href="#" onclick="event.preventDefault(); renderAuthGate('signup')">Create one</a>`}
      </p>
    </div>
  `;
  document.getElementById('auth-email').focus();
  document.getElementById('auth-password').addEventListener('keydown', e=>{
    if(e.key === 'Enter') isSignup ? submitSignup() : submitLogin();
  });
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
      checkAuthThenProceed();
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
    checkAuthThenProceed();
  }catch(e){
    console.error(e);
    showToast(e.message || 'Could not log in');
    btn.disabled = false; btn.textContent = 'Log in';
  }
}

// Simple name gate — free text, no picking from a list (there's no fixed
// roster of "admins" the way there is a roster of promoters). Shown once
// per device after a successful account login (see checkAuthThenProceed),
// same as the promoter app asks "which promoter are you?" after its own
// login. Saved to this device so it's only asked once.
function renderNameGate(){
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="gate">
      <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo">
      <h2>Who's logging in?</h2>
      <p>Enter your name — it stays saved on this device so you won't need to enter it again next time.</p>
      <div class="gate-form">
        <label for="gate-admin-name">Your name</label>
        <input id="gate-admin-name" type="text" placeholder="e.g. Aisyah" autocapitalize="words" autocomplete="name" value="${currentAdminName?esc(currentAdminName):''}">
        <button class="btn btn-primary btn-block" onclick="submitAdminName()">Continue</button>
      </div>
      <p class="fineprint">Not you on this device in future? Tap your name at the top of the app to log out.</p>
    </div>
  `;
  const input = document.getElementById('gate-admin-name');
  input.focus();
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') submitAdminName(); });
}

function submitAdminName(){
  const name = document.getElementById('gate-admin-name').value.trim();
  if(!name){ showToast('Enter your name'); return; }
  currentAdminName = name;
  localStorage.setItem('gp_admin_name', name);
  renderApp();
}

function logOutAdmin(){
  if(!confirm('Log out of this app on this device?')) return;
  localStorage.removeItem('gp_admin_name');
  currentAdminName = null;
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  Auth.signOut().catch(e=>console.error(e));
  renderAuthGate('login');
}

function renderApp(){
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="phone">
      <div class="app-header">
        <div class="brand-row">
          <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo">
          <div class="brand-text">
            <h1>Golden Panda</h1>
            <p>Roadshow Staffing</p>
          </div>
          <span class="sync-status" title="Connection status"><span class="sync-dot off" id="sync-dot"></span><span class="sync-label" id="sync-label">Syncing</span></span>
          <button type="button" class="identity-chip" onclick="logOutAdmin()" title="Log out ${esc(currentAdminName)}">${esc(currentAdminName)}</button>
        </div>
      </div>
      <main class="content" id="content"><div class="loading-state" role="status"><span class="loading-spinner" aria-hidden="true"></span>Loading your workspace…</div></main>
      <div class="fab" id="fab"><button onclick="openFab()" aria-label="Add job">+</button></div>
      <nav class="tabbar" aria-label="Main navigation">
        <button type="button" class="tab" data-tab="roster" onclick="switchTab('roster')">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
          Schedule
        </button>
        <button type="button" class="tab" data-tab="sales" onclick="switchTab('sales')">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 8L12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
          Sales
        </button>
        <button type="button" class="tab" data-tab="stock" onclick="switchTab('stock')">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="7" width="18" height="14" rx="1.5"/><path d="M3 7l3.5-4h11L21 7"/><path d="M9 12h6"/></svg>
          Stock
        </button>
        <button type="button" class="tab" data-tab="reports" onclick="switchTab('reports')">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>
          Payout
        </button>
      </nav>
    </div>
  `;
  loadInitialData();
}

async function loadInitialData(){
  try{
    await DB.purgeOldJobs().catch(e=>console.warn('Purge old jobs failed (non-fatal):', e));
    await DB.purgeOldSalesReports().catch(e=>console.warn('Purge old sales reports failed (non-fatal):', e));
    await DB.purgeOldDayPhotos().catch(e=>console.warn('Purge old day photos failed (non-fatal):', e));
    await DB.purgeOldDayFeedback().catch(e=>console.warn('Purge old day feedback failed (non-fatal):', e));
    await refreshData();
    await linkAllScheduledLocations().catch(e=>console.warn('Link scheduled locations failed (non-fatal):',e));
    await ensureTodaysStockRows().catch(e=>console.warn('Auto-seed today\'s stock rows failed (non-fatal):', e));
    await refreshData(); // re-fetch so any newly auto-created rows show up
    setSyncDot(true);
    subscribeRealtime();
    startJobReminderChecks();
  }catch(e){
    console.error(e);
    setSyncDot(false);
    showToast('Could not connect to Supabase — check your internet connection');
  }
  switchTab(openTappedScheduleReminder() ? 'roster' : 'sales');
}

// Re-fetches promoters, jobs, stores, sales reports, day photos, day feedback, and shift reports from Supabase.
async function refreshData(){
  const [p, j, s, sr, dp, df, shr] = await Promise.all([DB.getPromoters(), DB.getJobs(), DB.getStores(), DB.getSalesReports(), DB.getDayPhotos(), DB.getDayFeedback(), DB.getShiftReports()]);
  promoters = p;
  jobs = j;
  stores = s;
  salesReports = sr;
  dayPhotos = dp;
  dayFeedback = df;
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'day_feedback' }, handleRemoteChange)
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
    await checkJobReminders();
    render();
  }catch(e){
    console.error(e);
  }
}

// ---------- Tabs ----------
function switchTab(tab){
  if(tab === 'roster' && typeof requestJobNotificationsFromScheduleTap === 'function'){
    requestJobNotificationsFromScheduleTap();
  }
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(b=>{
    const active = b.dataset.tab===tab;
    b.classList.toggle('active', active);
    if(active) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  render();
  const content = document.getElementById('content');
  if(content) content.scrollTop = 0;
}

function openFab(){
  if(currentTab==='roster'){
    if(rosterPage==='schedule') openJobForm();
    else openPromoterForm();
  }
  else if(currentTab==='sales') openSalesForm();
  else if(currentTab==='stock') openAddStockRecordForm();
  else showToast('Switch to Schedule, Sales, or Stock to add');
}

function render(){
  document.querySelectorAll('.tab').forEach(b=>{
    const active = b.dataset.tab===currentTab;
    b.classList.toggle('active', active);
    if(active) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  const c = document.getElementById('content');
  if(!c) return;
  if(currentTab==='roster') c.innerHTML = renderRosterSection();
  else if(currentTab==='sales') c.innerHTML = renderSales();
  else if(currentTab==='stock') c.innerHTML = renderStockManagement();
  else c.innerHTML = renderReports();
  if(currentTab==='reports') wireReportControls();
  else if(currentTab==='roster') wireRosterSectionControls();
  else if(currentTab==='sales') wireStockExportControls();

  // No "+" action makes sense on Payout — hide the FAB there. Stock
  // Management's FAB adds a new stock-location record (see
  // openAddStockRecordForm in js/stock.js); it's separate from the
  // Sales tab's own "+", which adds a Sales record instead.
  const fab = document.getElementById('fab');
  if(fab){
    fab.classList.toggle('hidden', currentTab==='reports');
    const label = currentTab==='roster' ? (rosterPage==='schedule' ? 'Add job' : 'Add promoter') : currentTab==='sales' ? 'Add sales report' : 'Add stock record';
    const button = fab.querySelector('button');
    if(button){
      button.setAttribute('aria-label',label);
      button.title = label;
    }
  }
}

// ---------- Service worker (offline shell + installability) ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js').catch(err=>console.warn('SW registration failed', err));
  });
}

// ---------- Init ----------
boot();
