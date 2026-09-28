/**
 * postEventStream — POST JSON to a Server-Sent Events endpoint of the API and hand every event to
 * `onEvent` (with its JSON-parsed data). Resolves when the stream ends; throws on HTTP errors
 * (with the envelope's message) and with an `AbortError` when `signal` aborts.
 *
 * Exception to "all API calls go through useAPI": the generated SDK cannot consume SSE streams,
 * so this uses `fetch` directly — with the same base URL and session token as `updateAPIClient`.
 * Used by `useAIAnswer` (`POST /search/ai`) and `useAIChat` (`POST /ai/chats/{id}/messages`).
 */
import { API_BASE_URL } from "./updateAPIClient";

function parseJSON(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export async function postEventStream(
	path: string,
	body: Record<string, unknown>,
	options: { signal?: AbortSignal; onEvent: (event: string, data: any) => void },
) {
	const token = useAppCookies().sessionToken.get().value;
	const res = await fetch(`${API_BASE_URL}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "text/event-stream",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
		signal: options.signal,
	});

	if (!res.ok || !res.body) {
		const error = (await res.json().catch(() => null)) as { message?: string } | null;
		throw new Error(error?.message ?? `Request failed (HTTP ${res.status})`);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		// SSE messages are separated by a blank line.
		let boundary = buffer.indexOf("\n\n");
		while (boundary !== -1) {
			const message = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			let event = "message";
			const data: string[] = [];
			for (const line of message.split("\n")) {
				if (line.startsWith("event:")) event = line.slice(6).trim();
				else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
			}
			const payload = parseJSON(data.join("\n"));
			// Anything that is not JSON is none of our events.
			if (payload !== undefined) options.onEvent(event, payload);
			boundary = buffer.indexOf("\n\n");
		}
	}
}
