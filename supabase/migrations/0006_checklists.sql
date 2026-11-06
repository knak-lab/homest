-- homest: 候補地・不動産会社・建築会社ごとのチェックリスト
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  target_type text not null check (target_type in ('land', 'agency', 'builder')),
  target_id uuid not null,
  text text not null,
  done boolean not null default false,
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists checklist_target_idx on public.checklist_items(target_type, target_id);
create index if not exists checklist_household_idx on public.checklist_items(household_id);

alter table public.checklist_items enable row level security;
drop policy if exists checklist_all on public.checklist_items;
create policy checklist_all on public.checklist_items for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- 候補地などを消したら、チェックリストも消す
create or replace function public.cleanup_target() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.scores where target_id = old.id;
  delete from public.attachments where target_id = old.id;
  delete from public.checklist_items where target_id = old.id;
  return old;
end $$;

notify pgrst, 'reload schema';
