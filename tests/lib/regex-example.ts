/**
 * 從 regex 原文產生一個必定匹配的字串，讓 blacklist test 能對詞庫裡的 regex 做「動態」正案例，
 * 而不用把敏感字面值寫進測試碼。只支援詞庫用到的子集（字面、跳脫、\d \w \s \b、群組與 |、量詞、字元類別）；
 * 碰到不支援的語法就丟錯，逼維護者擴充，不要默默給錯例。
 */
export function exampleFor(pattern: string): string {
	let i = 0;
	const peek = () => pattern[i];
	const next = () => pattern[i++];
	const fail = (why: string): never => {
		throw new Error(`exampleFor 不支援：${why}（位置 ${i}）`);
	};

	function alternatives(): string {
		const first = sequence();
		while (peek() === '|') {
			next();
			sequence(); // 其餘分支照樣解析（檢查語法）但只用第一個
		}
		return first;
	}

	function sequence(): string {
		let out = '';
		while (i < pattern.length && peek() !== '|' && peek() !== ')') out += quantified(atom());
		return out;
	}

	function escaped(): string {
		const e = next();
		if (e === undefined) return fail('結尾的反斜線');
		if (e === 'd') return '0';
		if (e === 'w') return 'a';
		if (e === 's') return ' ';
		if (e === 'b' || e === 'B') return '';
		if (/[DWS]/.test(e)) return fail(`\\${e}`);
		return e; // 跳脫的字面字元
	}

	function atom(): string {
		const c = next();
		if (c === '\\') return escaped();
		if (c === '(') {
			if (pattern.startsWith('?:', i)) i += 2;
			else if (peek() === '?') fail('lookaround 或具名群組');
			const inner = alternatives();
			if (next() !== ')') fail('群組沒有關閉');
			return inner;
		}
		if (c === '[') return charClass();
		if (c === '.') return 'x';
		if (c === '^' || c === '$') return '';
		if (c === '*' || c === '+' || c === '?' || c === '{') return fail(`量詞 ${c} 前面沒有東西`);
		return c;
	}

	function charClass(): string {
		if (peek() === '^') fail('否定字元類別');
		let pick: string | null = null;
		while (i < pattern.length && peek() !== ']') {
			let ch = next();
			if (ch === '\\') ch = escaped();
			if (pick === null) pick = ch;
			if (peek() === '-' && pattern[i + 1] !== ']') {
				next();
				next(); // 範圍：取起點就夠
			}
		}
		if (next() !== ']' || pick === null) fail('字元類別沒有關閉或是空的');
		return pick;
	}

	function quantified(value: string): string {
		const c = peek();
		if (c === '*') {
			next();
			lazy();
			return '';
		}
		if (c === '+' || c === '?') {
			next();
			lazy();
			return value;
		}
		if (c === '{') {
			const m = /^\{(\d+)(,\d*)?\}/.exec(pattern.slice(i));
			if (!m) fail('{} 量詞格式');
			i += m![0].length;
			lazy();
			return value.repeat(Number(m![1]));
		}
		return value;
	}

	function lazy() {
		if (peek() === '?') next();
	}

	const result = alternatives();
	if (i !== pattern.length) fail('多餘的 )');
	return result;
}

/** 字母↔數字互換：對「只由字面、\d、\b 組成」的 regex 而言是保證不匹配的反例；若還能匹配代表 regex 過寬。 */
export function mutateExample(example: string): string {
	return example.replace(/[A-Za-z0-9]/g, (c) => (/\d/.test(c) ? 'z' : '9'));
}
