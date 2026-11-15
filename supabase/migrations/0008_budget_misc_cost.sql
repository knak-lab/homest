-- homest: 予算に諸経費（登記・仲介手数料・ローン手数料・火災保険など）を手入力する欄を追加
-- Supabase の SQL Editor に貼り付けて、一度だけ実行してください。
alter table public.house_plans add column if not exists misc_cost numeric; -- 諸経費（万円）。空ならお金ちゃんLPの諸経費率で計算
