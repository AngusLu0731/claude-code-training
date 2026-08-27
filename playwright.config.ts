import { defineConfig } from '@playwright/test';

// e2e 對 astro preview 跑（需先 npm run build 產出 dist/；npm test 會建）。
export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 60_000,
	use: { baseURL: 'http://localhost:4321' },
	webServer: {
		command: 'npm run preview -- --port 4321 --host 127.0.0.1',
		url: 'http://localhost:4321/',
		reuseExistingServer: false,
		timeout: 60_000,
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
