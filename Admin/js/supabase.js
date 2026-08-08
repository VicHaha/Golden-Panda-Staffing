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
// Auth — office staff sign in with their own email + password,
// same as promoters do in the stock report app. Supabase persists the
// session in the browser automatically, so once logged in on a device,
// staff stay logged in until they log out (see logOutAdmin in app.js).
//
// This replaces the old invisible single shared "office account"
// auto-login — sales_reports still requires an authenticated session to
// write (see sql/migration_auth_lockdown.sql), and now that requirement
// is met by whoever is actually signed in, not a hardcoded account.
// ============================================================
const Auth = {
  async getSession(){
    const { data, error } = await sb.auth.getSession();
    if(error) throw error;
    return data.session;
  },
  async signUp(email, password){
    const { data, error } = await sb.auth.signUp({ email, password });
    if(error) throw error;
    return data;
  },
  async signIn(email, password){
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error) throw error;
    return data;
  },
  async signOut(){
    const { error } = await sb.auth.signOut();
    if(error) throw error;
  }
};

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
        promoters ( id, full_name, nickname ),
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
        id, work_date, store_id, promoter_id, product_name, opening_qty, sales_qty, closing_qty, remarks, photo_url, is_free_item,
        store_room_qty, home_shelf_qty, standee_qty, warehouse_qty, logged_by_admin_name,
        stores ( id, name ),
        promoters ( id, full_name, nickname )
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
  },

  // Removes sales/stock reports older than 3 months, same cutoff as
  // purgeOldJobs, to keep the Supabase table small. NOTE: any photo_url
  // on a purged row points to Cloudinary, not Supabase Storage — deleting
  // the row does NOT delete the photo from Cloudinary; that's a separate
  // cleanup (Cloudinary dashboard or API) if you also need to reclaim
  // space there.
  async purgeOldSalesReports(){
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const { error } = await sb
      .from('sales_reports')
      .delete()
      .lt('work_date', cutoffStr);
    if(error) throw error;
  },

  // ---------------- Day photos (one overall photo per working date) ----------------
  async getDayPhotos(){
    const { data, error } = await sb
      .from('day_photos')
      .select('*')
      .order('work_date', { ascending: false });
    if(error) throw error;
    return data;
  },

  // Unlimited day photos per working date — each save inserts a new row
  // rather than overwriting whatever's already there for that date.
  async addDayPhoto(work_date, entry){
    const { data, error } = await sb
      .from('day_photos')
      .insert({ work_date, ...entry })
      .select()
      .single();
    if(error) throw error;
    return data;
  },

  // Edits one specific day photo already saved (by its row id) without
  // touching any other photo on the same date.
  async updateDayPhoto(id, entry){
    const { data, error } = await sb
      .from('day_photos')
      .update({ ...entry, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if(error) throw error;
    return data;
  },

  async deleteDayPhoto(id){
    const { error } = await sb
      .from('day_photos')
      .delete()
      .eq('id', id);
    if(error) throw error;
  },

  // Same 3-month cutoff as purgeOldJobs/purgeOldSalesReports. Same
  // Cloudinary caveat applies — the photo file itself isn't removed.
  async purgeOldDayPhotos(){
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const { error } = await sb
      .from('day_photos')
      .delete()
      .lt('work_date', cutoffStr);
    if(error) throw error;
  },

  // ---------------- Shift reports (read-only here — logged from the Promoters app) ----------------
  // Powers the Analysis tab's "Shift Engagement" view. No add/update/delete
  // here on purpose: promoters log these from their own app; the office
  // app only reads them for analysis.
  async getShiftReports(){
    const { data, error } = await sb
      .from('shift_reports')
      .select(`
        id, work_date, shift, store_id, promoter_id, engaged, successful_engagements, purchases,
        avg_engagement_time, customer_feedback, notes, customer_age_range,
        stores ( id, name ),
        promoters ( id, full_name, nickname )
      `)
      .order('work_date', { ascending: false });
    if(error) throw error;
    return data;
  }
};
