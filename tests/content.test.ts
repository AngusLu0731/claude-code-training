/**
 * 教材內容結構測試：五章骨架、說明段字數、每個練習各自的必備元素與步驟 0、checklist id 唯一。
 * 規則在 tests/lib/content-rules.ts；同一套規則也用合成章節做反向測試，證明抓得到假綠。
 * 與首頁 Progress 共用 src/lib/checklist-ids.ts 的 parser，最後印 CHECKLIST_TOTAL=<N>。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKLIST_ID_PATTERN, collectChecklistIds, extractChecklistBlocks } from '../src/lib/checklist-ids';
import { fencesClosed, maskFences } from '../src/lib/mask-fences';
import {
	CHAPTERS,
	CLONE_URL,
	EXPECTED_HEADING,
	MIN_BODY_CHARS,
	RESET_MARK,
	SECTIONS,
	checkChapter,
	checkExercise,
	exerciseBlocks,
	hasHeading,
	headingPositions,
	proseChars,
	sectionBody,
	stripFrontmatter,
} from './lib/content-rules';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DOCS = join(HERE, '..', 'src', 'content', 'docs');
const read = (name: string) => readFileSync(join(DOCS, `${name}.mdx`), 'utf8');

describe('五章骨架', () => {
	it('五個章節檔都存在', () => {
		for (const ch of CHAPTERS) expect(existsSync(join(DOCS, `${ch}.mdx`)), ch).toBe(true);
	});

	for (const ch of CHAPTERS) {
		describe(ch, () => {
			const src = stripFrontmatter(read(ch));

			it('code fence 全部閉合', () => {
				expect(fencesClosed(src)).toBe(true);
			});

			it('四個標題依序存在（code fence 外）', () => {
				const positions = headingPositions(src);
				for (let i = 0; i < SECTIONS.length; i += 1) expect(positions[i], SECTIONS[i]).toBeGreaterThan(i === 0 ? -1 : positions[i - 1]);
			});

			it(`三個說明段正文各 ≥${MIN_BODY_CHARS} 個非空白字元`, () => {
				for (const heading of SECTIONS.slice(0, 3)) expect(proseChars(sectionBody(src, heading)), heading).toBeGreaterThanOrEqual(MIN_BODY_CHARS);
			});

			it('至少一個 Exercise，且每個練習各自通過全部規則', () => {
				const exercises = exerciseBlocks(sectionBody(src, '## 你來做'));
				expect(exercises.length).toBeGreaterThanOrEqual(1);
				for (const ex of exercises) expect(checkExercise(ex), ex.id).toEqual([]);
			});

			it('整章規則清單為空', () => {
				expect(checkChapter(src)).toEqual([]);
			});

			it('章內提到 /exit（建完 .claude/ 檔案要重開）', () => {
				expect(src).toContain('/exit');
			});
		});
	}
});

describe('各章專屬', () => {
	it('ch5：有標題含「情境」的段落，練習標題含「分工」與「收斂」', () => {
		const src = stripFrontmatter(read('05-multi-session'));
		expect(hasHeading(src, /情境/)).toBe(true);
		const titles = exerciseBlocks(src).map((e) => e.title);
		expect(titles.some((t) => t.includes('分工') && t.includes('收斂')), titles.join(' | ')).toBe(true);
	});

	it('ch3：有「拆站」與「前置檢查」標題', () => {
		const src = stripFrontmatter(read('03-workflow'));
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

// ───────────── 反向測試：用合成章節證明規則抓得到假綠 ─────────────

type FakeExercise = { id: string; step0?: string; expected?: string; checklist?: string; extra?: string };

const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;
const prose = '這一段是合成的說明文字，長度要超過八十個非空白字元才能通過正文字數的門檻，所以這裡多寫幾句沒有意義但夠長的話來充數，確保不會因為字數不足而失敗；再補一句讓它穩穩超過門檻，免得規則本身被合成資料誤判。';

function fakeExercise(ex: FakeExercise): string {
	const step0 = ex.step0 ?? fence('bash', `git clone ${CLONE_URL}\ncd claude-code-practice`);
	const expected = ex.expected ?? `${EXPECTED_HEADING}\n\n- 看到 OK`;
	const checklist = ex.checklist ?? `<Checklist items={[\n  { id: '${ex.id}-1', text: '做完了' },\n]} />`;
	return `<Exercise id="${ex.id}" title="合成練習">\n\n${step0}\n\n${fence('bash', 'claude')}\n\n${expected}\n\n${ex.extra ?? ''}\n${checklist}\n\n</Exercise>`;
}

function fakeChapter(exercises: FakeExercise[], opts: { doSectionHeading?: string } = {}): string {
	const doHeading = opts.doSectionHeading ?? '## 你來做';
	return [
		'## 用途',
		prose,
		'## 什麼時候用',
		prose,
		'## 基本用法',
		`${prose} 建完檔案記得 /exit 重開。`,
		doHeading,
		...exercises.map(fakeExercise),
	].join('\n\n');
}

describe('反向：規則要抓得到假綠', () => {
	it('基準：合成章節本身通過', () => {
		expect(checkChapter(fakeChapter([{ id: 'ch1-ex1' }, { id: 'ch1-ex2' }]))).toEqual([]);
	});

	it('### 預期看到 只出現在 code fence 內 → fail', () => {
		const src = fakeChapter([{ id: 'ch1-ex1', expected: fence('text', EXPECTED_HEADING) }]);
		expect(checkChapter(src).some((i) => i.includes(EXPECTED_HEADING))).toBe(true);
	});

	it('<Checklist 只出現在 code fence 內 → fail，且 parser 不收集 fence 內的 id', () => {
		const inner = `<Checklist items={[{ id: 'ch1-ex1-1', text: 'x' }]} />`;
		const src = fakeChapter([{ id: 'ch1-ex1', checklist: fence('mdx', inner) }]);
		expect(collectChecklistIds([src])).toEqual([]);
		expect(checkChapter(src).some((i) => i.includes('<Checklist'))).toBe(true);
	});

	it('## 你來做 只出現在 code fence 內 → 標題缺失', () => {
		const src = fakeChapter([{ id: 'ch1-ex1' }], { doSectionHeading: fence('md', '## 你來做') });
		expect(checkChapter(src).some((i) => i.includes('## 你來做'))).toBe(true);
	});

	it('第二個 Exercise 缺步驟 0 → fail（只看整章第一個 code block 的舊做法會放過它）', () => {
		const src = fakeChapter([{ id: 'ch1-ex1' }, { id: 'ch1-ex2', step0: fence('bash', 'claude --worktree a') }]);
		const section = sectionBody(src, '## 你來做');
		const oldStyleFirstBlock = /```[^\n]*\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
		expect(oldStyleFirstBlock.includes(CLONE_URL) || oldStyleFirstBlock.includes(RESET_MARK)).toBe(true);
		const issues = checkChapter(src);
		expect(issues.some((i) => i.startsWith('ch1-ex2：') && i.includes('步驟 0'))).toBe(true);
		expect(issues.some((i) => i.startsWith('ch1-ex1：'))).toBe(false);
	});

	it('checklist id 不以 Exercise id 開頭 → fail', () => {
		const src = fakeChapter([{ id: 'ch1-ex1', checklist: `<Checklist items={[{ id: 'ch2-ex1-1', text: 'x' }]} />` }]);
		expect(checkChapter(src).some((i) => i.includes('沒有以 ch1-ex1-'))).toBe(true);
	});

	it('code fence 沒閉合 → fail', () => {
		const src = fakeChapter([{ id: 'ch1-ex1', extra: '```bash\necho 沒有關起來' }]);
		expect(fencesClosed(src)).toBe(false);
		expect(checkChapter(src).some((i) => i.includes('fence'))).toBe(true);
	});

	it('maskFences：巢狀 ```` 不會被內層 ``` 提早關掉', () => {
		const src = '````bash\ncat <<X\n```md\n## 不是標題\n```\nX\n````\n\n## 真標題\n';
		const masked = maskFences(src);
		expect(masked).not.toContain('## 不是標題');
		expect(masked).toContain('## 真標題');
		expect(fencesClosed(src)).toBe(true);
	});
});
