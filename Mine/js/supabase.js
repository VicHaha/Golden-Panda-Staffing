// ============================================================
// Supabase client — using your project's credentials.
// ============================================================
const SUPABASE_URL = "https://rlzgoavqbcjjumkiitbb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsemdvYXZxYmNqanVta2lpdGJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNzQ3NzAsImV4cCI6MjA5OTg1MDc3MH0.wE7cS3l2SxgeG5wmUs4FXrem3wWXhyAymOxO-CLysLI";

if(typeof window.supabase === 'undefined'){
  // The SDK script (js/vendor/supabase-sdk.js) failed to load or run.
  // Fail loudly here instead of letting every later file throw
  // "DB is not defined" with no clue as to why.
  throw new Error('Supabase SDK did not load — check that js/vendor/supabase-sdk.js exists and loads before js/supabase.js in index.html.');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Invisible office sign-in.
//
// sales_reports now requires a signed-in session to write to (see
// sql/migration_auth_lockdown.sql) so that the promoter-facing app can
// enforce a real password. This app has no login screen and isn't meant
// to — instead it signs in automatically, in the background, using one
// shared "office" account. Office staff never see this happen.
//
// SETUP REQUIRED: create this account once in Supabase Dashboard →
// Authentication → Users → Add user, then put the same email/password
// here. See the README for the exact steps.
// ============================================================
const OFFICE_AUTH_EMAIL = "office@goldenpanda.internal";
const OFFICE_AUTH_PASSWORD = "REPLACE_WITH_THE_PASSWORD_YOU_SET_IN_SUPABASE";

let officeSignInPromise = sb.auth.signInWithPassword({
  email: OFFICE_AUTH_EMAIL,
  password: OFFICE_AUTH_PASSWORD
}).then(({ error }) => {
  if(error) console.error('Office auto sign-in failed — sales report saving will not work until this is fixed:', error.message);
});

// ============================================================
// DB — thin wrapper around every table this app touches.
// Field names match sql/schema.sql exactly.
// ============================================================
const DB = {

  // ---------------- Promoters ----------------
  async getPromoters(){
    const { data, error } = await sb
      .from('promoters')
      .select('*')
      .order('full_name');
    if(error) throw error;
    return data;
  },

  async addPromoter(promoter){
    const { data, error } = await sb
      .from('promoters')
      .insert(promoter)
      .select()
      .single();
    if(error) throw error;
    return data;
  },

  async updatePromoter(id, promoter){
    const { error } = await sb
      .from('promoters')
      .update(promoter)
      .eq('id', id);
    if(error) throw error;
  },

  async deletePromoter(id){
    const { error } = await sb
      .from('promoters')
      .delete()
      .eq('id', id);
    if(error) throw error;
  },

  // ---------------- Stores ----------------
  async getStores(){
    const { data, error } = await sb
      .from('stores')
      .select('*')
      .order('name');
    if(error) throw error;
    return data;
  },

  // Finds a store by name (case-insensitive) or creates it if it doesn't exist yet.
  // Lets the roadshow form accept free-text store names without a separate "manage stores" screen.
  async getOrCreateStore(name){
    const trimmed = name.trim();
    const { data: existing, error: findErr } = await sb
      .from('stores')
      .select('*')
      .ilike('name', trimmed)
      .limit(1);
    if(findErr) throw findErr;
    if(existing && existing.length) return existing[0];

    const { data: created, error: insErr } = await sb
      .from('stores')
      .insert({ name: trimmed })
      .select()
      .single();
    if(insErr) throw insErr;
    return created;
  },

  // ---------------- Jobs ----------------
  async getJobs(){
    const { data, error } = await sb
      .from('jobs')
      .select(`
        id, work_date, start_time, end_time, pay, commission, remarks, position,
        promoter_id, store_id,
        promoters ( id, full_name ),
        stores ( id, name )
      `)
      .order('work_date');
    if(error) throw error;
    return data;
  },

  async addJob(job){
    const { data, error } = await sb
      .from('jobs')
      .insert(job)
      .select()
      .single();
    if(error) throw error;
    return data;
  },

  async updateJob(id, job){
    const { error } = await sb
      .from('jobs')
      .update(job)
      .eq('id', id);
    if(error) throw error;
  },

  async deleteJob(id){
    const { error } = await sb
      .from('jobs')
      .delete()
      .eq('id', id);
    if(error) throw error;
  },

  // Removes jobs older than 3 months to keep the schedule tidy.
  // Runs once per app load. NOTE: this also removes the underlying data
  // behind old Reports months — export any report you want to keep
  // before it ages past 3 months.
  async purgeOldJobs(){
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const { error } = await sb
      .from('jobs')
      .delete()
      .lt('work_date', cutoffStr);
    if(error) throw error;
  },

  // ---------------- Sales & stock reports ----------------
  async getSalesReports(){
    const { data, error } = await sb
      .from('sales_reports')
      .select(`
        id, work_date, store_id, promoter_id, product_name, opening_qty, sales_qty, closing_qty, remarks, photo_url,
        stores ( id, name ),
        promoters ( id, full_name )
      `)
      .order('work_date', { ascending: false });
    if(error) throw error;
    return data;
  },

  async addSalesReport(entry){
    const { data, error } = await sb
      .from('sales_reports')
      .insert(entry)
      .select()
      .single();
    if(error) throw error;
    return data;
  },

  async updateSalesReport(id, entry){
    const { error } = await sb
      .from('sales_reports')
      .update({ ...entry, updated_at: new Date().toISOString() })
      .eq('id', id);
    if(error) throw error;
  },

  async deleteSalesReport(id){
    const { error } = await sb
      .from('sales_reports')
      .delete()
      .eq('id', id);
    if(error) throw error;
  }
};
