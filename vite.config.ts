import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  css: {
    modules: {
      localsConvention: "camelCaseOnly",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
