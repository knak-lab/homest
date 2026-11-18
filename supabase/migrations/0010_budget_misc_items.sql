-- homest: 諸経費の内訳（付帯工事・その他工事・別途工事・諸費用・土地関係費用・家具家電・引越しなど）を入れる欄を追加
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。
alter table public.house_plans add column if not exists misc_items jsonb; -- { 項目キー: 万円 }。入っていれば合計を諸経費（misc_cost）にする
