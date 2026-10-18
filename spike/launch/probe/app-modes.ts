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
type Win = { pid: number; process: string; class: string; title: string };
const windows = (): Win[] | null => {
	if (!win) return null;
	const out = sh(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(import.meta.dir, "windows.ps1")]);
	return out ? [].concat(JSON.parse(out)) : [];
};
// PE subsystem: 2 = GUI (no console), 3 = console (gets a console window unless the spawner suppresses it).
const peSubsystem = (file: string) => {
	const b = readFileSync(file);
	return b.readUInt16LE(b.readUInt32LE(0x3c) + 0x5c);
};
if (win) {
	const dir = join(launcher, "..");
	const exes = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".exe")).map((f) => [f, peSubsystem(join(dir, f))]));
	console.log(JSON.stringify({ platform: process.platform, peSubsystem: { ...exes, "mame.exe": peSubsystem(bin) } }));
}
const cleanup = () => {
	if (win) { sh(["taskkill", "/F", "/IM", "mame.exe"]); sh(["taskkill", "/F", "/IM", "launcher.exe"]); sh(["taskkill", "/F", "/IM", "bun.exe", "/FI", `PID ne ${process.pid}`]); }
	else { sh(["pkill", "-9", "-x", "mame"]); sh(["pkill", "-9", "-f", launcher]); }
};

const runs = [
	{ mode: "quit", windowsHide: false },
	{ mode: "crash", windowsHide: false },
	{ mode: "graceful", windowsHide: false },
	...(win ? [{ mode: "graceful", windowsHide: true }, { mode: "quit", windowsHide: false }] : []),
];

for (const run of runs) {
	cleanup();
	const id = `${run.mode}-${run.windowsHide ? "hide" : "show"}-${Date.now()}`;
	const log = join(tmpdir(), `spike-${id}.log`);
	const ctlPath = join(tmpdir(), `spike-${id}.json`);
	writeFileSync(log, "");
	writeFileSync(ctlPath, JSON.stringify({ ...run, bin, extraArgs, cwd, machine, delayMs, log, script: join(import.meta.dir, "stop.lua"), stopFile: join(tmpdir(), `spike-stop-${id}`) }));
	const baseline = windows();
	// Detached on Windows = no inherited console, as when started from Explorer.
	const app = Bun.spawn([launcher], { env: { ...process.env, SPIKE_CTL: ctlPath }, stdout: "ignore", stderr: "pipe", detached: win });
	await Bun.sleep(6000);
	const known = new Set((baseline ?? []).map((w) => `${w.pid}:${w.class}`));
	const windowsWhileRunning = windows()?.filter((w) => !known.has(`${w.pid}:${w.class}`)) ?? null;
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
