import { defineConfig } from '@playwright/test';

// e2e 對 astro preview 跑（需先 npm run build 產出 dist/；npm test 會建）。
// Astro 7 的 preview 偵測到 agent 環境（環境變數 CLAUDECODE）會自動改成背景 daemon，
// Playwright 會誤判 server 提早退出，所以啟動前先 env -u 拿掉它；一般終端機不受影響。
// 4321 被別的 preview 佔住時，用 E2E_PORT=<port> 換埠（不會重用既有 server，永遠測剛 build 的 dist/）。
const port = Number(process.env.E2E_PORT ?? 4321);

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 60_000,
	use: { baseURL: `http://localhost:${port}` },
	webServer: {
		command: `env -u CLAUDECODE npm run preview -- --port ${port} --host 127.0.0.1`,
		url: `http://localhost:${port}/`,
		reuseExistingServer: false,
		timeout: 60_000,
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
