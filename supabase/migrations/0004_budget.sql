-- homest Phase 4: 予算（家の総額・借入額の試算）。お金ちゃんの「家」タブからも同じ画面を埋め込んで使う
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。

-- 世帯ごとに1行。候補地・建築会社を選ぶと値が入り、手で上書きもできる
create table if not exists public.house_plans (
  household_id uuid primary key references public.households(id) on delete cascade,
  land_id uuid references public.lands(id) on delete set null,
  builder_id uuid references public.builders(id) on delete set null,
  land_price numeric,      -- 土地代（万円）
  land_area numeric,       -- 土地の面積（m²）
  coverage_ratio numeric,  -- 建ぺい率（%）
  tsubo_price numeric,     -- 建築の坪単価（万円/坪）
  down_payment numeric,    -- 頭金（万円）
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.house_plans enable row level security;
drop policy if exists house_plans_all on public.house_plans;
create policy house_plans_all on public.house_plans for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
