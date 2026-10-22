import { defineConfig } from "vitest/config";
import path from "path";

// Minimal config used only to run the language regression tests without the
// repo's setup file (which depends on an uninstalled package).
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/test/language-codes.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
