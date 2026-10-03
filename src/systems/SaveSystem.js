// Save/load to localStorage. Covers 기획서 10번 ("저장 후 종료 / 일시정지") and
// carries the run count between playthroughs, which is what the ??? / 진 엔딩
// (기획서 8번) key off.
const SAVE_KEY = 'facility-survival:save';
const META_KEY = 'facility-survival:meta';
const SETTINGS_KEY = 'facility-survival:settings';

// Player-facing options. cameraMode is the big one -- the game is first-person
// by default but can be switched back to the third-person chase cam here.
export const DEFAULT_SETTINGS = {
  cameraMode: 'first', // 'first' | 'third'
  sensitivity: 'normal', // 'low' | 'normal' | 'high'
  invertY: false,
  soundOn: true,
};

const SENSITIVITY_VALUES = { low: 0.0016, normal: 0.0028, high: 0.0044 };

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

  // True once the player has seen the normal ending -- the 2회차 gate. Both the
  // hidden bosses and the 진 엔딩 route only open on a second run.
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

  // --- settings ---

  get settings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  setSetting(key, value) {
    const next = { ...this.settings, [key]: value };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    return next;
  },

  // radians of yaw/pitch per pixel of pointer motion
  get lookSpeed() {
    return SENSITIVITY_VALUES[this.settings.sensitivity] ?? SENSITIVITY_VALUES.normal;
  },
};
