// Cloudflare Worker: serves static assets + /api/config (same contract as server.js).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/config') {
      return Response.json({
        supabaseUrl: env.SUPABASE_URL || '',
        supabaseAnonKey: env.SUPABASE_ANON_KEY || ''
      });
    }
    return env.ASSETS.fetch(request);
  }
};
