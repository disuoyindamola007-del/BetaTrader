// Vitest setup: provide a deterministic in-memory localStorage.
// Node 26 exposes an experimental global `localStorage` that is not backed by
// a store unless launched with --localstorage-file, which shadows jsdom's
// implementation. We install our own simple, synchronous store so service
// tests exercise the real scoped-key logic without external state.
class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  key(index) { return Array.from(this.map.keys())[index] ?? null; }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true, writable: true });
}
