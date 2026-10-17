// PROTOTYPE — throwaway. `bun run start` → http://localhost:3013/?variant=A
import index from "./index.html";

const server = Bun.serve({
  port: 3013,
  development: true,
  routes: {
    "/": index,
    "/machines.json": () => new Response(Bun.file(new URL("./machines.json", import.meta.url))),
  },
});
console.log(`Browse prototype: ${server.url}?variant=A  (B, C — or [ / ] keys)`);
