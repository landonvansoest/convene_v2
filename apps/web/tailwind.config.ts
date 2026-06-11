import type { Config } from "tailwindcss";

/**
 * Paths are relative to `apps/web` (where `next dev` / PostCSS run).
 * Keeps editor tooling happy; primary scanning is still `@source` in `src/app/globals.css`.
 */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
} satisfies Config;
