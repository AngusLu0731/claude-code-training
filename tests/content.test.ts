/**
 * 教材內容結構測試：五章骨架、說明段字數、每個練習各自的必備元素與步驟 0、checklist id 唯一；
 * 期末作業頁另有一套規則（四段標題、五章工具都提到、不把 .claude/ 工具檔貼給讀者）。
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
	CAPSTONE,
	CAPSTONE_MENTIONS,
	CAPSTONE_SECTIONS,
	CHAPTERS,
	CLONE_URL,
	EXPECTED_HEADING,
	MIN_BODY_CHARS,
	RESET_MARK,
	SECTIONS,
	checkCapstone,
	checkChapter,
	checkExercise,
	exerciseBlocks,
	hasHeading,
	headingPositions,
	heredocTargets,
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

describe('期末作業（06-capstone）', () => {
	const src = stripFrontmatter(read(CAPSTONE));

	it('四段標題依序存在，規則清單為空', () => {
		expect(existsSync(join(DOCS, `${CAPSTONE}.mdx`))).toBe(true);
		const positions = headingPositions(src, CAPSTONE_SECTIONS);
		for (let i = 0; i < CAPSTONE_SECTIONS.length; i += 1) expect(positions[i], CAPSTONE_SECTIONS[i]).toBeGreaterThan(i === 0 ? -1 : positions[i - 1]);
		expect(checkCapstone(src)).toEqual([]);
	});

	it('一個 Exercise（ch6-ex1），自檢至少 8 項：五章工具各至少一項＋驗收', () => {
		const exercises = exerciseBlocks(sectionBody(src, '## 你來做'));
		expect(exercises.map((e) => e.id)).toEqual(['ch6-ex1']);
		const ids = collectChecklistIds([exercises[0].body]);
		expect(ids.length).toBeGreaterThanOrEqual(8);
		const texts = exercises[0].masked;
		for (const word of ['worktree', 'merge', 'doc-checker', '/ship-check', '/release', '擋下', 'CAPSTONE_OK']) expect(texts, word).toContain(word);
	});

	it('只把 SPEC.md 貼給讀者；四份工具檔一律不貼', () => {
		const targets = heredocTargets(src);
		expect(targets).toContain('SPEC.md');
		expect(targets.filter((t) => t.startsWith('.claude/'))).toEqual([]);
	});

	it('反向：合成的期末作業頁貼了 .claude/ 檔案或漏提工具 → fail', () => {
		const pasted = src.replace("cat > SPEC.md <<'EOF'", "cat > .claude/skills/release/SKILL.md <<'EOF'");
		expect(checkCapstone(pasted).some((i) => i.includes('.claude/skills/release/SKILL.md'))).toBe(true);
		const missing = src.split(CAPSTONE_MENTIONS[0]).join('/rel');
		expect(checkCapstone(missing)).toContainEqual(expect.stringContaining(CAPSTONE_MENTIONS[0]));
	});
});

describe('Checklist id', () => {
	const sources = [...CHAPTERS, CAPSTONE].map((ch) => stripFrontmatter(read(ch)));
	const ids = collectChecklistIds(sources);

	it('全部唯一且符合 ^ch[1-6]-ex\\d+-\\d+$', () => {
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size, `重複：${ids.filter((id, i) => ids.indexOf(id) !== i).join(',')}`).toBe(ids.length);
		for (const id of ids) expect(id, id).toMatch(CHECKLIST_ID_PATTERN);
		expect(sources.flatMap(extractChecklistBlocks).length).toBeGreaterThanOrEqual(CHAPTERS.length + 1);
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
