-- homest Phase 3: 建物（建築会社）と、評価項目の表示切り替え
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。

create table if not exists public.builders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null default 'ハウスメーカー' check (type in ('ハウスメーカー', '設計事務所', '工務店', 'リノベ会社')),
  name text not null,
  branch text not null default '',
  contact text not null default '',
  url text not null default '',
  tsubo_price numeric,   -- 坪単価の目安（万円/坪）
  estimate numeric,      -- 見積額・概算（万円）
  status text not null default '情報収集',
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists builders_household_idx on public.builders(household_id);

drop trigger if exists builders_cleanup on public.builders;
create trigger builders_cleanup after delete on public.builders for each row execute function public.cleanup_target();

alter table public.builders enable row level security;
drop policy if exists builders_all on public.builders;
create policy builders_all on public.builders for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- 評価項目ごとに「この対象（土地／建物）では使わない」を設定できるように
alter table public.criteria add column if not exists hidden boolean not null default false;
