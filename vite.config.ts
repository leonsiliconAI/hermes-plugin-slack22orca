import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// The bridge and the worker it starts, which each plugin ships beside its bundle.
const shipped = ["_bridge.py", "bridge.cjs"].map((name) => ({
  name,
  path: fileURLToPath(new URL("./" + name, import.meta.url)),
}));
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
          for (const { name, path } of shipped) {
            if (path !== resolve(name)) this.addWatchFile(path);
            this.emitFile({ type: "asset", fileName: name, source: readFileSync(path) });
          }
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
