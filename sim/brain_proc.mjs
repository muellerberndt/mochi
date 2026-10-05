// The native brain: mochi.host as a child process, JSON lines both ways.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export class BrainProcess {
  constructor({ python = join(ROOT, ".venv/bin/python") } = {}) {
    this.child = spawn(python, ["-m", "mochi.host"], { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] });
    this.waiting = [];
    createInterface({ input: this.child.stdout }).on("line", line => {
      const next = this.waiting.shift();
      if (!next) return;
      let message;
      try { message = JSON.parse(line); } catch (error) { next.reject(error); return; }
      if (message.error) next.reject(new Error(message.error)); else next.resolve(message);
    });
    this.child.on("exit", code => {
      for (const next of this.waiting) next.reject(new Error(`the brain process ended (${code})`));
      this.waiting = [];
    });
  }
  call(message) {
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      this.child.stdin.write(JSON.stringify(message) + "\n");
    });
  }
  close() { this.child.stdin.end(); }
}

export const round = observation => Array.from(observation, value => Math.round(value * 1e4) / 1e4);

export function args(defaults) {
  const out = { ...defaults };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2), value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) { out[key] = true; continue; }
    i += 1;
    out[key] = typeof defaults[key] === "number" ? Number(value) : value;
  }
  return out;
}
