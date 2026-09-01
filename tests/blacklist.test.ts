/**
 * 黑名單掃描：兩個 repo 的 git 追蹤／未追蹤檔 ＋ site/dist 全部檔，對外部詞庫 0 命中才過。
 * 詞庫在 repo 外（CC_TRAINING_BLACKLIST 或 ~/.config/cc-training/blacklist.json）；本檔不含任何字面詞。
 * 缺檔、schema 不完整、空類別、重複條目、無效 regex、總條數 <60、人名 <20 一律 fail，不 skip。
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleFor, mutateExample } from './lib/regex-example';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SITE = resolve(HERE, '..');
const PRACTICE = resolve(SITE, '..', 'practice');
const DIST = join(SITE, 'dist');
const DICT_PATH = process.env.CC_TRAINING_BLACKLIST ?? join(homedir(), '.config', 'cc-training', 'blacklist.json');
const MIN_TERMS = 60;
const MIN_NAMES = 20;
const MIN_HTML = 7;
const EXCLUDED_DIRS = ['.git', 'node_modules', '__pycache__'];
const TERM_KEYS = ['ascii', 'cjk', 'numeric', 'regex', 'names'] as const;

type TermKey = (typeof TERM_KEYS)[number];
type Dict = { generated: string; sources: string[] } & Record<TermKey, string[]>;
type Matcher = { kind: TermKey; term: string; re: RegExp };
type Hit = { file: string; line: number; term: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** 完整 schema 驗證；回傳問題清單（空＝通過）。訊息只帶索引與類別，不帶詞本身。 */
export function validateDict(raw: unknown): string[] {
	const errors: string[] = [];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['詞庫不是 JSON 物件'];
	const d = raw as Record<string, unknown>;
	if (typeof d.generated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.generated)) errors.push('generated 必須是 YYYY-MM-DD 字串');
	if (!isStringArray(d.sources) || d.sources.length === 0) errors.push('sources 必須是非空字串陣列');
	for (const key of TERM_KEYS) {
		const list = d[key];
		if (!isStringArray(list)) {
			errors.push(`${key} 必須是字串陣列`);
			continue;
		}
		if (list.length === 0) errors.push(`${key} 不可為空`);
		const seen = new Set<string>();
		list.forEach((term, i) => {
			const norm = key === 'ascii' || key === 'names' ? term.toLowerCase() : term;
			if (!term.trim()) errors.push(`${key}[${i}] 是空字串`);
			if (seen.has(norm)) errors.push(`${key}[${i}] 重複`);
			seen.add(norm);
			if ((key === 'ascii' || key === 'names') && !/^[\x20-\x7e]+$/.test(term)) errors.push(`${key}[${i}] 含非 ASCII 字元`);
			if (key === 'cjk' && !/[㐀-鿿]/.test(term)) errors.push(`cjk[${i}] 沒有中文字`);
			if (key === 'numeric' && !/^\d+$/.test(term)) errors.push(`numeric[${i}] 不是純數字`);
			if (key === 'regex') {
				try {
					new RegExp(term, 'i');
				} catch {
					errors.push(`regex[${i}] 無法編譯`);
				}
			}
		});
	}
	return errors;
}

function loadRaw(): unknown {
	if (!existsSync(DICT_PATH)) throw new Error(`黑名單詞庫不存在：${DICT_PATH}（設 CC_TRAINING_BLACKLIST 或照 spec 產生；不准用替代詞庫）`);
	return JSON.parse(readFileSync(DICT_PATH, 'utf8'));
}

let cached: { dict: Dict; matchers: Matcher[] } | null = null;
function loaded() {
	if (cached) return cached;
	const raw = loadRaw();
	const errors = validateDict(raw);
	if (errors.length) throw new Error(`詞庫 schema 不合：${errors.join('；')}`);
	const dict = raw as Dict;
	cached = { dict, matchers: buildMatchers(dict) };
	return cached;
}

function buildMatchers(dict: Dict): Matcher[] {
	const word = (t: string) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(t)}(?![A-Za-z0-9])`, 'i');
	return [
		...dict.ascii.map((term) => ({ kind: 'ascii' as const, term, re: word(term) })),
		...dict.names.map((term) => ({ kind: 'names' as const, term, re: word(term) })),
		...dict.cjk.map((term) => ({ kind: 'cjk' as const, term, re: new RegExp(escapeRe(term)) })),
		...dict.numeric.map((term) => ({ kind: 'numeric' as const, term, re: new RegExp(`(?<!\\d)${escapeRe(term)}(?!\\d)`) })),
		...dict.regex.map((term) => ({ kind: 'regex' as const, term, re: new RegExp(term, 'i') })),
	];
}

function scanText(text: string, matchers: Matcher[], file = '<inline>'): Hit[] {
	const hits: Hit[] = [];
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		for (const m of matchers) if (m.re.test(lines[i])) hits.push({ file, line: i + 1, term: m.term });
	}
	return hits;
}

const hitTerms = (text: string) => scanText(text, loaded().matchers).map((h) => h.term);

function gitFiles(repo: string): string[] {
	const out = execFileSync('git', ['-C', repo, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
	return out.split('\0').filter(Boolean).map((p) => join(repo, p));
}

function walk(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...walk(full));
		else if (entry.isFile()) files.push(full);
	}
	return files;
}

const isExcluded = (p: string) => p.split('/').some((seg) => EXCLUDED_DIRS.includes(seg));
const newestMtime = (dir: string) => Math.max(0, ...walk(dir).map((f) => statSync(f).mtimeMs));

describe('黑名單詞庫', () => {
	it('詞庫存在、schema 完整、無空類別、無重複、regex 可編譯', () => {
		expect(validateDict(loadRaw())).toEqual([]);
	});

	it(`總條數 ≥${MIN_TERMS}、人名 ≥${MIN_NAMES}`, () => {
		const { dict, matchers } = loaded();
		expect(matchers.length).toBeGreaterThanOrEqual(MIN_TERMS);
		expect(dict.names.length).toBeGreaterThanOrEqual(MIN_NAMES);
	});

	it('自檢：CJK 詞夾在中文句中必命中', () => {
		for (const term of loaded().dict.cjk) expect(hitTerms(`這是一段中文，${term}夾在句子裡。`), term).toContain(term);
	});

	it('自檢：ascii 詞後接 _X 必命中（\\b 會漏，這裡不能漏）；大小寫不分', () => {
		for (const term of loaded().dict.ascii) {
			expect(hitTerms(`${term}_X`), term).toContain(term);
			expect(hitTerms(term.toUpperCase()), term).toContain(term);
		}
	});

	it('自檢：ascii 詞前接字母的複合形（詞庫內 <term> 與 <term>factory 同時存在）必命中', () => {
		const lower = loaded().dict.ascii.map((t) => t.toLowerCase());
		const pairs = lower.filter((t) => lower.includes(`${t}factory`));
		expect(pairs.length, '詞庫應至少有一組 <term> / <term>factory').toBeGreaterThan(0);
		for (const term of pairs) {
			const compound = `${term}factory`;
			expect(hitTerms(`前綴${compound}後綴`).map((t) => t.toLowerCase()), compound).toContain(compound);
			expect(hitTerms(`x${compound}`).map((t) => t.toLowerCase()), `x${compound}`).not.toContain(term);
		}
	});

	it('自檢：numeric 只在數字邊界命中（前後接字母命中、前後接數字不命中）', () => {
		for (const term of loaded().dict.numeric) {
			expect(hitTerms(`id-${term}-x`), term).toContain(term);
			expect(hitTerms(`9${term}`), `9${term}`).not.toContain(term);
			expect(hitTerms(`${term}9`), `${term}9`).not.toContain(term);
		}
	});

	it('自檢：每條 regex 都有動態正案例（含大寫變體）與反案例', () => {
		for (const term of loaded().dict.regex) {
			const example = exampleFor(term);
			expect(new RegExp(term, 'i').test(example), `產生的正案例本身要匹配：${term}`).toBe(true);
			expect(hitTerms(example), `正案例：${term}`).toContain(term);
			expect(hitTerms(example.toUpperCase()), `大寫變體：${term}`).toContain(term);
			const counter = mutateExample(example);
			expect(counter).not.toBe(example);
			expect(hitTerms(counter), `反案例（regex 過寬）：${term}`).not.toContain(term);
		}
	});

	it('自檢：這些 repo 裡的常見字串不會誤命中（版本號、localhost、指令）', () => {
		for (const benign of ['python3 -m unittest -v', '2.1.246', '127.0.0.1:4321', '10.4.0', 'git reset --hard origin/main', 'npx wrangler deploy --dry-run']) {
			expect(hitTerms(benign), benign).toEqual([]);
		}
	});

	it('前置：dist/index.html 存在、html ≥7、mtime 晚於 src/content 最新檔', () => {
		expect(existsSync(join(DIST, 'index.html')), 'dist/index.html').toBe(true);
		const htmls = walk(DIST).filter((f) => f.endsWith('.html'));
		expect(htmls.length).toBeGreaterThanOrEqual(MIN_HTML);
		const oldestHtml = Math.min(...htmls.map((f) => statSync(f).mtimeMs));
		expect(oldestHtml, 'dist 比 src/content 舊，先 npm run build').toBeGreaterThan(newestMtime(join(SITE, 'src', 'content')));
	});

	it('掃描：兩個 repo ＋ dist 對詞庫 0 命中', () => {
		const { matchers } = loaded();
		const files = [...gitFiles(SITE), ...walk(DIST), ...gitFiles(PRACTICE)].filter((f) => !isExcluded(f));
		const unique = [...new Set(files)];
		const hits: Hit[] = [];
		for (const file of unique) {
			if (!existsSync(file) || !statSync(file).isFile()) continue;
			hits.push(...scanText(readFileSync(file, 'utf8'), matchers, relative(resolve(SITE, '..'), file)));
		}
		console.log(`BLACKLIST_TERMS=${matchers.length} HITS=${hits.length} FILES=${unique.length}`);
		for (const h of hits) console.log(`  ${h.file}:${h.line}:${h.term}`);
		expect(hits, hits.map((h) => `${h.file}:${h.line}:${h.term}`).join('\n')).toEqual([]);
	});
});

describe('validateDict 反向案例（合成詞庫，不含真實詞）', () => {
	const good = () => ({
		generated: '2026-01-01',
		sources: ['synthetic'],
		ascii: ['zzterm'],
		cjk: ['測試詞'],
		numeric: ['0000000'],
		regex: ['zz-\\d+'],
		names: ['zz name'],
	});

	it('基準：合成詞庫通過', () => {
		expect(validateDict(good())).toEqual([]);
	});

	it('缺 generated／sources → fail', () => {
		expect(validateDict({ ...good(), generated: undefined })).toContainEqual(expect.stringContaining('generated'));
		expect(validateDict({ ...good(), sources: [] })).toContainEqual(expect.stringContaining('sources'));
	});

	it('任一類別為空或缺少 → fail', () => {
		for (const key of TERM_KEYS) {
			expect(validateDict({ ...good(), [key]: [] }), key).toContainEqual(expect.stringContaining(`${key} 不可為空`));
			const { [key]: _omit, ...rest } = good();
			expect(validateDict(rest), key).toContainEqual(expect.stringContaining(`${key} 必須是字串陣列`));
		}
	});

	it('重複條目（ascii／names 不分大小寫）→ fail', () => {
		expect(validateDict({ ...good(), ascii: ['zzterm', 'ZZTERM'] })).toContainEqual(expect.stringContaining('ascii[1] 重複'));
		expect(validateDict({ ...good(), numeric: ['0000000', '0000000'] })).toContainEqual(expect.stringContaining('numeric[1] 重複'));
	});

	it('無效 regex／非純數字／無中文 → fail', () => {
		expect(validateDict({ ...good(), regex: ['(unclosed'] })).toContainEqual(expect.stringContaining('regex[0] 無法編譯'));
		expect(validateDict({ ...good(), numeric: ['12ab'] })).toContainEqual(expect.stringContaining('numeric[0] 不是純數字'));
		expect(validateDict({ ...good(), cjk: ['latin'] })).toContainEqual(expect.stringContaining('cjk[0] 沒有中文字'));
	});

	it('exampleFor：碰到不支援的語法要丟錯，而不是給錯例', () => {
		expect(() => exampleFor('(?<=x)y')).toThrow();
		expect(() => exampleFor('[^a]')).toThrow();
		expect(exampleFor('ab(c|d)?\\d{2}')).toBe('abc00');
	});
});
