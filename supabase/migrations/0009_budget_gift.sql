-- homest: 予算に親などからの贈与（住宅取得資金）を入れる欄を追加
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。
alter table public.house_plans add column if not exists gift numeric; -- 贈与（万円）。頭金に充てる
