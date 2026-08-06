// ============================================================
// Supabase client — same project as the main staffing app, so
// data written here shows up there too, and vice versa.
// ============================================================
const SUPABASE_URL = "https://rlzgoavqbcjjumkiitbb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsemdvYXZxYmNqanVta2lpdGJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNzQ3NzAsImV4cCI6MjA5OTg1MDc3MH0.wE7cS3l2SxgeG5wmUs4FXrem3wWXhyAymOxO-CLysLI";

if(typeof window.supabase === 'undefined'){
  throw new Error('Supabase SDK did not load — check that js/vendor/supabase-sdk.js exists and loads before js/supabase.js in index.html.');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Auth — each promoter signs in with their own email + password.
// Supabase persists the session in the browser automatically, so once
// logged in on a phone, they stay logged in until they log out.
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

// Only the reads/writes this stand-alone app needs — promoters and
// stores are read-only lookups here (managed from the main office app).
const DB = {

  async getPromoters(){
    const { data, error } = await sb
      .from('promoters')
      .select('id, full_name, nickname, active')
      .order('full_name');
    if(error) throw error;
    return data;
  },

  async getStores(){
    const { data, error } = await sb
      .from('stores')
      .select('*')
      .order('name');
    if(error) throw error;
    return data;
  },

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

  // Jobs are read-only here too — used to suggest working dates, and to
  // check whether this promoter has a shift tomorrow (see the shift
  // reminder banner in app.js).
  async getScheduledDates(){
    const { data, error } = await sb
      .from('jobs')
      .select('work_date')
      .order('work_date', { ascending: false });
    if(error) throw error;
    return [...new Set((data || []).map(j => j.work_date))];
  },

  // This promoter's job on one specific date (if any) — position, time,
  // and store, for the "you have a shift tomorrow" reminder banner.
  async getMyJobForDate(promoterId, date){
    const { data, error } = await sb
      .from('jobs')
      .select(`
        id, work_date, position, start_time, end_time,
        stores ( id, name )
      `)
      .eq('promoter_id', promoterId)
      .eq('work_date', date)
      .limit(1)
      .maybeSingle();
    if(error) throw error;
    return data;
  },

  // Full roster schedule (everyone's jobs, not just this promoter's) for
  // the read-only Schedule tab. No pay/commission — promoters can see
  // date, time, location and position for their own and others' shifts,
  // but never each other's pay.
  async getAllJobs(){
    const { data, error } = await sb
      .from('jobs')
      .select(`
        id, work_date, position, start_time, end_time, promoter_id,
        stores ( id, name ),
        promoters ( id, full_name, nickname )
      `)
      .order('work_date', { ascending: true });
    if(error) throw error;
    return data;
  },

  // This promoter's own pay for a given month — kept as a separate,
  // narrowly-scoped query (rather than adding pay to getAllJobs) so
  // other promoters' earnings are never fetched or shown here.
  async getMyPayForMonth(promoterId, monthStartStr, monthEndStr){
    const { data, error } = await sb
      .from('jobs')
      .select('work_date, pay, commission')
      .eq('promoter_id', promoterId)
      .gte('work_date', monthStartStr)
      .lte('work_date', monthEndStr);
    if(error) throw error;
    return data;
  },

  async getSalesReports(){
    const { data, error } = await sb
      .from('sales_reports')
      .select(`
        id, work_date, store_id, promoter_id, product_name, opening_qty, sales_qty, closing_qty, remarks, photo_url, is_free_item,
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

  // ---------------- Day photos (unlimited per working date) ----------------
  async getDayPhotos(){
    const { data, error } = await sb
      .from('day_photos')
      .select('*')
      .order('work_date', { ascending: false });
    if(error) throw error;
    return data;
  },

  // Each save inserts a new row rather than overwriting whatever's
  // already there for that date — any number of day photos allowed per date.
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

  // ---------------- Shift reports (engagement/conversion, per promoter/date/shift) ----------------
  async getShiftReports(){
    const { data, error } = await sb
      .from('shift_reports')
      .select(`
        id, work_date, shift, store_id, promoter_id, engaged, successful_engagements, purchases,
        avg_engagement_time, customer_age_range, customer_feedback, notes,
        stores ( id, name ),
        promoters ( id, full_name, nickname )
      `)
      .order('work_date', { ascending: false });
    if(error) throw error;
    return data;
  },

  async addShiftReport(entry){
    const { data, error } = await sb
      .from('shift_reports')
      .insert(entry)
      .select()
      .single();
    if(error) throw error;
    return data;
  },

  async updateShiftReport(id, entry){
    const { error } = await sb
      .from('shift_reports')
      .update({ ...entry, updated_at: new Date().toISOString() })
      .eq('id', id);
    if(error) throw error;
  },

  async deleteShiftReport(id){
    const { error } = await sb
      .from('shift_reports')
      .delete()
      .eq('id', id);
    if(error) throw error;
  },

  // Removes shift reports older than 3 months — same rolling cutoff the
  // office app applies to jobs/sales/day photos, so records age out of
  // both apps together. Runs once per app load; harmless to run twice.
  async purgeOldShiftReports(){
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const { error } = await sb
      .from('shift_reports')
      .delete()
      .lt('work_date', cutoffStr);
    if(error) throw error;
  }
};
