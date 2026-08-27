# 部署（收工後由你照順序做）

站在 Cloudflare Workers 靜態資產上，掛 `training.angus-lu.cc`；code 放個人 GitHub，push 到 `main` 由 GitHub Actions 自動部署。
以下步驟 agent 不做（不建遠端 repo、不 push、不 `wrangler login`／`deploy`）。

1. 練習 repo 先上 GitHub（教材裡的 clone 指令指向它）：

   ```bash
   cd practice && gh repo create AngusLu0731/claude-code-practice --public --source . --push
   ```

2. 教材站 repo 建遠端，**先不要 push**（等 secrets 設好，第一次 push 才會觸發部署）：

   ```bash
   cd site && gh repo create AngusLu0731/claude-code-training --public --source .
   ```

3. Cloudflare 建 API token：Dashboard → My Profile → API Tokens → Create Token，用範本 **Edit Cloudflare Workers**；
   Zone Resources 必須包含 `angus-lu.cc`，再加一條 **Zone → DNS → Edit**（custom domain 要能建 DNS 記錄）。
   同時記下 **Account ID**（Workers & Pages 頁右側）。

4. 把兩個 secrets 放進教材站 repo：

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN -R AngusLu0731/claude-code-training
   gh secret set CLOUDFLARE_ACCOUNT_ID -R AngusLu0731/claude-code-training
   ```

5. 第一次部署在本機做（會建 Worker、custom domain 與憑證）：

   ```bash
   cd site
   npx wrangler login
   npm run build && npx wrangler deploy
   npm run check:live   # 印 LIVE_OK 才算上線
   ```

6. push，之後每次 push 到 `main` 都自動部署：

   ```bash
   git push -u origin main
   ```

   到 GitHub Actions 看 `deploy` 是綠的。

7. 找一位有 Claude Code 基礎、沒用過進階功能的同事試讀（只給網址），紀錄他問的每個問題，補進教材後再驗一次。

## 本機驗證（不部署、不登入）

```bash
npx wrangler deploy --dry-run --outdir /tmp/wr
```

## 更新教材

改 `src/content/docs/*.mdx` → `npm test`（build＋content＋blacklist）→ `npm run e2e` → commit → push。
