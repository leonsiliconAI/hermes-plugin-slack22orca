import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: "policy.ts",
    format: "cjs",
    platform: "neutral",
    outDir: ".",
    clean: false,
    dts: false,
    fixedExtension: true,
  },
});
