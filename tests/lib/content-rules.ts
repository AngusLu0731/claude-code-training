/**
 * 教材內容的結構規則。content.test.ts 用它檢查真實章節，也用合成章節做反向測試，
 * 所以規則都寫成「回傳問題清單」的純函式，而不是直接 expect。
 */
import { collectChecklistIds } from '../../src/lib/checklist-ids';
import { codeBlocks, fencesClosed, maskFences } from '../../src/lib/mask-fences';

export const CHAPTERS = ['01-skills', '02-subagent', '03-workflow', '04-hooks', '05-multi-session'] as const;
export const CAPSTONE = '06-capstone';
export const CAPSTONE_SECTIONS = ['## 作業', '## 交付物', '## 規格', '## 你來做'] as const;
/** 期末作業頁一定要提到的五章工具與驗收關鍵字。 */
export const CAPSTONE_MENTIONS = ['/release', 'doc-checker', '/ship-check', 'push_gate.py', '--worktree', 'CAPSTONE_OK'] as const;
export const SECTIONS = ['## 用途', '## 什麼時候用', '## 基本用法', '## 你來做'] as const;
export const CLONE_URL = 'https://github.com/AngusLu0731/claude-code-practice.git';
export const RESET_MARK = 'reset --hard origin/main';
export const MIN_BODY_CHARS = 80;
export const EXERCISE_ID = /^ch[1-6]-ex\d+$/;
export const EXPECTED_HEADING = '### 預期看到';

export type Exercise = { id: string; title: string; body: string; masked: string };

export const stripFrontmatter = (src: string) => src.replace(/^---[\s\S]*?\n---\n/, '');

/** 遮罩後再補一個前導換行，讓「檔案第一行就是標題」也能用 `\n## X\n` 定位（回傳的座標比原文多 1）。 */
const paddedMask = (src: string) => '\n' + maskFences(src);

/** 各主標題在（補了前導換行的）遮罩原文裡的位置，找不到為 -1；只用來比順序。預設用五章的四段標題。 */
export function headingPositions(src: string, headings: readonly string[] = SECTIONS): number[] {
	const padded = paddedMask(src);
	let cursor = -1;
	return headings.map((heading) => {
		const at = padded.indexOf(`\n${heading}\n`, cursor + 1);
		if (at >= 0) cursor = at;
		return at;
	});
}

/** `## 標題` 到下一個 `## ` 之間的正文（不含標題本身）；邊界在遮罩後找，回傳原文切片。 */
export function sectionBody(src: string, heading: string): string {
	const padded = paddedMask(src);
	const start = padded.indexOf(`\n${heading}\n`);
	if (start < 0) return '';
	const from = start + heading.length + 2;
	const next = padded.indexOf('\n## ', from);
	return next < 0 ? src.slice(from - 1) : src.slice(from - 1, next - 1);
}

/** 去掉 code block、fence 標記行與 JSX/HTML 標籤後的非空白字元數。 */
export function proseChars(body: string): number {
	return maskFences(body)
		.replace(/^\s*```.*$/gm, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, '').length;
}

/** code fence 外的 <Exercise …>…</Exercise> 區塊（body 為原文切片，masked 為同範圍的遮罩版）。 */
export function exerciseBlocks(src: string): Exercise[] {
	const masked = maskFences(src);
	const out: Exercise[] = [];
	const re = /<Exercise\b([^>]*)>([\s\S]*?)<\/Exercise>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(masked)) !== null) {
		const id = /\bid=["']([^"']+)["']/.exec(m[1])?.[1] ?? '';
		const title = /\btitle=["']([^"']+)["']/.exec(m[1])?.[1] ?? '';
		const from = m.index + m[0].indexOf('>') + 1;
		const to = m.index + m[0].length - '</Exercise>'.length;
		out.push({ id, title, body: src.slice(from, to), masked: masked.slice(from, to) });
	}
	return out;
}

export const hasHeading = (src: string, re: RegExp) =>
	maskFences(src)
		.split('\n')
		.some((line) => /^#{2,4} /.test(line) && re.test(line));

/** 單一練習的規則；回傳問題清單（空＝通過）。每條都在 code fence 外判定。 */
export function checkExercise(ex: Exercise): string[] {
	const issues: string[] = [];
	const tag = ex.id || '(無 id)';
	if (!EXERCISE_ID.test(ex.id)) issues.push(`${tag}：id 不合 ^ch[1-6]-ex\\d+$`);
	if (!ex.title.trim()) issues.push(`${tag}：title 是空的`);
	if (!fencesClosed(ex.body)) issues.push(`${tag}：code fence 沒有閉合`);
	const blocks = codeBlocks(ex.body);
	if (blocks.length === 0) issues.push(`${tag}：沒有任何 code block`);
	else if (!blocks[0].includes(CLONE_URL) && !blocks[0].includes(RESET_MARK)) {
		issues.push(`${tag}：第一個 code block 不是步驟 0（要含 clone URL 或 ${RESET_MARK}）`);
	}
	if (!new RegExp(`^${EXPECTED_HEADING}\\s*$`, 'm').test(ex.masked)) issues.push(`${tag}：缺 code fence 外的 ${EXPECTED_HEADING}`);
	if (!/<Checklist\b/.test(ex.masked)) issues.push(`${tag}：缺 code fence 外的 <Checklist`);
	const ids = collectChecklistIds([ex.body]);
	if (ids.length === 0) issues.push(`${tag}：Checklist 沒有任何 id`);
	for (const id of ids) if (!id.startsWith(`${ex.id}-`)) issues.push(`${tag}：checklist id ${id} 沒有以 ${ex.id}- 開頭`);
	return issues;
}

/** 整章規則；回傳問題清單（空＝通過）。 */
export function checkChapter(src: string): string[] {
	const issues: string[] = [];
	if (!fencesClosed(src)) issues.push('code fence 沒有閉合');
	const positions = headingPositions(src);
	SECTIONS.forEach((heading, i) => {
		if (positions[i] < 0) issues.push(`缺標題或順序錯：${heading}`);
	});
	for (const heading of SECTIONS.slice(0, 3)) {
		const n = proseChars(sectionBody(src, heading));
		if (n < MIN_BODY_CHARS) issues.push(`${heading} 正文只有 ${n} 個非空白字元（需 ≥${MIN_BODY_CHARS}）`);
	}
	const exercises = exerciseBlocks(sectionBody(src, '## 你來做'));
	if (exercises.length === 0) issues.push('「你來做」裡沒有 Exercise');
	for (const ex of exercises) issues.push(...checkExercise(ex));
	if (!src.includes('/exit')) issues.push('章內沒提到 /exit');
	return issues;
}

/** code fence 內 `cat > <path> <<'EOF'` 的目標路徑（貼給讀者的檔案清單）。 */
export function heredocTargets(src: string): string[] {
	const targets: string[] = [];
	for (const block of codeBlocks(src)) {
		for (const m of block.matchAll(/^\s*cat > (\S+) <<'EOF'\s*$/gm)) targets.push(m[1]);
	}
	return targets;
}

/** 期末作業頁的規則：四段標題、說明段字數、練習規則、五章工具都提到、不把 .claude/ 檔案貼給讀者。 */
export function checkCapstone(src: string): string[] {
	const issues: string[] = [];
	if (!fencesClosed(src)) issues.push('code fence 沒有閉合');
	const positions = headingPositions(src, CAPSTONE_SECTIONS);
	CAPSTONE_SECTIONS.forEach((heading, i) => {
		if (positions[i] < 0) issues.push(`缺標題或順序錯：${heading}`);
	});
	for (const heading of CAPSTONE_SECTIONS.slice(0, 3)) {
		const n = proseChars(sectionBody(src, heading));
		if (n < MIN_BODY_CHARS) issues.push(`${heading} 正文只有 ${n} 個非空白字元（需 ≥${MIN_BODY_CHARS}）`);
	}
	const exercises = exerciseBlocks(sectionBody(src, '## 你來做'));
	if (exercises.length === 0) issues.push('「你來做」裡沒有 Exercise');
	for (const ex of exercises) issues.push(...checkExercise(ex));
	if (!src.includes('/exit')) issues.push('章內沒提到 /exit');
	for (const word of CAPSTONE_MENTIONS) if (!src.includes(word)) issues.push(`沒提到 ${word}`);
	for (const target of heredocTargets(src)) {
		if (target.startsWith('.claude/')) issues.push(`把 ${target} 貼給了讀者（期末作業的工具檔要讀者自己寫）`);
	}
	return issues;
}
