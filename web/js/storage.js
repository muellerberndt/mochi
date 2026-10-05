// One life per browser, kept in IndexedDB: the room, the page's own notes and the brain file.

const DB = "mochi-lives", STORE = "lives";

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode), request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// The life before the newest one is kept as a backup in the same transaction.
export function saveLife(life) {
  return run("readwrite", store => {
    const previous = store.get("home");
    previous.onsuccess = () => { if (previous.result) store.put(previous.result, "backup"); store.put(life, "home"); };
    return previous;
  });
}
export const loadLife = () => run("readonly", store => store.get("home"));
export const loadBackup = () => run("readonly", store => store.get("backup"));
export const forgetLife = () => run("readwrite", store => { store.delete("backup"); return store.delete("home"); });

// A life as one downloadable file: a JSON header line, then the brain's bytes.
export function lifeToBlob(life) {
  const { brain, ...rest } = life;
  const header = new TextEncoder().encode(JSON.stringify(rest) + "\n");
  return new Blob([header, brain], { type: "application/octet-stream" });
}

export async function blobToLife(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const cut = bytes.indexOf(10);
  if (cut < 0) throw new Error("not a Mochi life file");
  const life = JSON.parse(new TextDecoder().decode(bytes.subarray(0, cut)));
  life.brain = bytes.slice(cut + 1).buffer;
  return life;
}
