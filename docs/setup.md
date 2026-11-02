# homest セットアップ手順（スマホでOK）

所要時間：15〜20分。上から順番に進めてください。

## A. Supabase

### 1. プロジェクトを作る
1. supabase.com にログイン →「New project」
2. Name：`homest`／Region：**Northeast Asia (Tokyo)**
3. Database Password は自動生成でOK（パスワード管理アプリなどに保存しておく）
4. 作成完了まで1〜2分待つ

### 2. テーブルを作る（SQLを実行）
1. スマホのブラウザで次のURLを開く（SQLの本文だけが表示されます）
   `https://raw.githubusercontent.com/knak-lab/homest/main/supabase/migrations/0001_phase1.sql`
2. 長押し →「すべて選択」→ コピー
3. Supabase の左メニュー **SQL Editor** →「New query」に貼り付けて **Run**
4. 「Success. No rows returned」と出ればOK

### 3. ログイン用の戻り先URLを設定
**Authentication → URL Configuration**
- Site URL：`https://knak-lab.github.io/homest/`
- Redirect URLs に追加：`https://knak-lab.github.io/homest/**`

### 4. 接続情報を確認する
**Project Settings → API Keys**（または Data API）で、次の2つを確認する
- Project URL（`https://xxxx.supabase.co`）
- **anon（public）key**、または **publishable key**（`sb_publishable_...`）

⚠️ `service_role` / `secret` のキーは絶対に使わない。チャットにも貼らない。

## B. GitHub（knak-lab/homest）

### 5. Secrets を登録する
**Settings → Secrets and variables → Actions → New repository secret** で2つ登録する

| Name | Secret |
|---|---|
| `VITE_SUPABASE_URL` | 手順4の Project URL |
| `VITE_SUPABASE_ANON_KEY` | 手順4の anon / publishable key |

### 6. Pages を有効にする
**Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする

### 7. デプロイする
**Actions** タブ →「Deploy to GitHub Pages」→ **Run workflow**
（最初のpushはSecrets登録前なので失敗しています。ここで動かし直します）
緑のチェックが付けば完了（2分ほど）。

## C. 動作確認

8. `https://knak-lab.github.io/homest/` を開く
9. メールアドレスを入力 → 届いたメールのリンクをタップ → ログイン
10. 表示名を入れて「はじめる」
11. 「ふたりの暮らし」をタップ →「子を追加」で、思いつくことをどんどん追加
12. ⚙️ 設定 →「招待リンクを送る」でパートナーに送る（パートナーはリンクを開いてログイン → 「参加する」）

### 補足
- Supabase の無料プランでは、ログインメールは1時間に数通までしか送れません。届かないときは少し待ってから再送してください。
- ホーム画面に追加すると、アプリのように開けます（Chrome のメニュー →「ホーム画面に追加」）。
