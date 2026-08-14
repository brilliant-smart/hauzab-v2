// Minimal device identity. A till/tablet is assigned an id by an admin (Phase 4
// gets a settings form); until then it is null and sales simply aren't attributed
// to a specific device. The id is stored locally so it survives a refresh.

const KEY = "hauzab:device_id";

export const device = {
  get(): number | null {
    const v = localStorage.getItem(KEY);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  },
  set(id: number) {
    localStorage.setItem(KEY, String(id));
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};