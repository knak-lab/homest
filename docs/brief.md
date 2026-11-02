# homest（家づくりアプリ）実装指示書（v0.2）

## 1. 目的
夫婦2人で「どんな暮らしをしたいか」を拡げ、優先順位をつけ、その軸で土地候補・建物候補（建築会社）を比較検討するためのアプリ。
まずは自分たち夫婦用に作り、うまくいけば一般公開も視野に入れる（＝最初から複数世帯に対応したデータ構造にしておく）。

## 2. 前提・技術スタック
- React + Vite + Tailwind CSS、GitHub Pages でホスティング
- バックエンド：Supabase（Auth / Postgres / Storage / RLS）
- **スマホ（Pixel 9a 程度）がメイン**。PCでも崩れずに使えればよい
- マインドマップ：`@xyflow/react`（React Flow）を想定（タッチでのピンチズーム・パン・ドラッグに対応）
- 画像は端末側で圧縮してからアップロード（例：`browser-image-compression`、長辺1600px・品質0.8程度）

## 3. スコープ
### 今回やる
1. 暮らしで実現したいこと（マインドマップ）
2. 優先順位（Must / Want / Nice）
3. 土地（地域ベース／不動産会社ベース＋比較マトリックス）
4. 建物（建築会社ごと＋比較マトリックス）
5. 要望・土地・建物すべてに付けられるリンク・画像の添付

### 今回やらない（後で追加できる構造にしておく）
- 予算（内訳・総額）：打ち合わせ後に追加
- マインドマップの関連線（別の枝同士をつなぐ線）
- リンクのOGP（サムネイル）の自動取得
- お金ちゃんとの連携

## 4. 画面構成
下部タブナビ：**暮らし／優先順位／土地／建物**（設定はヘッダー右上から）

### 4-1. 暮らしで実現したいこと（マインドマップ）
- 中心ノード「ふたりの暮らし」から、360°自由に子ノードを拡げる
- ノードの子の数・階層の深さに上限は設けない（木構造。親は1つだけ）
- **スマホでの操作**
  - 空白部分をドラッグ：パン／ピンチ：ズーム／ノードをドラッグ：移動
  - ノードをタップ：選択。画面下部にアクションバーを表示
    - ［＋子を追加］［編集］［折りたたむ／開く］［ここを中心に表示］［削除］
  - 子を追加すると、親から見て中心と反対方向に、既存の兄弟と重ならない角度で自動配置する（放射状）。配置後は自由に動かせる
  - 編集はボトムシートで行う：タイトル、メモ、色、添付（リンク・画像）、「優先順位に載せる」スイッチ
  - 子を持つノードを削除するときは「配下もまとめて削除」の確認を出す
  - ［全体表示］ボタン（fitView）
- 折りたたみ状態でも、配下ノードの数をバッジで表示する
- ノードには作成者（あなた／パートナー）を小さな色ドットで表示する
- 位置はドラッグ終了時にデバウンスして自動保存する

### 4-2. 優先順位
- 対象：「優先順位に載せる」がONの要望ノード
- 評価者の切り替え（セグメント）：**あなた／パートナー／ふたりの合意**
- 表示：Must・Want・Nice・未分類の4つのレーン（スマホでは縦に積む）
  - スマホではドラッグを使わず、カードをタップして Must / Want / Nice を選ぶ方式にする
- **比較ビュー**：要望ごとに3者の評価を横並びで表示し、あなたとパートナーで評価がズレている行を強調する
  - ここから合意の評価を設定できる
- カードをタップすると、マインドマップで付けたメモ・リンク・画像を確認できる

### 4-3. 土地
- 一覧の切り替え：**地域ベース**（エリア → 候補地）／**不動産会社ベース**（不動産会社 → 候補地）
  - データは1つで、グルーピングだけを切り替える
- 候補地カード：名前、価格、坪数、ステータス（検討中／見学済／見送り など）、サムネイル画像
- 詳細画面：基本情報、メモ、添付、評価
- エリア・不動産会社もそれぞれメモ・添付を持てる
- **比較マトリックス**：4-5 を参照

### 4-4. 建物
- 建築会社の種別：ハウスメーカー／設計事務所／工務店／リノベ会社（チップで絞り込み）
- カード・詳細画面は土地と同じ作りにする
- **比較マトリックス**：4-5 を参照

### 4-5. 比較マトリックス（土地・建物で共通のコンポーネント）
- スマホ表示：行＝評価項目、列＝候補。1列目（評価項目）を固定し、横スクロールで見る
- 評価者の切り替え：あなた／パートナー／共通
- 評価項目
  - 要望ノードから作成できる（合意の優先度を引き継ぐ）。手動でも追加できる
  - 各セルは **〇（2点）／△（1点）／✕（0点）** で評価（scores.score に 3/2/1 で保存）
  - 重み：Must 5／Want 3／Nice 1
- 総合点 ＝ 評価済みの項目について Σ（重み × 点）÷ Σ（重み × 2）× 100
- **共通**＝2人の評価の平均を自動計算。必要なセルだけ手動で上書きできる（rater='agreed'）
- Mustの共通評価が✕の候補は列をグレーアウト（足切り）
- 2人の評価がちがうセルは黄色で強調
- 各セルにメモを残せる（セルをタップするとボトムシートが開く）

## 5. データ設計（Supabase）
すべてのテーブルに `household_id` を持たせ、RLSで「自分の世帯のデータのみ読み書きできる」ように制御する。

| テーブル | 主なカラム |
|---|---|
| households | id, name, created_at |
| members | user_id (auth.users), household_id, display_name, color |
| wishes | id, household_id, parent_id (null=中心), title, note, color, x, y, collapsed, in_priority (bool), created_by, created_at, updated_at |
| ratings | id, household_id, target_type ('wish'), target_id, rater（メンバーの user_id 文字列 または 'agreed'）, rank ('must'\|'want'\|'nice'\|null) |
| attachments | id, household_id, target_type ('wish'\|'land'\|'builder'\|'area'\|'agency'), target_id, kind ('link'\|'image'), url, storage_path, caption, created_by, created_at |
| areas | id, household_id, name, note, sort |
| agencies | id, household_id, name, branch, contact, note |
| lands | id, household_id, area_id, agency_id, name, address, price, tsubo, status, url, note |
| builders | id, household_id, type, name, url, contact, note, status |
| criteria | id, household_id, target ('land'\|'builder'), name, wish_id (nullable), rank ('must'\|'want'\|'nice'), sort |
| scores | id, household_id, criteria_id, target_id, rater（user_id 文字列 または 'agreed'）, pass (bool, Must用), score (1-5, Want/Nice用), memo |

- 一意制約：ratings（target_type, target_id, rater）、scores（criteria_id, target_id, rater）
  - rater を1列にしたのは upsert をシンプルにするため。RLSで「自分の user_id か 'agreed'」だけ書き込めるようにする
- `wishes.parent_id` は ON DELETE CASCADE にする
- 画像は Storage バケット `attachments`（非公開）に置き、パスは `household_id/...` とする。表示には署名付きURLを使う
- 予算は将来 `budget_items` テーブルを追加する想定

## 6. 認証・世帯
- Supabase Auth（メールリンク または Googleログイン）
- 初回ログイン時に世帯を作成する。パートナーは招待リンク（世帯IDを含むトークン）から参加する
- MVPでは1世帯2名を前提にする

## 7. 開発フェーズ
1. **Phase 1**：認証・世帯、マインドマップ、要望への添付、優先順位（3層＋比較ビュー）
2. **Phase 2**：土地（エリア・不動産会社・候補地）、評価項目、比較マトリックス
3. **Phase 3**：建物（比較マトリックスは Phase 2 のコンポーネントを流用）
4. **以降**：予算、Realtimeによる夫婦の同時編集、関連線、OGP取得、一般公開対応

## 8. Claude Code への補足
- フェーズごとにSupabaseのマイグレーションSQLを `supabase/migrations/` に出力すること
- RLSポリシーは各テーブルで必ず有効にすること
- APIキー（anon key 以外）はクライアントに置かないこと
- スマホ実機での操作感（タップ領域44px以上、ボトムシート中心のUI）を優先すること
