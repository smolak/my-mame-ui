// PROTOTYPE — throwaway. `bun run start` → http://localhost:3013/  (round 1 variants at /round1?variant=A)
import index from "./index.html";
import round1 from "./round1.html";

const server = Bun.serve({
  port: 3013,
  development: true,
  routes: {
    "/": index,
    "/round1": round1,
    // Real ScreenScraper Media pulled for a few sets (gitignored): /real-media/index.json + files
    "/real-media/index.json": async () => {
      const out: Record<string, unknown> = {};
      for (const f of new Bun.Glob("*/meta.json").scanSync(new URL("./real-media", import.meta.url).pathname))
        out[f.split("/")[0]] = await Bun.file(new URL(`./real-media/${f}`, import.meta.url)).json();
      return Response.json(out);
    },
    "/real-media/*": (req) => new Response(Bun.file(new URL("." + new URL(req.url).pathname, import.meta.url))),
    "/machines.json": () => new Response(Bun.file(new URL("./machines.json", import.meta.url))),
  },
});
console.log(`Browse prototype round 2: ${server.url}  ·  round 1: ${server.url}round1?variant=A`);
