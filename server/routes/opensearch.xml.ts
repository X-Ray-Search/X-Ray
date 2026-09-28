import { defineEventHandler, getRequestURL, setResponseHeader } from "h3";
import { SettingsHandler } from "../lib/settings";

/**
 * OpenSearch description (https://github.com/dewitt/opensearch) — lets browsers add X-Ray as a
 * search engine and use its suggestions in the address bar.
 */
export default defineEventHandler(async (event) => {
	const origin = getRequestURL(event).origin;
	const { instance_name } = await SettingsHandler.getInstance();
	const name = instance_name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

	setResponseHeader(event, "Content-Type", "application/opensearchdescription+xml; charset=utf-8");
	setResponseHeader(event, "Cache-Control", "public, max-age=3600");

	return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">
	<ShortName>${name}</ShortName>
	<Description>Search with ${name} — a privacy-respecting meta search engine</Description>
	<InputEncoding>UTF-8</InputEncoding>
	<Image type="image/svg+xml">${origin}/favicon.svg</Image>
	<Url type="text/html" method="get" template="${origin}/search?q={searchTerms}"/>
	<Url type="application/x-suggestions+json" method="get" template="${origin}/api/v1/search/suggest/opensearch?q={searchTerms}"/>
	<Url type="application/opensearchdescription+xml" rel="self" template="${origin}/opensearch.xml"/>
	<moz:SearchForm>${origin}/</moz:SearchForm>
</OpenSearchDescription>`;
});
