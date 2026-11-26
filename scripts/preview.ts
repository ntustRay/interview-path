const assets = new Map([
  ["/", "dist/index.html"],
  ["/main.js", "dist/main.js"],
  ["/styles.css", "dist/styles.css"],
  ["/favicon.svg", "dist/favicon.svg"],
]);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 4173),
  fetch(request) {
    const asset = assets.get(new URL(request.url).pathname);
    return asset ? new Response(Bun.file(asset)) : new Response("Not found", { status: 404 });
  },
});
console.log("Interview Path is running at " + server.url);
