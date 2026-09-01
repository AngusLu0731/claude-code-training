/**
 * fenced code block 的偵測，規則對齊 CommonMark：
 * 開頭 fence 是 ``` 以上的反引號（可帶 info string）；關閉 fence 只能是反引號（數量 ≥ 開頭）且縮排不超過開頭＋3。
 * 巢狀（開頭用 ````、內層用 ```）不會提早關閉。maskFences 與 collectChecklistIds、content test 共用，
 * 才能保證「code block 裡的 ##、<Checklist、### 預期看到」在建置與測試裡都被同樣忽略。
 */
export type FenceInfo = {
	/** 每一行是否在 fence 內（fence 標記行本身為 false）。 */
	inside: boolean[];
	/** 每一行是否為 fence 標記行。 */
	marker: boolean[];
	/** 走完全文時是否所有 fence 都已關閉。 */
	closed: boolean;
};

const FENCE = /^(\s*)(`{3,})(.*)$/;

export function analyzeFences(source: string): FenceInfo {
	const lines = source.split('\n');
	const inside: boolean[] = [];
	const marker: boolean[] = [];
	let open: { indent: number; ticks: number } | null = null;
	for (const line of lines) {
		const m = FENCE.exec(line);
		if (!open) {
			if (m) {
				open = { indent: m[1].length, ticks: m[2].length };
				marker.push(true);
				inside.push(false);
			} else {
				marker.push(false);
				inside.push(false);
			}
			continue;
		}
		const closes = m !== null && m[2].length >= open.ticks && m[3].trim() === '' && m[1].length <= open.indent + 3;
		if (closes) {
			open = null;
			marker.push(true);
			inside.push(false);
		} else {
			marker.push(false);
			inside.push(true);
		}
	}
	return { inside, marker, closed: open === null };
}

/** 把 fence 內的每一行換成等長空白（保留 fence 標記行與所有換行，字元 offset 不變）。 */
export function maskFences(source: string): string {
	const { inside } = analyzeFences(source);
	return source
		.split('\n')
		.map((line, i) => (inside[i] ? ' '.repeat(line.length) : line))
		.join('\n');
}

/** 所有 fence 是否成對閉合。 */
export function fencesClosed(source: string): boolean {
	return analyzeFences(source).closed;
}

/** 依序回傳每個 fenced code block 的內容原文（不含 fence 標記行）。 */
export function codeBlocks(source: string): string[] {
	const lines = source.split('\n');
	const { inside } = analyzeFences(source);
	const blocks: string[] = [];
	let current: string[] | null = null;
	lines.forEach((line, i) => {
		if (inside[i]) {
			(current ??= []).push(line);
		} else if (current) {
			blocks.push(current.join('\n'));
			current = null;
		}
	});
	if (current) blocks.push(current.join('\n'));
	return blocks;
}
