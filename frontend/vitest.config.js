import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.js so `npm test` (node --test) is untouched.
// Vitest only picks up .jsx specs here — node --test keeps the .js ones.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.jsx"],
    setupFiles: ["tests/setup.jsx"],
  },
});
