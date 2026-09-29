import { defineEventHandler } from "h3";
import { NitroBridge } from "../../lib/api/utils/nitroBridge";

// Catch-all: forward every /api/** request to the Hono app (mounted at /api).
// Hono then handles /api/v1/**, /api/searxng/**, /api/health, /api/docs/v1. See docs/04-backend-hono.md.
export default defineEventHandler((event) => NitroBridge.forward(event));
