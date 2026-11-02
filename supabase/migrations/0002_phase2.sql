-- homest Phase 2: 土地（エリア・不動産会社・候補地）と比較マトリックス（評価項目・点数）
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。

-- ───────── エリア・不動産会社・候補地 ─────────
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  note text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  branch text not null default '',
  contact text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.lands (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  agency_id uuid references public.agencies(id) on delete set null,
  name text not null,
  address text not null default '',
  price numeric,          -- 万円
  tsubo numeric,          -- 坪
  status text not null default '検討中',
  url text not null default '',
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lands_household_idx on public.lands(household_id);

-- ───────── 比較マトリックス（土地・建物で共通） ─────────
create table if not exists public.criteria (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  target text not null check (target in ('land', 'builder')),
  name text not null,
  wish_id uuid references public.wishes(id) on delete set null,
  rank text not null default 'want' check (rank in ('must', 'want', 'nice')),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists criteria_household_idx on public.criteria(household_id, target);

-- rater = 評価したメンバーの user_id（文字列）または 'agreed'
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  criteria_id uuid not null references public.criteria(id) on delete cascade,
  target_id uuid not null,
  rater text not null,
  pass boolean,                                   -- Must 用（〇／✕）
  score int check (score between 1 and 5),        -- Want/Nice 用
  memo text not null default '',
  updated_at timestamptz not null default now(),
  unique (criteria_id, target_id, rater)
);
create index if not exists scores_household_idx on public.scores(household_id);

-- 添付の対象に土地などが増えたので、消したときの後片付け
create or replace function public.cleanup_target() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.scores where target_id = old.id;
  delete from public.attachments where target_id = old.id;
  return old;
end $$;
drop trigger if exists lands_cleanup on public.lands;
create trigger lands_cleanup after delete on public.lands for each row execute function public.cleanup_target();
drop trigger if exists areas_cleanup on public.areas;
create trigger areas_cleanup after delete on public.areas for each row execute function public.cleanup_target();
drop trigger if exists agencies_cleanup on public.agencies;
create trigger agencies_cleanup after delete on public.agencies for each row execute function public.cleanup_target();

-- ───────── RLS ─────────
alter table public.areas enable row level security;
alter table public.agencies enable row level security;
alter table public.lands enable row level security;
alter table public.criteria enable row level security;
alter table public.scores enable row level security;

drop policy if exists areas_all on public.areas;
create policy areas_all on public.areas for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
drop policy if exists agencies_all on public.agencies;
create policy agencies_all on public.agencies for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
drop policy if exists lands_all on public.lands;
create policy lands_all on public.lands for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
drop policy if exists criteria_all on public.criteria;
create policy criteria_all on public.criteria for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- 点数：読むのは世帯全員、書けるのは「自分の点数」と「合意」だけ
drop policy if exists scores_select on public.scores;
create policy scores_select on public.scores for select to authenticated using (public.is_member(household_id));
drop policy if exists scores_write on public.scores;
create policy scores_write on public.scores for all to authenticated
  using (public.is_member(household_id) and (rater = auth.uid()::text or rater = 'agreed'))
  with check (public.is_member(household_id) and (rater = auth.uid()::text or rater = 'agreed'));
