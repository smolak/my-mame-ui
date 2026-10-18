// Launch process spike: how does a Bun.spawn'ed MAME behave when the Launcher quits?
// Driven by a JSON control file (SPIKE_CTL env or ./spike-ctl.json):
//   { mode: "quit" | "crash" | "graceful", bin, extraArgs, windowsHide, cwd, machine, script, stopFile, log, delayMs }
//   quit     — Utils.quit() with no before-quit handling
//   crash    — SIGKILL ourselves (simulates a Launcher crash)
//   graceful — before-quit vetoes, asks MAME to stop via the stop file, waits, then quits
import Electrobun, { BrowserWindow, Utils } from "electrobun/main";
import { appendFileSync, readFileSync } from "node:fs";

const ctl = JSON.parse(readFileSync(process.env.SPIKE_CTL ?? "./spike-ctl.json", "utf8"));
const log = (msg: string) => appendFileSync(ctl.log, `${new Date().toISOString()} ${msg}\n`);

new BrowserWindow({
	title: "launch spike",
	url: "views://mainview/index.html",
	frame: { width: 400, height: 300, x: 200, y: 200 },
});

const args = [ctl.bin ?? "mame", "-window", "-skip_gameinfo", ...(ctl.extraArgs ?? [])];
if (ctl.script) args.push("-autoboot_script", ctl.script);
args.push(ctl.machine);

const mame = Bun.spawn(args, {
	cwd: ctl.cwd,
	stdout: "ignore",
	stderr: "ignore",
	env: { ...process.env, MYMAME_STOP_FILE: ctl.stopFile },
	windowsHide: ctl.windowsHide ?? false,
});
log(`mode=${ctl.mode} windowsHide=${ctl.windowsHide ?? false} launcher=${process.pid} mame=${mame.pid}`);
let mameExited = false;
mame.exited.then((code) => {
	mameExited = true;
	log(`mame exited code=${code} signal=${mame.signalCode}`);
});

if (ctl.mode === "graceful") {
	Electrobun.events.on("before-quit", (e: any) => {
		if (mameExited) return log("before-quit: mame gone, allow");
		log("before-quit: mame running, veto + stop file");
		e.response = { allow: false };
		Bun.write(ctl.stopFile, "");
		const t = setTimeout(() => {
			log("stop timeout, SIGKILL");
			mame.kill("SIGKILL");
		}, 5000);
		mame.exited.then(() => {
			clearTimeout(t);
			log("re-quitting");
			Utils.quit();
		});
	});
}

setTimeout(() => {
	log(`trigger ${ctl.mode}`);
	if (ctl.mode === "crash") process.kill(process.pid, "SIGKILL"); // TerminateProcess on Windows
	else Utils.quit();
}, ctl.delayMs ?? 8000);
