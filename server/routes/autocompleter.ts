import {
	createError,
	defineEventHandler,
	getMethod,
	getQuery,
	getRequestURL,
	readFormData,
	setResponseHeader,
} from "h3";
import { NitroBridge } from "../lib/api/utils/nitroBridge";

/**
 * Legacy suggestion endpoint. Browsers (and extensions) that added X-Ray from an older,
 * SearXNG-style OpenSearch description still request `/autocompleter?q={searchTerms}` — as a GET,
 * or as a POST with a form body. Served by `/api/v1/search/suggest/opensearch`, so the answer is
 * the OpenSearch suggestions shape `[query, [suggestion, …]]` (`application/x-suggestions+json`),
 * with the session cookie and `search_access` applied as for the current endpoint.
 */
export default defineEventHandler(async (event) => {
	const method = getMethod(event);
	if (method !== "GET" && method !== "HEAD" && method !== "POST") {
		setResponseHeader(event, "Allow", "GET, HEAD, POST");
		throw createError({ statusCode: 405, statusMessage: "Method Not Allowed" });
	}

	const fromQuery = getQuery(event).q;
	let q = [fromQuery].flat().find((value) => typeof value === "string");
	if (q === undefined && method === "POST") {
		const form = await readFormData(event).catch(() => null);
		const value = form?.get("q");
		if (typeof value === "string") q = value;
	}

	const url = new URL("/api/v1/search/suggest/opensearch", getRequestURL(event));
	url.searchParams.set("q", q ?? "");
	return NitroBridge.forward(event, url, "GET");
});
