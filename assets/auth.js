/**
 * Folio Auth – Supabase Google OAuth (redirect) + email OTP.
 * 配置缺失时返回 null client，应用进入本地试用模式。
 */
const FolioAuth = (() => {
  let client = null;
  let config = null;

  async function getConfig() {
    if (config) return config;
    try {
      const res = await fetch('/api/config');
      config = await res.json();
    } catch {
      config = {};
    }
    return config;
  }

  function isConfigured(cfg) {
    return cfg.supabaseUrl && cfg.supabaseAnonKey &&
      !cfg.supabaseUrl.startsWith('YOUR_') && !cfg.supabaseAnonKey.startsWith('YOUR_');
  }

  async function getClient() {
    if (client) return client;
    const cfg = await getConfig();
    if (!isConfigured(cfg) || !window.supabase) return null;
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return client;
  }

  async function getSession() {
    const c = await getClient();
    if (!c) return null;
    const { data } = await c.auth.getSession();
    return data.session;
  }

  async function signInWithGoogle() {
    const c = await getClient();
    await c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/app' }
    });
  }

  async function sendEmailOtp(email) {
    const c = await getClient();
    const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  }

  async function verifyEmailOtp(email, token) {
    const c = await getClient();
    const { error } = await c.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  }

  async function signOut() {
    const c = await getClient();
    if (c) await c.auth.signOut();
    window.location.href = '/';
  }

  return { getClient, getSession, signInWithGoogle, sendEmailOtp, verifyEmailOtp, signOut };
})();
