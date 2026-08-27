import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		exclude: ['tests/e2e/**', 'node_modules/**'],
		// verbose reporter 才會把測試裡的 console.log（CHECKLIST_TOTAL=、BLACKLIST_TERMS=）印到 npm test 輸出
		reporters: ['verbose'],
	},
});
