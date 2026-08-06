// ============================================================
// Admin auth — every admin now signs in with their own email +
// password (same mechanism as the promoter app), then types their
// name once so everything they save in the database can be
// attributed to them. Session persists on the device until they log
// out from the identity chip in the header.
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

// The `users` table row for the currently signed-in admin — created the
// first time they log in, when they type their name. Looked up by
// auth_user_id (see migration_admin_login.sql).
const AdminDirectory = {
  async getMyRow(authUserId){
    const { data, error } = await sb
      .from('users')
      .select('id, full_name, email')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if(error) throw error;
    return data;
  },
  async createMyRow(authUserId, email, full_name){
    const { data, error } = await sb
      .from('users')
      .insert({ auth_user_id: authUserId, email, full_name, role: 'admin' })
      .select('id, full_name, email')
      .single();
    if(error) throw error;
    return data;
  }
};
