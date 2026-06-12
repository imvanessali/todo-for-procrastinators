-- Folio: todos 表 + RLS（在 Supabase Dashboard → SQL Editor 执行，或 supabase db push）
create table public.todos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null,
  day          date not null,                    -- 所属页（today / tomorrow 的具体日期）
  position     double precision not null default 0,
  done         boolean not null default false,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index todos_user_day_idx on public.todos (user_id, day);

alter table public.todos enable row level security;

create policy "own todos" on public.todos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
