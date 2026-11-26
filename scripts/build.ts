import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
const build = await Bun.build({
  entrypoints: ["src/main.ts"],
  outdir: "dist",
  target: "browser",
  minify: true,
});
if (!build.success) {
  for (const log of build.logs) console.error(log);
  process.exit(1);
}
await Promise.all(
  ["index.html", "styles.css", "favicon.svg"].map((name) => copyFile("public/" + name, "dist/" + name)),
);
