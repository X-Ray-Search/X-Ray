/**
 * Safe arithmetic expression evaluator for the calculator (no `eval`).
 *
 * Supports `+ - * / ^ **`, `mod` / `a % b`, percentages (`20%`, `20% of 150`, `150 + 10%`),
 * factorial `!`, parentheses, implicit multiplication (`2pi`, `3(4+5)`), `x`/`×`/`÷`,
 * degrees (`sin(30°)`, `30 deg`), constants and the usual functions.
 */
export class MathParser {
	private static readonly FUNCTIONS: Record<string, (...args: number[]) => number> = {
		sqrt: Math.sqrt,
		cbrt: Math.cbrt,
		abs: Math.abs,
		sin: Math.sin,
		cos: Math.cos,
		tan: Math.tan,
		asin: Math.asin,
		acos: Math.acos,
		atan: Math.atan,
		sinh: Math.sinh,
		cosh: Math.cosh,
		tanh: Math.tanh,
		ln: Math.log,
		log: (x, base) => (base === undefined ? Math.log10(x) : Math.log(x) / Math.log(base)),
		log10: Math.log10,
		log2: Math.log2,
		exp: Math.exp,
		floor: Math.floor,
		ceil: Math.ceil,
		round: Math.round,
		min: Math.min,
		max: Math.max,
	};

	private static readonly CONSTANTS: Record<string, number> = {
		pi: Math.PI,
		π: Math.PI,
		e: Math.E,
		tau: 2 * Math.PI,
		phi: (1 + Math.sqrt(5)) / 2,
	};

	private tokens: MathParser.Token[] = [];
	private position = 0;

	private constructor(input: string) {
		this.tokens = MathParser.tokenize(input);
	}

	/** Evaluate an expression; throws `MathParser.ParseError` on invalid input. */
	static evaluate(input: string): number {
		const parser = new MathParser(input);
		if (!parser.tokens.length) throw new MathParser.ParseError("Empty expression");
		const value = parser.parseAdditive();
		if (parser.position < parser.tokens.length) {
			throw new MathParser.ParseError(`Unexpected '${parser.tokens[parser.position]!.value}'`);
		}
		return value.value;
	}

	/** Whether a string looks like arithmetic (operators or functions + at least one number). */
	static looksLikeMath(input: string): boolean {
		if (!/[\d.]|\b(pi|e|tau|phi)\b|π/.test(input)) return false;
		const hasOperator = /[+\-*/^%!×÷]|\bmod\b|\bof\b|°|\bdeg\b|\d\s*x\s*\d/.test(input);
		const hasFunction = new RegExp(`\\b(${Object.keys(this.FUNCTIONS).join("|")})\\b`).test(input);
		return hasOperator || hasFunction;
	}

	static tokenize(input: string): MathParser.Token[] {
		const tokens: MathParser.Token[] = [];
		const source = input
			.toLowerCase()
			.replace(/\*\*/g, "^")
			.replace(/×/g, "*")
			.replace(/÷/g, "/")
			.replace(/−/g, "-");
		let i = 0;
		while (i < source.length) {
			const char = source[i]!;
			if (/\s/.test(char)) {
				i++;
				continue;
			}
			const number = source.slice(i).match(/^(\d+(?:[_,]\d{3})*(?:\.\d+)?|\.\d+)(e[+-]?\d+)?/);
			if (number) {
				tokens.push({ type: "number", value: number[0].replace(/[_,]/g, "") });
				i += number[0].length;
				continue;
			}
			const word = source.slice(i).match(/^([a-zπ][a-z0-9]*)/);
			if (word) {
				// `x` between operands means multiplication ("3 x 4").
				tokens.push({
					type: word[0] === "x" ? "operator" : "word",
					value: word[0] === "x" ? "*" : word[0],
				});
				i += word[0].length;
				continue;
			}
			if ("+-*/^%!(),°".includes(char)) {
				tokens.push({
					type: char === "(" || char === ")" || char === "," ? "paren" : "operator",
					value: char,
				});
				i++;
				continue;
			}
			throw new MathParser.ParseError(`Unexpected character '${char}'`);
		}
		return tokens;
	}

	private peek() {
		return this.tokens[this.position];
	}

	private next() {
		return this.tokens[this.position++];
	}

	private expect(value: string) {
		const token = this.next();
		if (token?.value !== value) throw new MathParser.ParseError(`Expected '${value}'`);
	}

	/** Can the token at `offset` start an operand (for implicit multiplication)? */
	private startsOperand(offset = 0) {
		const token = this.tokens[this.position + offset];
		if (!token) return false;
		if (token.type === "number") return true;
		if (token.value === "(") return true;
		return (
			token.type === "word" && token.value !== "mod" && token.value !== "of" && token.value !== "deg"
		);
	}

	private parseAdditive(): MathParser.Value {
		let left = this.parseMultiplicative();
		while (this.peek()?.value === "+" || this.peek()?.value === "-") {
			const op = this.next()!.value;
			const right = this.parseMultiplicative();
			// "150 + 10%" means 150 * 1.10, like pocket calculators and Google.
			const amount = right.percent ? left.value * right.value : right.value;
			left = { value: op === "+" ? left.value + amount : left.value - amount };
		}
		return left;
	}

	private parseMultiplicative(): MathParser.Value {
		let left = this.parseUnary();
		for (;;) {
			const token = this.peek();
			if (token?.value === "*" || token?.value === "/" || token?.value === "of") {
				this.next();
				const right = this.parseUnary();
				if (token.value === "/") {
					if (right.value === 0) throw new MathParser.ParseError("Division by zero");
					left = { value: left.value / right.value };
				} else {
					left = { value: left.value * right.value };
				}
			} else if (token?.value === "mod" || (token?.value === "%" && this.isModulo())) {
				this.next();
				const right = this.parseUnary();
				left = { value: ((left.value % right.value) + right.value) % right.value };
			} else if (this.startsOperand()) {
				left = { value: left.value * this.parseUnary().value };
			} else {
				return left;
			}
		}
	}

	/** `%` followed by an operand is modulo; otherwise it is a percent sign. */
	private isModulo() {
		return this.startsOperand(1);
	}

	private parseUnary(): MathParser.Value {
		const token = this.peek();
		if (token?.value === "-" || token?.value === "+") {
			this.next();
			const operand = this.parseUnary();
			return { ...operand, value: token.value === "-" ? -operand.value : operand.value };
		}
		return this.parsePower();
	}

	private parsePower(): MathParser.Value {
		const base = this.parsePostfix();
		if (this.peek()?.value === "^") {
			this.next();
			const exponent = this.parseUnary();
			return { value: base.value ** exponent.value };
		}
		return base;
	}

	private parsePostfix(): MathParser.Value {
		let operand = this.parsePrimary();
		for (;;) {
			const token = this.peek();
			if (token?.value === "!") {
				this.next();
				operand = { value: MathParser.factorial(operand.value) };
			} else if (token?.value === "%" && !this.isModulo()) {
				this.next();
				operand = { value: operand.value / 100, percent: true };
			} else if (token?.value === "°" || token?.value === "deg") {
				this.next();
				operand = { value: (operand.value * Math.PI) / 180 };
			} else {
				return operand;
			}
		}
	}

	private parsePrimary(): MathParser.Value {
		const token = this.next();
		if (!token) throw new MathParser.ParseError("Unexpected end of expression");

		if (token.type === "number") return { value: Number(token.value) };

		if (token.value === "(") {
			const inner = this.parseAdditive();
			this.expect(")");
			return { value: inner.value };
		}

		if (token.type === "word") {
			if (token.value in MathParser.CONSTANTS) return { value: MathParser.CONSTANTS[token.value]! };
			const fn = MathParser.FUNCTIONS[token.value];
			if (fn) {
				if (this.peek()?.value === "(") {
					this.next();
					const args = [this.parseAdditive().value];
					while (this.peek()?.value === ",") {
						this.next();
						args.push(this.parseAdditive().value);
					}
					this.expect(")");
					return { value: fn(...args) };
				}
				// "sqrt 16", "sin 30°"
				return { value: fn(this.parsePostfix().value) };
			}
		}
		throw new MathParser.ParseError(`Unknown token '${token.value}'`);
	}

	static factorial(n: number): number {
		if (!Number.isInteger(n) || n < 0)
			throw new MathParser.ParseError("Factorial needs a non-negative integer");
		if (n > 170) return Number.POSITIVE_INFINITY;
		let result = 1;
		for (let i = 2; i <= n; i++) result *= i;
		return result;
	}

	/** Human friendly number formatting: 12 significant digits, exponent for extremes. */
	static format(value: number): string {
		if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? "-∞" : "NaN";
		if (value === 0) return "0";
		const abs = Math.abs(value);
		if (abs >= 1e15 || abs < 1e-9) {
			return value.toExponential(10).replace(/\.?0+e/, "e");
		}
		return Number.parseFloat(value.toPrecision(12)).toString();
	}
}

export namespace MathParser {
	export interface Token {
		type: "number" | "word" | "operator" | "paren";
		value: string;
	}

	export interface Value {
		value: number;
		/** Set when the operand was written as a percentage. */
		percent?: boolean;
	}

	export class ParseError extends Error {}
}
