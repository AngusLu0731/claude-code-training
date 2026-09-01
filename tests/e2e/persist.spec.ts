/**
 * 自檢勾選持久化：勾一個 → 存 storageState → 關閉 context → 帶 state 重開仍勾、首頁 1/N；
 * 負對照：不帶 state 的新 context 未勾、首頁 0/N。分子與分母都做精確斷言（不用 toContainText，避免 10/N 也過）。
 * 另外驗證五章實際渲染出的 checkbox id 集合＝parser 算的集合＝首頁 data-total，以及 heredoc code block 渲染完整。
 */
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectChecklistIds } from '../../src/lib/checklist-ids';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DOCS = join(HERE, '..', '..', 'src', 'content', 'docs');
const CHAPTERS = ['01-skills', '02-subagent', '03-workflow', '04-hooks', '05-multi-session'];
const BOX = 'progress-checklist input[type="checkbox"]';

function expectedIds(): string[] {
	const files = readdirSync(DOCS).filter((f) => /^0[1-5]-.*\.mdx$/.test(f)).sort();
	return collectChecklistIds(files.map((f) => readFileSync(join(DOCS, f), 'utf8')));
}

test('勾選後關閉 context、以 storageState 重開仍勾選；負對照未勾選', async ({ browser }) => {
	const total = expectedIds().length;
	const box = (id: string) => `${BOX}[data-id="${id}"]`;

	// 1. 第一個 context：勾第一個 checkbox
	const first = await browser.newContext();
	const page1 = await first.newPage();
	await page1.goto('/04-hooks/');
	const target = page1.locator(BOX).first();
	const id = (await target.getAttribute('data-id')) ?? '';
	expect(id).toMatch(/^ch4-ex\d+-\d+$/);
	await target.check();
	await expect(target).toBeChecked();
	const state = await first.storageState();
	await first.close();

	// 2. 帶 storageState 的新 context：仍勾選、localStorage 為 '1'、首頁精確 1 / N
	const restored = await browser.newContext({ storageState: state });
	const page2 = await restored.newPage();
	await page2.goto('/04-hooks/');
	await expect(page2.locator(box(id))).toBeChecked();
	expect(await page2.evaluate((key) => localStorage.getItem(key), `cc-training:${id}`)).toBe('1');
	await page2.goto('/');
	const progress = page2.locator('#cc-progress');
	expect(Number(await progress.getAttribute('data-total'))).toBe(total);
	await expect(progress.locator('[data-done]')).toHaveText('1');
	await expect(progress.locator('[data-total-count]')).toHaveText(String(total));
	await restored.close();

	// 3. 負對照：不帶 state 的新 context → 未勾、localStorage 為 null、首頁精確 0 / N
	const fresh = await browser.newContext();
	const page3 = await fresh.newPage();
	await page3.goto('/04-hooks/');
	await expect(page3.locator(box(id))).not.toBeChecked();
	expect(await page3.evaluate((key) => localStorage.getItem(key), `cc-training:${id}`)).toBeNull();
	await page3.goto('/');
	const progress3 = page3.locator('#cc-progress');
	await expect(progress3.locator('[data-done]')).toHaveText('0');
	await expect(progress3.locator('[data-total-count]')).toHaveText(String(total));
	await fresh.close();
});

test('五章實際渲染的 checkbox id 集合＝parser 集合＝首頁 data-total', async ({ page }) => {
	const rendered: string[] = [];
	for (const ch of CHAPTERS) {
		await page.goto(`/${ch}/`);
		rendered.push(...(await page.locator(BOX).evaluateAll((els) => els.map((el) => (el as HTMLInputElement).dataset.id ?? ''))));
	}
	const expected = expectedIds();
	expect([...rendered].sort()).toEqual([...expected].sort());
	await page.goto('/');
	const progress = page.locator('#cc-progress');
	expect(Number(await progress.getAttribute('data-total'))).toBe(rendered.length);
	await expect(progress.locator('[data-total-count]')).toHaveText(String(rendered.length));
});

test('貼給讀者的 heredoc code block 渲染完整（含 EOF 終止行，不被巢狀 fence 截斷）', async ({ page }) => {
	let found = 0;
	for (const ch of CHAPTERS) {
		await page.goto(`/${ch}/`);
		for (const text of await page.locator('pre').allInnerTexts()) {
			if (!text.includes("<<'EOF'")) continue;
			found += 1;
			const lines = text.split('\n').map((l) => l.trimEnd()).filter(Boolean);
			expect(lines[lines.length - 1], `${ch} 的 heredoc 最後一行要是 EOF`).toBe('EOF');
		}
	}
	expect(found).toBeGreaterThanOrEqual(5);
});
