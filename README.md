# homest

ふたりの家づくりノート。暮らしのマインドマップ → 優先順位（Must / Want / Nice）→ 土地・建物の比較。

- 仕様：[docs/brief.md](docs/brief.md)
- セットアップ：[docs/setup.md](docs/setup.md)
- DB：`supabase/migrations/`（SQL Editorで順番に実行）

## 開発

```bash
cp .env.example .env.local   # Supabase の URL と anon key を入れる
npm install
npm run dev
```

スタック：React + Vite + Tailwind CSS v4 + React Flow + Supabase。GitHub Pages（Actions）にデプロイ。

## 進捗
- [x] Phase 1：ログイン・世帯／マインドマップ／リンク・画像の添付／優先順位（3層＋比較）
- [x] Phase 2：土地（エリア・不動産会社・候補地）＋比較マトリックス（SQL: 0002_phase2.sql）
- [x] Phase 3：建物（建築会社）＋比較マトリックス（SQL: 0003_phase3.sql）
