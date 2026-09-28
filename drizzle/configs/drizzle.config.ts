import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./drizzle/migrations",
	schema: "./server/lib/db/schema.ts",
	dialect: "sqlite",
	dbCredentials: {
		//@ts-expect-error
		url: process.env.XRAY_DB_PATH || "./data/db.sqlite",
	},
	verbose: true,
	strict: true,
});
