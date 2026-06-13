/**
 * Folio 前端配置。
 * Supabase publishable/anon key 设计上即为公开值（数据由 RLS 保护），可安全内联。
 * 静态部署（含子路径）时本文件是唯一配置来源，无需服务端 /api/config。
 */
window.__FOLIO_CONFIG = {
  supabaseUrl: 'https://ejlenbosfqcmrybnrbok.supabase.co',
  supabaseAnonKey: 'sb_publishable_MvCO9HjbkxxANz8zi0GVOg_ySBeQyL-'
};
