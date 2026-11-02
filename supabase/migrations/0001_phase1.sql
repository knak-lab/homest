-- homest Phase 1: 世帯・メンバー・要望（マインドマップ）・優先順位・添付
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。

create extension if not exists pgcrypto;

-- ───────────── 世帯・メンバー ─────────────
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'わが家',
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  display_name text not null,
  color text not null default '#2563eb',
  created_at timestamptz not null default now(),
  primary key (user_id, household_id)
);

-- RLS 用：自分がその世帯のメンバーか
create or replace function public.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where household_id = hid and user_id = auth.uid());
$$;

-- ───────────── 要望（マインドマップのノード） ─────────────
create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  parent_id uuid references public.wishes(id) on delete cascade, -- null = 中心ノード
  title text not null default '',
  note text not null default '',
  color text not null default '#ffffff',
  x double precision not null default 0,
  y double precision not null default 0,
  collapsed boolean not null default false,
  in_priority boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wishes_household_idx on public.wishes(household_id);
create index if not exists wishes_parent_idx on public.wishes(parent_id);

-- ───────────── 優先順位（あなた／パートナー／合意の3層） ─────────────
-- rater = 評価したメンバーの user_id（文字列）または 'agreed'
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  target_type text not null default 'wish' check (target_type in ('wish')),
  target_id uuid not null,
  rater text not null,
  rank text check (rank in ('must', 'want', 'nice')),
  updated_at timestamptz not null default now(),
  unique (target_type, target_id, rater)
);
create index if not exists ratings_household_idx on public.ratings(household_id);

-- ───────────── 添付（リンク・画像） ─────────────
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  target_type text not null check (target_type in ('wish', 'land', 'builder', 'area', 'agency')),
  target_id uuid not null,
  kind text not null check (kind in ('link', 'image')),
  url text,
  storage_path text,
  caption text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists attachments_target_idx on public.attachments(target_type, target_id);

-- 要望を消したら、その評価と添付の行も消す（画像ファイル本体はアプリ側で削除）
create or replace function public.cleanup_wish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.ratings where target_type = 'wish' and target_id = old.id;
  delete from public.attachments where target_type = 'wish' and target_id = old.id;
  return old;
end $$;
drop trigger if exists wishes_cleanup on public.wishes;
create trigger wishes_cleanup after delete on public.wishes
  for each row execute function public.cleanup_wish();

-- ───────────── RLS ─────────────
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.wishes enable row level security;
alter table public.ratings enable row level security;
alter table public.attachments enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households for select to authenticated using (public.is_member(id));
drop policy if exists households_update on public.households;
create policy households_update on public.households for update to authenticated using (public.is_member(id));

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated using (public.is_member(household_id));
drop policy if exists members_update_self on public.members;
create policy members_update_self on public.members for update to authenticated using (user_id = auth.uid());

drop policy if exists wishes_all on public.wishes;
create policy wishes_all on public.wishes for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- 評価：読むのは世帯全員、書けるのは「自分の評価」と「合意」だけ
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings for select to authenticated using (public.is_member(household_id));
drop policy if exists ratings_write on public.ratings;
create policy ratings_write on public.ratings for all to authenticated
  using (public.is_member(household_id) and (rater = auth.uid()::text or rater = 'agreed'))
  with check (public.is_member(household_id) and (rater = auth.uid()::text or rater = 'agreed'));

drop policy if exists attachments_all on public.attachments;
create policy attachments_all on public.attachments for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ───────────── 世帯の作成・参加（RPC） ─────────────
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.households(name) values (coalesce(nullif(p_name, ''), 'わが家')) returning id into hid;
  insert into public.members(user_id, household_id, display_name, color)
    values (auth.uid(), hid, p_display_name, '#2563eb');
  insert into public.wishes(household_id, title, x, y, color)
    values (hid, 'ふたりの暮らし', 0, 0, '#fde68a');
  return hid;
end $$;

create or replace function public.join_household(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid; n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into hid from public.households where invite_code = trim(p_code);
  if hid is null then raise exception '招待コードが見つかりません'; end if;
  if exists (select 1 from public.members where household_id = hid and user_id = auth.uid()) then
    return hid;
  end if;
  select count(*) into n from public.members where household_id = hid;
  if n >= 2 then raise exception 'この世帯はすでに2人います'; end if;
  insert into public.members(user_id, household_id, display_name, color)
    values (auth.uid(), hid, p_display_name, '#ea580c');
  return hid;
end $$;

grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;

-- ───────────── Storage（画像） ─────────────
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
  on conflict (id) do nothing;

drop policy if exists homest_attach_select on storage.objects;
create policy homest_attach_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists homest_attach_insert on storage.objects;
create policy homest_attach_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists homest_attach_delete on storage.objects;
create policy homest_attach_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));
