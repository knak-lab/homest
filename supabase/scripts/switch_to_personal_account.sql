-- 共通アドレスで作った世帯を、個人のGoogleアカウントに付け替える（1回だけ実行）
-- 事前に：個人のGmailで一度 homest にログインしておくこと（世帯は作らなくてOK）
--
-- ▼ 下の1行のメールアドレスを、あなたの「個人のGmail」に書き換えてから Run
do $$
declare
  personal_email text := 'ここに個人のGmailアドレス';
  me uuid;
  hid uuid;
  shared uuid;
  n int;
begin
  select id into me from auth.users where lower(email) = lower(personal_email);
  if me is null then
    raise exception '% のアカウントが見つかりません。先にこのGmailで homest にログインしてください', personal_email;
  end if;

  -- 個人アカウントで誤って作った世帯があれば削除（自分しかいない世帯のみ）
  delete from public.households h
  where exists (select 1 from public.members m where m.household_id = h.id and m.user_id = me)
    and (select count(*) from public.members m where m.household_id = h.id) = 1
    and (select count(*) from public.wishes w where w.household_id = h.id) <= 1;

  -- 付け替え元の世帯（個人アカウント以外のメンバーが1人だけいる世帯）
  select m.household_id, m.user_id into hid, shared
  from public.members m
  where m.user_id <> me
  order by m.created_at
  limit 1;
  if hid is null then raise exception '付け替え元の世帯が見つかりません'; end if;

  select count(*) into n from public.members where household_id = hid;
  if n > 1 then raise exception 'この世帯にはすでに2人以上います。付け替えは不要かもしれません'; end if;

  -- メンバーを差し替え（表示名・色は引き継ぐ）
  insert into public.members (user_id, household_id, display_name, color)
    select me, household_id, display_name, color from public.members where user_id = shared and household_id = hid
  on conflict do nothing;
  delete from public.members where user_id = shared and household_id = hid;

  -- 作成者・評価を個人アカウントに付け替え
  update public.wishes set created_by = me where household_id = hid and created_by = shared;
  update public.attachments set created_by = me where household_id = hid and created_by = shared;
  update public.ratings set rater = me::text where household_id = hid and rater = shared::text;

  raise notice '付け替え完了：世帯 % を % に移しました', hid, personal_email;
end $$;
