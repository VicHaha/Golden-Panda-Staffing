// ============================================================
// App shell — identity gate, boot, data loading & sync
// ============================================================

let promoters = [];
let stores = [];
let scheduledDates = [];
let salesReports = [];
let dayPhotos = [];
let shiftReports = [];
let jobs = [];
let myMonthPay = null; // { pay, commission, count } for this promoter, current calendar month
let tomorrowJob = null; // this promoter's job for tomorrow, if any — see maybeShowShiftReminder()
let currentTab = 'sales';
let realtimeChannel = null;
let currentPromoterId = localStorage.getItem('gp_stock_promoter_id') || null;
let currentPromoterName = localStorage.getItem('gp_stock_promoter_name') || null;

function boot(){
  const root = document.getElementById('root');

  if(typeof DB === 'undefined' || typeof sb === 'undefined'){
    root.innerHTML = `
      <div class="phone" style="align-items:center; justify-content:center; text-align:center; padding:32px;">
        <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo" style="width:52px;height:52px;border-radius:14px;margin-bottom:18px;">
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
      <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo">
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
        <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo">
        <h2>Couldn't connect</h2>
        <p>Check your internet connection and reload the page.</p>
      </div>
    `;
    return;
  }

  // If a saved identity no longer matches a real, active promoter
  // (deleted or hidden by the office), forget it and ask again.
  const savedPromoter = promoters.find(p => p.id === currentPromoterId);
  if(currentPromoterId && (!savedPromoter || savedPromoter.active === false)){
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
  const selectable = promoters.filter(p => p.active !== false);
  if(selectable.length === 0){
    root.innerHTML = `
      <div class="gate">
        <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo">
        <h2>No promoters found yet</h2>
        <p>Ask the office to add promoters in the main staffing app first, then reload this page.</p>
      </div>
    `;
    return;
  }
  root.innerHTML = `
    <div class="gate">
      <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo">
      <h2>Which promoter are you?</h2>
      <p>Pick your name — it stays saved on this phone so you won't need to pick it again next time.</p>
      <select id="gate-promoter">
        ${[...selectable].sort((a,b)=>displayName(a).localeCompare(displayName(b))).map(p=>`<option value="${p.id}">${esc(displayName(p))}</option>`).join('')}
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
  currentPromoterName = displayName(promoter);
  localStorage.setItem('gp_stock_promoter_id', id);
  localStorage.setItem('gp_stock_promoter_name', currentPromoterName);
  startApp();
}

async function startApp(){
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="phone">
      <div class="app-header">
        <div class="brand-row">
          <img class="brand-mark" src="assets/icon-192.png" alt="Golden Panda logo">
          <div class="brand-text">
            <h1>Golden Panda</h1>
            <p>Field Reports</p>
          </div>
          <div class="sync-dot off" id="sync-dot" title="Syncing"></div>
          <div class="identity-chip" onclick="logOut()">${esc(currentPromoterName)}</div>
        </div>
      </div>
      <div id="shift-reminder"></div>
      <div class="content" id="content"></div>
      <div class="fab" id="fab"><button onclick="openFab()" aria-label="Add">+</button></div>
      <div class="tabbar">
        <button class="tab" data-tab="sales" onclick="switchTab('sales')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 8L12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
          Stock
        </button>
        <button class="tab" data-tab="shift" onclick="switchTab('shift')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 3h6v3H9z"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 12h6M9 16h4"/></svg>
          Shift Report
        </button>
        <button class="tab" data-tab="schedule" onclick="switchTab('schedule')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Schedule
        </button>
      </div>
    </div>
  `;
  await loadInitialData();
}

async function loadInitialData(){
  try{
    await DB.purgeOldShiftReports().catch(e=>console.warn('Purge old shift reports failed (non-fatal):', e));
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
  await refreshTomorrowJob();
  switchTab('sales');
}

// Tomorrow's date as YYYY-MM-DD, in this phone's local time.
function tomorrowStr(){
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0,10);
}

async function refreshTomorrowJob(){
  try{
    tomorrowJob = await DB.getMyJobForDate(currentPromoterId, tomorrowStr());
  }catch(e){
    console.warn('Could not check tomorrow\'s job (non-fatal):', e);
    tomorrowJob = null;
  }
  renderShiftReminder();
}

async function refreshData(){
  const [s, sd, sr, dp, shr, jb] = await Promise.all([DB.getStores(), DB.getScheduledDates(), DB.getSalesReports(), DB.getDayPhotos(), DB.getShiftReports(), DB.getAllJobs()]);
  stores = s;
  scheduledDates = sd;
  salesReports = sr;
  dayPhotos = dp;
  shiftReports = shr;
  jobs = jb;
  setSyncDot(true);
  await refreshMyMonthPay();
}

// This promoter's own total pay + commission for the current calendar
// month, shown at the top of the Schedule tab. Fetched separately from
// the shared jobs list so nobody else's pay is ever pulled down.
async function refreshMyMonthPay(){
  try{
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
    const rows = await DB.getMyPayForMonth(currentPromoterId, monthStart, monthEnd);
    const pay = rows.reduce((s,r)=> s + Number(r.pay||0), 0);
    const commission = rows.reduce((s,r)=> s + Number(r.commission||0), 0);
    myMonthPay = { pay, commission, count: rows.length };
  }catch(e){
    console.warn('Could not load this month\'s pay (non-fatal):', e);
    myMonthPay = null;
  }
}

function subscribeRealtime(){
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb
    .channel('gp-stock-report-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_reports' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'day_photos' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_reports' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, handleRemoteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, handleRemoteJobChange)
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

// Separate from handleRemoteChange since jobs need their own refresh
// (both the "tomorrow" reminder and, if open, the Schedule tab).
async function handleRemoteJobChange(){
  if(document.querySelector('.modal-overlay')) return;
  try{
    jobs = await DB.getAllJobs();
  }catch(e){
    console.warn('Could not refresh jobs (non-fatal):', e);
  }
  await refreshTomorrowJob();
  await refreshMyMonthPay();
  if(currentTab === 'schedule') render();
}

// ---------- "Shift tomorrow" reminder banner ----------
// Shown from 8:00 PM onward, the evening before a promoter's scheduled
// shift, so they see their working time/date/position without needing
// a push notification. Dismissible per date — once closed, it won't
// reappear until the next evening that actually has a shift tomorrow.
const SHIFT_REMINDER_HOUR = 20; // 8:00 PM, this phone's local time

function shiftReminderDismissed(date){
  return localStorage.getItem('gp_shift_reminder_dismissed') === date;
}

function dismissShiftReminder(date){
  localStorage.setItem('gp_shift_reminder_dismissed', date);
  renderShiftReminder();
}

function renderShiftReminder(){
  const el = document.getElementById('shift-reminder');
  if(!el) return;

  const isEvening = new Date().getHours() >= SHIFT_REMINDER_HOUR;
  if(!isEvening || !tomorrowJob || shiftReminderDismissed(tomorrowJob.work_date)){
    el.innerHTML = '';
    return;
  }

  const start = shortTime(tomorrowJob.start_time), end = shortTime(tomorrowJob.end_time);
  const storeName = tomorrowJob.stores ? tomorrowJob.stores.name : '';
  const position = tomorrowJob.position || 'Promoter';

  el.innerHTML = `
    <div class="shift-reminder-banner">
      <span class="shift-reminder-icon">⏰</span>
      <div class="shift-reminder-body">
        <div class="shift-reminder-title">You have a shift tomorrow</div>
        <div class="shift-reminder-detail">${formatDateLong(tomorrowJob.work_date)}</div>
        <div class="shift-reminder-detail">${start}–${end} · ${esc(position)}${storeName?` · ${esc(storeName)}`:''}</div>
      </div>
      <button class="shift-reminder-dismiss" onclick="dismissShiftReminder('${tomorrowJob.work_date}')" aria-label="Dismiss">✕</button>
    </div>
  `;
}

// The app can be left open across 8:00 PM (or into a new day) without a
// reload — recheck every few minutes so the banner still appears/updates
// without the promoter having to reopen the app.
setInterval(async ()=>{
  if(!currentPromoterId) return;
  const freshTomorrow = tomorrowStr();
  if(!tomorrowJob || tomorrowJob.work_date !== freshTomorrow){
    await refreshTomorrowJob();
  }else{
    renderShiftReminder();
  }
}, 5 * 60 * 1000);

function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  render();
}

function openFab(){
  if(currentTab==='shift') openShiftForm();
  else if(currentTab==='sales') openSalesForm();
}

function render(){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===currentTab));
  const c = document.getElementById('content');
  if(!c) return;
  c.innerHTML = currentTab==='shift' ? renderShift() : currentTab==='schedule' ? renderSchedule() : renderSales();
  const fab = document.getElementById('fab');
  if(fab) fab.style.display = currentTab==='schedule' ? 'none' : '';
}

// ---------- Service worker (offline shell + installability) ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js').catch(err=>console.warn('SW registration failed', err));
  });
}

// ---------- Init ----------
boot();
