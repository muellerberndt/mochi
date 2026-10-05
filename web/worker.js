// Mochi's brain, in a worker. A brain pack names everything this worker loads: the Pyodide
// release, the Cadence wheel the brain was raised on, and the brain host sources of that day.
// One serial owner; the page never blocks on it.
// Messages: {id, message} in, {id, result} or {id, error} out. Brain files travel as ArrayBuffers.

let pyodide = null;
let handle = null;

const status = stage => self.postMessage({ status: stage });

async function start(packUrl) {
  status("reading the brain pack");
  const manifest = await (await fetch(new URL("manifest.json", packUrl))).json();
  if (manifest.schema !== "mochi-brain-pack/1") throw new Error("not a mochi-brain-pack/1");
  const cdn = `https://cdn.jsdelivr.net/pyodide/v${manifest.pyodide}/full/`;
  status("loading Python");
  const { loadPyodide } = await import(cdn + "pyodide.mjs");
  pyodide = await loadPyodide({ indexURL: cdn });
  status("loading numpy");
  await pyodide.loadPackage("numpy");
  status(`loading Cadence ${manifest.cadence}`);
  const wheel = await (await fetch(new URL(manifest.wheel, packUrl))).arrayBuffer();
  pyodide.unpackArchive(new Uint8Array(wheel), "wheel");
  status("loading the brain's own code");
  pyodide.FS.mkdirTree("/home/pyodide/mochi");
  for (const name of manifest.sources) {
    const response = await fetch(new URL("py/" + name, packUrl));
    if (!response.ok) throw new Error(`the pack lacks py/${name}`);
    pyodide.FS.writeFile("/home/pyodide/mochi/" + name, await response.text());
  }
  pyodide.runPython(`
import sys, warnings
warnings.simplefilter("ignore")
if "/home/pyodide" not in sys.path:
    sys.path.insert(0, "/home/pyodide")
from mochi.host import Host
_host = Host()
`);
  handle = pyodide.globals.get("_host").handle_json;
  return manifest;
}

function call(message) {
  const result = JSON.parse(handle(JSON.stringify(message)));
  if (result.error) throw new Error(result.error);
  return result;
}

self.onmessage = async event => {
  let { id, message } = event.data;
  try {
    if (message.op === "start") {
      const manifest = await start(message.pack);
      self.postMessage({ id, result: { manifest } });
      return;
    }
    if (message.bytes) {                       // boot or load from a saved brain
      pyodide.FS.writeFile("/tmp/brain-in.life", new Uint8Array(message.bytes));
      message = { ...message, bytes: undefined, path: "/tmp/brain-in.life" };
    }
    if (message.op === "save") {
      const result = call({ op: "save", path: "/tmp/brain-out.life" });
      const bytes = pyodide.FS.readFile("/tmp/brain-out.life");
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      self.postMessage({ id, result: { bytes: buffer, size: result.bytes } }, [buffer]);
      return;
    }
    self.postMessage({ id, result: call(message) });
  } catch (error) {
    self.postMessage({ id, error: String(error && error.message ? error.message : error) });
  }
};
