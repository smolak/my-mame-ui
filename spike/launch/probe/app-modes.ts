// Runs the built spike app once per quit mode and reports what happened to MAME.
// usage: bun probe/app-modes.ts <mame-home-dir> <machine>   (MAME_BIN, MAME_ARGS as in signals.ts)
// Writes one JSON line per run; on Windows also snapshots visible windows (console? game window hidden?).
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [cwd, machine] = process.argv.slice(2);
const win = process.platform === "win32";
const bin = process.env.MAME_BIN ?? "mame";
const extraArgs = (process.env.MAME_ARGS ?? "").split(" ").filter(Boolean);
const delayMs = 8000;

function findLauncher(dir: string): string | undefined {
	for (const e of readdirSync(dir)) {
		const p = join(dir, e);
		if (statSync(p).isDirectory()) { const f = findLauncher(p); if (f) return f; }
		else if (e === (win ? "launcher.exe" : "launcher")) return p;
	}
}
const launcher = findLauncher(join(import.meta.dir, "..", "build"));
if (!launcher) throw new Error("launcher binary not found under build/");

const sh = (cmd: string[]) => Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
const mameAlive = () => (win ? sh(["tasklist", "/FI", "IMAGENAME eq mame.exe", "/NH"]).includes("mame.exe") : sh(["pgrep", "-x", "mame"]) !== "");
const windows = () => (win ? sh(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(import.meta.dir, "windows.ps1")]) : null);
const cleanup = () => {
	if (win) { sh(["taskkill", "/F", "/IM", "mame.exe"]); sh(["taskkill", "/F", "/IM", "launcher.exe"]); sh(["taskkill", "/F", "/IM", "bun.exe", "/FI", `PID ne ${process.pid}`]); }
	else { sh(["pkill", "-9", "-x", "mame"]); sh(["pkill", "-9", "-f", launcher]); }
};

const runs = [
	{ mode: "quit", windowsHide: false },
	{ mode: "crash", windowsHide: false },
	{ mode: "graceful", windowsHide: false },
	...(win ? [{ mode: "graceful", windowsHide: true }] : []),
];

for (const run of runs) {
	cleanup();
	const id = `${run.mode}-${run.windowsHide ? "hide" : "show"}`;
	const log = join(tmpdir(), `spike-${id}.log`);
	const ctlPath = join(tmpdir(), `spike-${id}.json`);
	writeFileSync(log, "");
	writeFileSync(ctlPath, JSON.stringify({ ...run, bin, extraArgs, cwd, machine, delayMs, log, script: join(import.meta.dir, "stop.lua"), stopFile: join(tmpdir(), `spike-stop-${id}`) }));
	const app = Bun.spawn([launcher], { env: { ...process.env, SPIKE_CTL: ctlPath }, stdout: "ignore", stderr: "pipe" });
	await Bun.sleep(5000);
	const windowsWhileRunning = windows();
	const mameRunningBeforeTrigger = mameAlive();
	const appExit = await Promise.race([app.exited, Bun.sleep(delayMs + 7000).then(() => "timeout")]);
	await Bun.sleep(1000);
	const result = {
		platform: process.platform, run: id, mameRunningBeforeTrigger, appExit,
		mameAliveAfterLauncherGone: mameAlive(),
		log: readFileSync(log, "utf8").trim().split("\n"),
		windowsWhileRunning,
		appStderr: appExit === "timeout" ? "" : (await new Response(app.stderr).text()).slice(-400),
	};
	console.log(JSON.stringify(result));
	cleanup();
}
