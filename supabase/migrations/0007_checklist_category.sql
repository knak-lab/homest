-- homest: チェックリストの項目にカテゴリを持たせる（自分で足した項目もカテゴリに入れられるように）
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。
alter table public.checklist_items add column if not exists category text;
notify pgrst, 'reload schema';
