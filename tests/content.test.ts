/**
 * 教材內容結構測試：五章骨架、說明段字數、練習必備元素、步驟 0、checklist id 唯一。
 * 與首頁 Progress 共用 src/lib/checklist-ids.ts 的 parser，最後印 CHECKLIST_TOTAL=<N>。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKLIST_ID_PATTERN, collectChecklistIds, extractChecklistBlocks } from '../src/lib/checklist-ids';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DOCS = join(HERE, '..', 'src', 'content', 'docs');
const CHAPTERS = ['01-multi-session', '02-workflow', '03-subagent', '04-hooks', '05-skills'] as const;
const SECTIONS = ['## 用途', '## 什麼時候用', '## 基本用法', '## 你來做'] as const;
const CLONE_URL = 'https://github.com/AngusLu0731/claude-code-practice.git';
const RESET_MARK = 'reset --hard origin/main';
const MIN_BODY_CHARS = 80;

const read = (name: string) => readFileSync(join(DOCS, `${name}.mdx`), 'utf8');
const stripFrontmatter = (src: string) => src.replace(/^---[\s\S]*?\n---\n/, '');

/** 把 fenced code block 內容換成等長空白（保留 ``` 標記與換行），讓標題定位不會被 code block 裡的 `## ` 騙到。 */
function maskFences(src: string): string {
	let inFence = false;
	return src
		.split('\n')
		.map((line) => {
			if (/^\s*```/.test(line)) {
				inFence = !inFence;
				return line;
			}
			return inFence ? ' '.repeat(line.length) : line;
		})
		.join('\n');
}

/** `## 標題` 到下一個 `## ` 之間的正文（不含標題本身）；邊界在遮罩後的原文上找，回傳原文切片。 */
function sectionBody(src: string, heading: string): string {
	const masked = maskFences(src);
	const start = masked.indexOf(`\n${heading}\n`);
	if (start < 0) return '';
	const from = start + heading.length + 2;
	const next = masked.indexOf('\n## ', from);
	return next < 0 ? src.slice(from) : src.slice(from, next);
}

/** 去掉 code block 與 JSX/HTML 標籤後的非空白字元數。 */
function proseChars(body: string): number {
	return body
		.replace(/```[\s\S]*?```/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, '').length;
}

function exerciseBlocks(src: string): { id: string; title: string; body: string }[] {
	const out: { id: string; title: string; body: string }[] = [];
	const re = /<Exercise\b([^>]*)>([\s\S]*?)<\/Exercise>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(src)) !== null) {
		const id = /\bid=["']([^"']+)["']/.exec(m[1])?.[1] ?? '';
		const title = /\btitle=["']([^"']+)["']/.exec(m[1])?.[1] ?? '';
		out.push({ id, title, body: m[2] });
	}
	return out;
}

const firstCodeBlock = (body: string) => /```[^\n]*\n([\s\S]*?)```/.exec(body)?.[1] ?? '';
const hasHeading = (src: string, re: RegExp) => maskFences(src).split('\n').some((line) => /^#{2,4} /.test(line) && re.test(line));

describe('五章骨架', () => {
	it('五個章節檔都存在', () => {
		for (const ch of CHAPTERS) expect(existsSync(join(DOCS, `${ch}.mdx`)), ch).toBe(true);
	});

	for (const ch of CHAPTERS) {
		describe(ch, () => {
			const src = stripFrontmatter(read(ch));

			it('四個標題依序存在', () => {
				let cursor = -1;
				const masked = maskFences(src);
				for (const heading of SECTIONS) {
					const at = masked.indexOf(`\n${heading}\n`, cursor + 1);
					expect(at, `${heading} 應在前一段之後`).toBeGreaterThan(cursor);
					cursor = at;
				}
			});

			it(`三個說明段正文各 ≥${MIN_BODY_CHARS} 個非空白字元`, () => {
				for (const heading of SECTIONS.slice(0, 3)) {
					expect(proseChars(sectionBody(src, heading)), heading).toBeGreaterThanOrEqual(MIN_BODY_CHARS);
				}
			});

			it('至少一個 Exercise，且每個都有 code block、### 預期看到、<Checklist', () => {
				const exercises = exerciseBlocks(sectionBody(src, '## 你來做'));
				expect(exercises.length).toBeGreaterThanOrEqual(1);
				for (const ex of exercises) {
					expect(ex.id, 'Exercise id').toMatch(/^ch[1-5]-ex\d+$/);
					expect(ex.body, `${ex.id} code block`).toMatch(/```/);
					expect(ex.body, `${ex.id} 預期看到`).toContain('### 預期看到');
					expect(ex.body, `${ex.id} Checklist`).toContain('<Checklist');
					for (const id of collectChecklistIds([ex.body])) expect(id.startsWith(`${ex.id}-`), `${id} 應以 ${ex.id}- 開頭`).toBe(true);
				}
			});

			it('「你來做」第一個 code block 是步驟 0：clone 或 reset --hard origin/main', () => {
				const block = firstCodeBlock(sectionBody(src, '## 你來做'));
				expect(block.includes(CLONE_URL) || block.includes(RESET_MARK), block).toBe(true);
			});

			it('章內提到 /exit（建完 .claude/ 檔案要重開）', () => {
				expect(src).toContain('/exit');
			});
		});
	}
});

describe('各章專屬', () => {
	it('ch1：有標題含「情境」的段落，練習標題含「分工」與「收斂」', () => {
		const src = stripFrontmatter(read('01-multi-session'));
		expect(hasHeading(src, /情境/)).toBe(true);
		const titles = exerciseBlocks(src).map((e) => e.title);
		expect(titles.some((t) => t.includes('分工') && t.includes('收斂')), titles.join(' | ')).toBe(true);
	});

	it('ch2：有「拆站」與「前置檢查」標題', () => {
		const src = stripFrontmatter(read('02-workflow'));
		expect(hasHeading(src, /拆站/)).toBe(true);
		expect(hasHeading(src, /前置檢查/)).toBe(true);
	});

	it('ch4：提到 /hooks', () => {
		expect(stripFrontmatter(read('04-hooks'))).toContain('/hooks');
	});

	it('首頁含 ## 開始前 與 <Progress', () => {
		const src = stripFrontmatter(read('index'));
		expect(src).toContain('\n## 開始前\n');
		expect(src).toContain('<Progress');
	});
});

describe('Checklist id', () => {
	const sources = CHAPTERS.map((ch) => stripFrontmatter(read(ch)));
	const ids = collectChecklistIds(sources);

	it('全部唯一且符合 ^ch[1-5]-ex\\d+-\\d+$', () => {
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size, `重複：${ids.filter((id, i) => ids.indexOf(id) !== i).join(',')}`).toBe(ids.length);
		for (const id of ids) expect(id, id).toMatch(CHECKLIST_ID_PATTERN);
		expect(sources.flatMap(extractChecklistBlocks).length).toBeGreaterThanOrEqual(CHAPTERS.length);
	});

	it('印出 CHECKLIST_TOTAL', () => {
		console.log(`CHECKLIST_TOTAL=${ids.length}`);
		expect(ids.length).toBeGreaterThanOrEqual(CHAPTERS.length);
	});
});
