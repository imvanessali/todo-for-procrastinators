-- Folio: 重复任务支持。在 Supabase Dashboard → SQL Editor 执行。
alter table public.todos
  add column if not exists repeat text,      -- null | daily | weekdays | weekly | monthly
  add column if not exists series uuid;       -- 同一条重复链共用的 id
