import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const runtime = fileURLToPath(new URL("./_pythonmonkey.py", import.meta.url));
const slack = fileURLToPath(new URL("./slack.ts", import.meta.url));
const slackModule = "\0hermes-slack.ts";

export default defineConfig({
  pack: {
    entry: "policy.ts",
    format: "cjs",
    platform: "neutral",
    outDir: ".",
    clean: false,
    dts: false,
    fixedExtension: true,
    plugins: [
      {
        name: "hermes-plugin-files",
        buildStart() {
          if (runtime !== resolve("_pythonmonkey.py")) this.addWatchFile(runtime);
          this.emitFile({
            type: "asset",
            fileName: "_pythonmonkey.py",
            source: readFileSync(runtime),
          });
        },
        resolveId(source) {
          if (source === "#slack") return slackModule;
        },
        load(id) {
          if (id !== slackModule) return;
          this.addWatchFile(slack);
          return readFileSync(slack, "utf8");
        },
      },
    ],
  },
});
