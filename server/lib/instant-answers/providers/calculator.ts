import { MathParser } from "../math/parser";
import { InstantAnswerProvider } from "../provider";

export class CalculatorProvider extends InstantAnswerProvider {
	static readonly definition = InstantAnswerProvider.define({
		id: "calculator",
		name: "Calculator",
		description: "Evaluates arithmetic like `2^10 / 4`, `sqrt(2)`, `15% of 80` or `sin(30°)`.",
		priority: 10,
		network: false,
		examples: ["(3 + 4) * 12", "15% of 80", "sqrt(2)", "5!"],
	});

	answer(query: string) {
		const expression = query
			.trim()
			.replace(/^(calc|calculate|compute|what is|what's|whats|solve)\s+/i, "")
			.replace(/\s*=\s*\??$/, "")
			.replace(/\?$/, "")
			.trim();

		if (!expression || expression.length > 200 || !MathParser.looksLikeMath(expression)) return null;
		// Dates and phone numbers look like subtraction.
		if (
			/^\d{1,4}([-/.])\d{1,2}\1\d{1,4}$/.test(expression) ||
			/^\+?\d+(-\d+){2,}$/.test(expression)
		) {
			return null;
		}
		// A lone signed number ("-5") is not a calculation.
		if (/^[-+]?\d+(\.\d+)?%?$/.test(expression) && !expression.endsWith("%")) return null;

		let value: number;
		try {
			value = MathParser.evaluate(expression);
		} catch {
			return null;
		}
		if (Number.isNaN(value)) return null;

		const result = MathParser.format(value);
		return {
			provider: CalculatorProvider.definition.id,
			type: "calculator",
			placement: "top" as const,
			title: "Calculator",
			text: `${expression} = ${result}`,
			data: { expression, result, value: Number.isFinite(value) ? value : null },
			source: null,
		};
	}
}
