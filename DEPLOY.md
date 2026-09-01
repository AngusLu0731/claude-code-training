# 部署（收工後由你照順序做）

站在 Cloudflare Workers 靜態資產上，掛 `training.angus-lu.cc`；code 放個人 GitHub，push 到 `main` 由 GitHub Actions 自動部署。
以下步驟 agent 不做（不建遠端 repo、不 push、不 `wrangler login`／`deploy`）。

**起始目錄**：下面所有命令都從工作區根目錄 `~/Documents/project/cc-training/`（`site/` 與 `practice/` 的上一層）開始；每一步都假設你回到這裡。

1. 練習 repo 先上 GitHub（教材裡的 clone 指令指向它）：

   ```bash
   cd practice && gh repo create AngusLu0731/claude-code-practice --public --source . --push && cd ..
   ```

2. 教材站 repo 建遠端，**先不要 push**（等 secrets 設好，第一次 push 才會觸發部署）：

   ```bash
   cd site && gh repo create AngusLu0731/claude-code-training --public --source . && cd ..
   ```

3. Cloudflare 建 API token：Dashboard → My Profile → API Tokens → Create Token，用範本 **Edit Cloudflare Workers**。
   範本已含部署需要的 **Workers Scripts:Edit** 與 **Workers Routes:Edit**（custom domain 的 DNS 記錄與憑證由 Cloudflare 自動建立，不需要另外加 Zone DNS 權限）。
   把資源縮到最小：**Account Resources** 只選你的帳號、**Zone Resources** 只選 `angus-lu.cc`。
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
   cd ..
   ```

6. push，之後每次 push 到 `main` 都自動部署：

   ```bash
   cd site && git push -u origin main && cd ..
   ```

   到 GitHub Actions 看 `deploy` 是綠的。

7. 找一位有 Claude Code 基礎、沒用過進階功能的同事試讀（只給網址），紀錄他問的每個問題，補進教材後再驗一次。

## Makefile

常用指令都綁在 `make`（在 `site/` 執行，或在工作區根目錄用 `make -C site <target>`）：`make help` 列全部；`make preview` 本機看、`make check`（test＋e2e）、`make dry-run`；第 5 步可用 `make deploy CONFIRM=yes`（沒加 CONFIRM 只會提示不會動）。

## 本機驗證（不部署、不登入）

```bash
cd site && npx wrangler deploy --dry-run --outdir /tmp/wr && cd ..
```

## 更新教材

改 `site/src/content/docs/*.mdx` → `make -C site test`（build＋content＋blacklist）→ `make -C site e2e` → commit → push。
