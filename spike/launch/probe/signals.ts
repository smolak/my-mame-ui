// Plain-Bun probe (no Electrobun): how does MAME react to each stop signal, and does the Lua stop file work?
// usage: bun probe/signals.ts <mame-home-dir> <machine>
// MAME_BIN overrides the binary (default "mame" on PATH); MAME_ARGS adds space-separated options (e.g. "-video soft -sound none"). Each case starts a fresh MAME, waits 6 s, then stops it.
import { join } from "node:path";
import { tmpdir } from "node:os";

const [cwd, machine] = process.argv.slice(2);
const bin = process.env.MAME_BIN ?? "mame";
const script = join(import.meta.dir, "stop.lua");
const cases = process.platform === "win32" ? ["luastop", "kill"] : ["SIGTERM", "SIGINT", "SIGQUIT", "SIGHUP", "luastop"];

for (const c of cases) {
	const stopFile = join(tmpdir(), `mymame-stop-${Date.now()}`);
	const extra = (process.env.MAME_ARGS ?? "").split(" ").filter(Boolean);
	const args = [bin, "-window", "-skip_gameinfo", ...extra, ...(c === "luastop" ? ["-autoboot_script", script] : []), machine];
	const p = Bun.spawn(args, { cwd, stdout: "ignore", stderr: "pipe", env: { ...process.env, MYMAME_STOP_FILE: stopFile } });
	await Bun.sleep(6000);
	const t = Date.now();
	if (c === "luastop") await Bun.write(stopFile, "");
	else if (c === "kill") p.kill();
	else p.kill(c as NodeJS.Signals);
	const r = await Promise.race([p.exited.then(() => "exited"), Bun.sleep(5000).then(() => "timeout")]);
	if (r === "timeout") { p.kill("SIGKILL"); await p.exited; }
	const stderr = (await new Response(p.stderr).text()).replace("**Error loading plugin.ini**", "").trim().slice(-200);
	console.log(JSON.stringify({ platform: process.platform, case: c, result: r, ms: Date.now() - t, exitCode: p.exitCode, signalCode: p.signalCode, stderr }));
}
