-- homest: 優先順位の並び替え（Must/Want/Nice の中での順番を、評価者ごとに保存）
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。
alter table public.ratings add column if not exists sort int not null default 0;

-- アプリから新しい列が見えるように、APIの定義を読み込み直す
notify pgrst, 'reload schema';
