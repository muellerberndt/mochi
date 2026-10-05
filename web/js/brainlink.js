// The page's line to the brain worker: one promise per message, answered in order.
// A worker runs exactly one brain pack; switching packs means a new worker.

// Brain packs live in brains/ beside the page by default. A page can point elsewhere with
// <meta name="mochi-brains" content="https://example.org/brains/"> (the host must allow
// cross-origin reads), and an index entry may carry its own `url` for a pack kept apart.
const meta = typeof document !== "undefined" ? document.querySelector('meta[name="mochi-brains"]') : null;
export const BRAINS = meta && meta.content
  ? new URL(meta.content, document.baseURI)
  : new URL("../brains/", import.meta.url);

export async function brainIndex() {
  const response = await fetch(new URL("index.json", BRAINS));
  if (!response.ok) throw new Error("no brain packs are installed (brains/index.json)");
  return response.json();
}

export class BrainLink {
  constructor(onStatus = () => {}) {
    this.worker = new Worker(new URL("../worker.js", import.meta.url), { type: "module" });
    this.waiting = new Map();
    this.nextId = 1;
    this.manifest = null;
    this.packUrl = null;
    this.worker.onmessage = event => {
      const data = event.data;
      if (data.status) { onStatus(data.status); return; }
      const entry = this.waiting.get(data.id);
      if (!entry) return;
      this.waiting.delete(data.id);
      if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.result);
    };
    this.worker.onerror = event => {
      for (const entry of this.waiting.values()) entry.reject(new Error(event.message || "the brain worker failed"));
      this.waiting.clear();
    };
  }
  call(message, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ id, message }, transfer);
    });
  }
  async start(packId, url = null) {
    this.packUrl = new URL(url || packId + "/", BRAINS);
    const { manifest } = await this.call({ op: "start", pack: this.packUrl.href });
    this.manifest = manifest;
    return manifest;
  }
  asset(name) { return new URL(name, this.packUrl); }
  stop() { this.worker.terminate(); }
}
