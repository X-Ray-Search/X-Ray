import { fileURLToPath } from "node:url";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2026-09-01",
	devtools: { enabled: true },
	modules: ["@nuxt/ui"],

	colorMode: {
		preference: "dark",
		fallback: "dark",
		classSuffix: "",
	},

	ssr: true,

	css: ["~/assets/css/main.css"],

	typescript: {
		// Nitro's typed routes pull server/ into the app type project, and server/ uses Bun APIs.
		tsConfig: { compilerOptions: { types: ["bun-types"] } },
	},

	icon: {
		// `/api/**` belongs to the Hono backend; serve runtime icon lookups elsewhere.
		localApiEndpoint: "/_nuxt_icon",
	},

	app: {
		head: {
			htmlAttrs: { lang: "en", class: "dark" },
			title: "X-Ray",
			meta: [
				{ name: "description", content: "X-Ray — a private, self-hosted meta search engine." },
				{ name: "theme-color", content: "#07080b" },
				{ name: "referrer", content: "no-referrer" },
			],
			link: [
				{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
				{
					rel: "search",
					type: "application/opensearchdescription+xml",
					title: "X-Ray",
					href: "/opensearch.xml",
				},
			],
		},
	},

	nitro: {
		rollupConfig: {
			external: ["bun:sqlite"],

			output: {
				banner: (function () {
					const mappings = {
						XRAY_APP_URL: "APP_URL",
					};

					const bannerCode = `
						(function () {
							const mappings = ${JSON.stringify(mappings)};
							const env = globalThis.process?.env ?? {};
							for (const [envName, runtimeName] of Object.entries(mappings)) {
								if (!env['NUXT_PUBLIC_' + runtimeName] && env[envName]) {
									env['NUXT_PUBLIC_' + runtimeName] = env[envName];
								}
							}
						})();
					`;

					return bannerCode.replace(/^\s+|\s+$/g, "").replace(/\n\s*/g, " ");
				})(),
			},
		},

		// server/ runs on Bun (bun:sqlite, Bun.password, …).
		typescript: {
			tsConfig: { compilerOptions: { types: ["bun-types"] } },
		},

		esbuild: {
			options: {
				target: "esnext",
			},
		},
	},

	$production: {
		nitro: {
			// Same as the `bun` preset entry, but passes the client address through (see the file).
			entry: fileURLToPath(new URL("./server/runtime/bun-entry.ts", import.meta.url)),
		},
	},

	runtimeConfig: {
		public: {
			//@ts-ignore
			appUrl: process.env.XRAY_APP_URL || "http://localhost:12418",
		},
	},

	routeRules: {
		"/dashboard/**": { ssr: false },
		"/auth/**": { ssr: false },
		"/**": { ssr: true },
	},

	telemetry: false,
});
