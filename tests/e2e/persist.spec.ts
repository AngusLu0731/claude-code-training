/**
 * 自檢勾選持久化：勾一個 → 存 storageState → 關閉 context → 帶 state 重開仍勾、首頁 1/N；
 * 負對照：不帶 state 的新 context 未勾、首頁 0/N。N 以 src/lib/checklist-ids.ts 重算比對。
 */
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectChecklistIds } from '../../src/lib/checklist-ids';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DOCS = join(HERE, '..', '..', 'src', 'content', 'docs');

function expectedTotal(): number {
	const files = readdirSync(DOCS).filter((f) => /^0[1-5]-.*\.mdx$/.test(f)).sort();
	return collectChecklistIds(files.map((f) => readFileSync(join(DOCS, f), 'utf8'))).length;
}

test('勾選後關閉 context、以 storageState 重開仍勾選；負對照未勾選', async ({ browser }) => {
	const total = expectedTotal();
	const box = (id: string) => `progress-checklist input[type="checkbox"][data-id="${id}"]`;

	// 1. 第一個 context：勾第一個 checkbox
	const first = await browser.newContext();
	const page1 = await first.newPage();
	await page1.goto('/04-hooks/');
	const target = page1.locator('progress-checklist input[type="checkbox"]').first();
	const id = (await target.getAttribute('data-id')) ?? '';
	expect(id).toMatch(/^ch4-ex\d+-\d+$/);
	await target.check();
	await expect(target).toBeChecked();
	const state = await first.storageState();
	await first.close();

	// 2. 帶 storageState 的新 context：仍勾選、localStorage 為 '1'、首頁 1/N
	const restored = await browser.newContext({ storageState: state });
	const page2 = await restored.newPage();
	await page2.goto('/04-hooks/');
	await expect(page2.locator(box(id))).toBeChecked();
	expect(await page2.evaluate((key) => localStorage.getItem(key), `cc-training:${id}`)).toBe('1');
	await page2.goto('/');
	const progress = page2.locator('#cc-progress');
	expect(Number(await progress.getAttribute('data-total'))).toBe(total);
	await expect(progress).toContainText(`1/${total}`);
	await restored.close();

	// 3. 負對照：不帶 state 的新 context
	const fresh = await browser.newContext();
	const page3 = await fresh.newPage();
	await page3.goto('/04-hooks/');
	await expect(page3.locator(box(id))).not.toBeChecked();
	expect(await page3.evaluate((key) => localStorage.getItem(key), `cc-training:${id}`)).toBeNull();
	await page3.goto('/');
	await expect(page3.locator('#cc-progress')).toContainText(`0/${total}`);
	await fresh.close();
});
