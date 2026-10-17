// PROTOTYPE — throwaway. `bun run start` → http://localhost:3013/  (round 1 variants at /round1?variant=A)
import index from "./index.html";
import round1 from "./round1.html";

const server = Bun.serve({
  port: 3013,
  development: true,
  routes: {
    "/": index,
    "/round1": round1,
    "/machines.json": () => new Response(Bun.file(new URL("./machines.json", import.meta.url))),
  },
});
console.log(`Browse prototype round 2: ${server.url}  ·  round 1: ${server.url}round1?variant=A`);
