/**
 * A tiny, safe Markdown renderer for AI answers.
 *
 * Everything is HTML-escaped first; only a fixed set of constructs is turned back into markup:
 * paragraphs, `-`/`*`/`1.` lists, `###` headings, **bold**, *italic*, `code`, fenced code blocks,
 * http(s) links and `[n]` source citations. No raw HTML from the model ever reaches the page.
 */

function escapeHTML(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function renderInline(
	escaped: string,
	sources: ReadonlyArray<{ index: number; url: string }>,
): string {
	const codeSpans: string[] = [];
	// Code spans are swapped out while the other rules run, so `*` or `[1]` inside code stay literal.
	let out = escaped.replace(/`([^`]+)`/g, (_, code: string) => {
		codeSpans.push(`<code>${code}</code>`);
		return `${PLACEHOLDER}${codeSpans.length - 1}${PLACEHOLDER}`;
	});

	out = out
		// [text](https://…) — the URL was escaped already, so quotes cannot break out.
		.replace(
			/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
			'<a href="$2" target="_blank" rel="noopener noreferrer nofollow" class="text-primary hover:underline">$1</a>',
		)
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
		// Citations like [1] or [2][3] (or [1, 2]).
		.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, (match, list: string) =>
			list
				.split(",")
				.map((n) => {
					const source = sources.find((s) => s.index === Number(n.trim()));
					if (!source) return match;
					return `<a class="xray-cite" href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer nofollow" title="${escapeHTML(source.url)}">${source.index}</a>`;
				})
				.join(""),
		);

	return out.replace(PLACEHOLDER_PATTERN, (_, i: string) => codeSpans[Number(i)] ?? "");
}

/** Private-use character — cannot appear in escaped model output. */
const PLACEHOLDER = "";
const PLACEHOLDER_PATTERN = new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, "g");

export function renderMarkdown(
	markdown: string,
	sources: ReadonlyArray<{ index: number; url: string }> = [],
): string {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const html: string[] = [];
	let paragraph: string[] = [];
	let list: { ordered: boolean; items: string[] } | null = null;
	let code: string[] | null = null;

	const flushParagraph = () => {
		if (paragraph.length)
			html.push(`<p>${renderInline(escapeHTML(paragraph.join(" ")), sources)}</p>`);
		paragraph = [];
	};
	const flushList = () => {
		if (list) {
			const tag = list.ordered ? "ol" : "ul";
			html.push(
				`<${tag}>${list.items.map((item) => `<li>${renderInline(escapeHTML(item), sources)}</li>`).join("")}</${tag}>`,
			);
		}
		list = null;
	};

	for (const line of lines) {
		if (code) {
			if (line.trim().startsWith("```")) {
				html.push(`<pre><code>${escapeHTML(code.join("\n"))}</code></pre>`);
				code = null;
			} else {
				code.push(line);
			}
			continue;
		}
		if (line.trim().startsWith("```")) {
			flushParagraph();
			flushList();
			code = [];
			continue;
		}

		const heading = line.match(/^#{1,6}\s+(.*)$/);
		const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
		const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

		if (heading) {
			flushParagraph();
			flushList();
			html.push(`<h4>${renderInline(escapeHTML(heading[1] ?? ""), sources)}</h4>`);
		} else if (bullet || numbered) {
			flushParagraph();
			const ordered = !!numbered;
			if (!list || list.ordered !== ordered) {
				flushList();
				list = { ordered, items: [] };
			}
			list.items.push((bullet ?? numbered)![1] ?? "");
		} else if (!line.trim()) {
			flushParagraph();
			flushList();
		} else {
			flushList();
			paragraph.push(line.trim());
		}
	}

	// An unterminated code fence while streaming is shown as code so far.
	if (code) html.push(`<pre><code>${escapeHTML(code.join("\n"))}</code></pre>`);
	flushParagraph();
	flushList();
	return html.join("");
}
