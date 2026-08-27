/**
 * 黑名單掃描：兩個 repo 的 git 追蹤／未追蹤檔 ＋ site/dist 全部檔，對外部詞庫 0 命中才過。
 * 詞庫在 repo 外（CC_TRAINING_BLACKLIST 或 ~/.config/cc-training/blacklist.json）；本檔不含任何字面詞。
 * 缺檔、總條數 <60、人名 <20 一律 fail，不 skip。
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SITE = resolve(HERE, '..');
const PRACTICE = resolve(SITE, '..', 'practice');
const DIST = join(SITE, 'dist');
const DICT_PATH = process.env.CC_TRAINING_BLACKLIST ?? join(homedir(), '.config', 'cc-training', 'blacklist.json');
const MIN_TERMS = 60;
const MIN_NAMES = 20;
const MIN_HTML = 7;
const EXCLUDED_DIRS = ['.git', 'node_modules', '__pycache__'];

type Dict = {
	generated: string;
	sources: string[];
	ascii: string[];
	cjk: string[];
	numeric: string[];
	regex: string[];
	names: string[];
};
type Matcher = { kind: keyof Dict; term: string; re: RegExp };
type Hit = { file: string; line: number; term: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function loadDict(): Dict {
	if (!existsSync(DICT_PATH)) throw new Error(`黑名單詞庫不存在：${DICT_PATH}（設 CC_TRAINING_BLACKLIST 或照 spec 產生）`);
	const dict = JSON.parse(readFileSync(DICT_PATH, 'utf8')) as Dict;
	for (const key of ['ascii', 'cjk', 'numeric', 'regex', 'names'] as const) {
		if (!Array.isArray(dict[key])) throw new Error(`詞庫缺 ${key} 陣列`);
	}
	return dict;
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

function newestMtime(dir: string): number {
	return Math.max(0, ...walk(dir).map((f) => statSync(f).mtimeMs));
}

describe('黑名單詞庫', () => {
	const dict = loadDict();
	const matchers = buildMatchers(dict);
	const total = matchers.length;
	const hitTerms = (text: string) => scanText(text, matchers).map((h) => h.term);

	it(`總條數 ≥${MIN_TERMS}、人名 ≥${MIN_NAMES}`, () => {
		expect(total).toBeGreaterThanOrEqual(MIN_TERMS);
		expect(dict.names.length).toBeGreaterThanOrEqual(MIN_NAMES);
		expect(dict.cjk.length).toBeGreaterThan(0);
		expect(dict.ascii.length).toBeGreaterThan(0);
	});

	it('自檢：CJK 詞夾在中文句中必命中', () => {
		for (const term of dict.cjk) expect(hitTerms(`這是一段中文，${term}夾在句子裡。`), term).toContain(term);
	});

	it('自檢：ascii 詞後接 _X 必命中（\\b 會漏，這裡不能漏）', () => {
		for (const term of dict.ascii) expect(hitTerms(`${term}_X`), term).toContain(term);
	});

	it('自檢：ascii 詞前接字母的複合形（詞庫內 <term> 與 <term>factory 同時存在）必命中', () => {
		const lower = dict.ascii.map((t) => t.toLowerCase());
		const pairs = lower.filter((t) => lower.includes(`${t}factory`));
		expect(pairs.length, '詞庫應至少有一組 <term> / <term>factory').toBeGreaterThan(0);
		for (const term of pairs) {
			const compound = `${term}factory`;
			expect(hitTerms(`前綴${compound}後綴`).map((t) => t.toLowerCase()), compound).toContain(compound);
			expect(hitTerms(`x${compound}`).map((t) => t.toLowerCase()), `x${compound}`).not.toContain(term);
		}
	});

	it('自檢：python3 -m unittest -v 對任何 names 不命中', () => {
		const names = new Set(dict.names.map((n) => n.toLowerCase()));
		const hits = hitTerms('python3 -m unittest -v').filter((t) => names.has(t.toLowerCase()));
		expect(hits).toEqual([]);
	});

	it('前置：dist/index.html 存在、html ≥7、mtime 晚於 src/content 最新檔', () => {
		expect(existsSync(join(DIST, 'index.html')), 'dist/index.html').toBe(true);
		const htmls = walk(DIST).filter((f) => f.endsWith('.html'));
		expect(htmls.length).toBeGreaterThanOrEqual(MIN_HTML);
		const oldestHtml = Math.min(...htmls.map((f) => statSync(f).mtimeMs));
		expect(oldestHtml, 'dist 比 src/content 舊，先 npm run build').toBeGreaterThan(newestMtime(join(SITE, 'src', 'content')));
	});

	it('掃描：兩個 repo ＋ dist 對詞庫 0 命中', () => {
		const files = [...gitFiles(SITE), ...walk(DIST), ...gitFiles(PRACTICE)].filter((f) => !isExcluded(f));
		const unique = [...new Set(files)];
		const hits: Hit[] = [];
		for (const file of unique) {
			if (!existsSync(file) || !statSync(file).isFile()) continue;
			hits.push(...scanText(readFileSync(file, 'utf8'), matchers, relative(resolve(SITE, '..'), file)));
		}
		console.log(`BLACKLIST_TERMS=${total} HITS=${hits.length} FILES=${unique.length}`);
		for (const h of hits) console.log(`  ${h.file}:${h.line}:${h.term}`);
		expect(hits, hits.map((h) => `${h.file}:${h.line}:${h.term}`).join('\n')).toEqual([]);
	});
});
