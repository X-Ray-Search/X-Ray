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

	css: [
		"~/assets/css/main.css"
	],

	nitro: {
		
		rollupConfig: { external: ["bun:sqlite"] },

		esbuild: {
			options: {
				target: "esnext"
			}
		}
	},

	runtimeConfig: {
		public: {
			//@ts-ignore
			appUrl: process.env.APPPREFIX_APP_URL || "http://localhost:12520",
		},
	},
	
	routeRules: {
		"/dashboard/**": { ssr: false },
		"/auth/**": { ssr: false },
		"/**": { ssr: true },
	},

	telemetry: false

});