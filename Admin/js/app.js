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

// Local-only identity — unlike the promoter app, admin doesn't sign in
// with a Supabase account (the office account signs in invisibly behind
// the scenes, see js/supabase.js); this is just a typed name, remembered
// on this device, so the header/stock form can show who's using it.
let currentAdminName = localStorage.getItem('gp_admin_name') || null;

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

  if(!currentAdminName){
    renderNameGate();
  }else{
    renderApp();
  }
}

// Simple name gate — free text, no picking from a list (there's no fixed
// roster of "admins" the way there is a roster of promoters). Saved to
// this device so it's only asked once.
function renderNameGate(){
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="gate">
      <div class="brand-mark">GP</div>
      <h2>Who's logging in?</h2>
      <p>Enter your name — it stays saved on this device so you won't need to enter it again next time.</p>
      <input id="gate-admin-name" type="text" placeholder="Your name" autocapitalize="words" autocomplete="name" value="${currentAdminName?esc(currentAdminName):''}">
      <button class="btn btn-primary btn-block" onclick="submitAdminName()">Continue</button>
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
  renderNameGate();
}

function renderApp(){
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
    await officeSignInPromise; // ensure the app is authenticated before any writes can happen
    await DB.purgeOldJobs().catch(e=>console.warn('Purge old jobs failed (non-fatal):', e));
    await DB.purgeOldSalesReports().catch(e=>console.warn('Purge old sales reports failed (non-fatal):', e));
    await DB.purgeOldDayPhotos().catch(e=>console.warn('Purge old day photos failed (non-fatal):', e));
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
