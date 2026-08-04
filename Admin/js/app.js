// ============================================================
// App shell — boot, layout, tab routing, data loading & sync
// ============================================================

let promoters = [];
let jobs = [];
let stores = [];
let salesReports = [];
let dayPhotos = [];
let currentTab = 'promoters';
let reportMonth = new Date().toISOString().slice(0,7);
let realtimeChannel = null;

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
        </div>
      </div>
      <div class="content" id="content"></div>
      <div class="fab" id="fab"><button onclick="openFab()" aria-label="Add">+</button></div>
      <div class="tabbar">
        <button class="tab" data-tab="promoters" onclick="switchTab('promoters')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="5"/></svg>
          Promoters
        </button>
        <button class="tab" data-tab="schedule" onclick="switchTab('schedule')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
          Schedule
        </button>
        <button class="tab" data-tab="sales" onclick="switchTab('sales')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 8L12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
          Stock
        </button>
        <button class="tab" data-tab="reports" onclick="switchTab('reports')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
          Reports
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
  switchTab('promoters');
}

// Re-fetches promoters, jobs, stores, and sales reports from Supabase.
async function refreshData(){
  const [p, j, s, sr, dp] = await Promise.all([DB.getPromoters(), DB.getJobs(), DB.getStores(), DB.getSalesReports(), DB.getDayPhotos()]);
  promoters = p;
  jobs = j;
  stores = s;
  salesReports = sr;
  dayPhotos = dp;
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
  if(currentTab==='promoters') openPromoterForm();
  else if(currentTab==='schedule') openJobForm();
  else if(currentTab==='sales') openSalesForm();
  else showToast('Switch to Promoters, Schedule, or Stock to add');
}

function render(){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===currentTab));
  const c = document.getElementById('content');
  if(!c) return;
  if(currentTab==='promoters') c.innerHTML = renderPromoters();
  else if(currentTab==='schedule') c.innerHTML = renderSchedule();
  else if(currentTab==='sales') c.innerHTML = renderSales();
  else c.innerHTML = renderReports();
  if(currentTab==='reports') wireReportControls();
  if(currentTab==='sales') wireStockExportControls();
}

// ---------- Service worker (offline shell + installability) ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js').catch(err=>console.warn('SW registration failed', err));
  });
}

// ---------- Init ----------
boot();
