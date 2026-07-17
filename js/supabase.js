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

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// DB — thin wrapper around every table this app touches.
// Field names match sql/schema.sql exactly.
// ============================================================
const DB = {

  // ---------------- Promoters ----------------
  async getPromoters(){
    const { data, error } = await supabase
      .from('promoters')
      .select('*')
      .order('full_name');
    if(error) throw error;
    return data;
  },

  async addPromoter(promoter){
    const { data, error } = await supabase
      .from('promoters')
      .insert(promoter)
      .select()
      .single();
    if(error) throw error;
    return data;
  },

  async updatePromoter(id, promoter){
    const { error } = await supabase
      .from('promoters')
      .update(promoter)
      .eq('id', id);
    if(error) throw error;
  },

  async deletePromoter(id){
    const { error } = await supabase
      .from('promoters')
      .delete()
      .eq('id', id);
    if(error) throw error;
  },

  // ---------------- Stores ----------------
  async getStores(){
    const { data, error } = await supabase
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
    const { data: existing, error: findErr } = await supabase
      .from('stores')
      .select('*')
      .ilike('name', trimmed)
      .limit(1);
    if(findErr) throw findErr;
    if(existing && existing.length) return existing[0];

    const { data: created, error: insErr } = await supabase
      .from('stores')
      .insert({ name: trimmed })
      .select()
      .single();
    if(insErr) throw insErr;
    return created;
  },

  // ---------------- Jobs ----------------
  async getJobs(){
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        id, work_date, start_time, end_time, pay, commission, remarks,
        promoter_id, store_id,
        promoters ( id, full_name ),
        stores ( id, name )
      `)
      .order('work_date');
    if(error) throw error;
    return data;
  },

  async addJob(job){
    const { data, error } = await supabase
      .from('jobs')
      .insert(job)
      .select()
      .single();
    if(error) throw error;
    return data;
  },

  async updateJob(id, job){
    const { error } = await supabase
      .from('jobs')
      .update(job)
      .eq('id', id);
    if(error) throw error;
  },

  async deleteJob(id){
    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id);
    if(error) throw error;
  }
};
