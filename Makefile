# 教材站常用指令。在 site/ 執行 `make <target>`；在上一層可用 `make -C site <target>`。
# 部署相關 target 只是包 DEPLOY.md 的步驟，不會自動跑；`make deploy` 需要 CONFIRM=yes。
.DEFAULT_GOAL := help
PORT ?= 4321
SHELL := /bin/bash

.PHONY: help install dev build preview preview-bg stop test e2e check check-live dry-run deploy clean

help:  ## 列出所有 target
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install:  ## npm ci ＋ 下載 playwright chromium
	npm ci
	npx playwright install chromium

dev:  ## 開發伺服器（即時重載，改 mdx 立刻看到）
	npm run dev -- --port $(PORT)

build:  ## astro build → dist/
	npm run build

preview:  ## 用 dist/ 起本機預覽（前景，Ctrl+C 結束；沒有 dist/ 會先 build）
	@test -f dist/index.html || $(MAKE) build
	env -u CLAUDECODE npx astro preview --port $(PORT) --host 127.0.0.1

preview-bg:  ## 背景預覽（用 make stop 關）
	@test -f dist/index.html || $(MAKE) build
	npx astro preview --background --port $(PORT) --host 127.0.0.1

stop:  ## 停掉背景的 preview
	npx astro preview stop

test:  ## build ＋ content ＋ blacklist 測試（需要 ~/.config/cc-training/blacklist.json）
	npm test

e2e:  ## playwright 持久化測試（用現有 dist/）
	npm run e2e

check: test e2e  ## test ＋ e2e 一次跑完

check-live:  ## 上線檢查（部署後跑，印 LIVE_OK 才算）
	npm run check:live

dry-run:  ## wrangler 部署演練（不登入、不上傳）
	npx wrangler deploy --dry-run --outdir /tmp/cc-training-wr

deploy:  ## 真正部署到 Cloudflare（需先 npx wrangler login；要加 CONFIRM=yes）
	@test "$(CONFIRM)" = "yes" || { echo "這會真的部署到 training.angus-lu.cc；確定的話：make deploy CONFIRM=yes"; exit 1; }
	$(MAKE) build
	npx wrangler deploy

clean:  ## 刪掉 dist/ 與 playwright 產物
	rm -rf dist test-results playwright-report
