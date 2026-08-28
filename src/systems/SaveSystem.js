// Save/load to localStorage. Covers 기획서 10번 ("저장 후 종료 / 일시정지") and
// carries the run count between playthroughs, which is what the ??? ending
// (기획서 8번) keys off.
const SAVE_KEY = 'facility-survival:save';
const META_KEY = 'facility-survival:meta';

export const SaveSystem = {
  hasSave() {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  },

  save(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), ...state }));
      return true;
    } catch {
      return false; // private browsing / quota -- the game keeps working, just unsaved
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data?.version === 1 ? data : null;
    } catch {
      return null;
    }
  },

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },

  // --- meta: survives death and clearing, unlike the save slot ---

  meta() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) ?? '{}');
    } catch {
      return {};
    }
  },

  get clearCount() {
    return this.meta().clearCount ?? 0;
  },

  // True once the player has seen the normal ending -- the 2회차 gate.
  get isNewGamePlus() {
    return this.clearCount > 0;
  },

  recordClear(endingId) {
    const meta = this.meta();
    meta.clearCount = (meta.clearCount ?? 0) + 1;
    meta.endings = Array.from(new Set([...(meta.endings ?? []), endingId]));
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch {
      /* ignore */
    }
  },
};
