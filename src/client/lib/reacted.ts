// Tracks what this browser has already reacted to / reported, so the UI can
// reflect it across reloads. The server is still the source of truth and
// de-dupes independently; this is purely for local UX.

const KEY = "unspoken:flags";

export interface Flags {
  relate?: boolean;
  hug?: boolean;
  report?: boolean;
}

type Store = Record<string, Flags>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode / quota, ignore */
  }
}

export function getFlags(id: string): Flags {
  return read()[id] ?? {};
}

export function setFlag(id: string, key: keyof Flags): void {
  const store = read();
  store[id] = { ...store[id], [key]: true };
  write(store);
}
