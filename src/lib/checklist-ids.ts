/**
 * 從各章 mdx 原文收集 <Checklist items={[{id:'…', text:'…'}, …]} /> 裡的全部 id。
 * 首頁 Progress 元件（build 時）與 tests/content.test.ts 共用同一支 parser，分母才不會不一致。
 * fenced code block 裡的 <Checklist> 與 id 一律不算（先經 maskFences 遮掉）。
 */
import { maskFences } from './mask-fences';

export const CHECKLIST_ID_PATTERN = /^ch[1-5]-ex\d+-\d+$/;

/** 回傳每個 code fence 外的 <Checklist … /> 標籤的屬性原文（不含標籤本身）。 */
export function extractChecklistBlocks(source: string): string[] {
	const blocks: string[] = [];
	const tag = /<Checklist\b([\s\S]*?)\/>/g;
	const masked = maskFences(source);
	let match: RegExpExecArray | null;
	while ((match = tag.exec(masked)) !== null) blocks.push(match[1]);
	return blocks;
}

/** 依原文順序回傳全部 checklist id（不去重，重複交給測試抓）。 */
export function collectChecklistIds(sources: string[]): string[] {
	const ids: string[] = [];
	for (const source of sources) {
		for (const block of extractChecklistBlocks(source)) {
			for (const m of block.matchAll(/\bid\s*:\s*(['"])([^'"]+)\1/g)) ids.push(m[2]);
		}
	}
	return ids;
}
