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
    // Keep module names identical in the workspace and in standalone mirrors.
    inputOptions(options) {
      return { ...options, resolve: { ...options.resolve, symlinks: false } };
    },
  },
});
