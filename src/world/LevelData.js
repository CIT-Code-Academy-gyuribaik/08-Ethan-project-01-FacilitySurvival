// Level layout, kept as pure data so adding/moving rooms doesn't mean touching
// the mesh-building code in Facility.js.
//
// Walkable space is the union of every rect below. Two spaces connect exactly
// where their rects OVERLAP -- so corridors deliberately poke ~1 unit into the
// rooms they join (see `walk` vs `span`), otherwise the collision margin would
// leave a hairline gap the player can't step across.

export const WALL_HEIGHT = 4;
export const DOOR_HALF = 1.5; // half-width of a standard doorway

// Palette per room kind. Backrooms yellow for the facility, warm wood for the
// cabin, cold blue-grey for the chapter-2 wing so the tone shifts when the
// story does.
export const PALETTE = {
  cabin: { floor: 0x6b4a2b, wall: 0x8a6237 },
  facility: { floor: 0xffffff, wall: 0xc9b459 },
  corridor: { floor: 0xe8dca8, wall: 0xb8a45c },
  storage: { floor: 0xd8c98a, wall: 0xa89a52 },
  lab: { floor: 0xd6e0e4, wall: 0x93a8b0 },
  vault: { floor: 0x8a7a5a, wall: 0x6a5c40 },
  deep: { floor: 0x9fb0bb, wall: 0x64798a },
  arena: { floor: 0xb0bcc4, wall: 0x55697a },
};

// side: which wall the gap is cut into. from/to are world coords along that wall
// (x for north/south, z for east/west).
export const ROOMS = [
  // ---------------- 1장: 시설 ----------------
  {
    id: 'cabin',
    chapter: 1,
    kind: 'cabin',
    minX: -5, maxX: 5, minZ: -6, maxZ: 4,
    gaps: [{ side: 'south', from: -DOOR_HALF, to: DOOR_HALF }],
  },
  {
    id: 'hall',
    chapter: 1,
    kind: 'facility',
    minX: -16, maxX: 16, minZ: 14, maxZ: 38,
    gaps: [
      { side: 'north', from: -DOOR_HALF, to: DOOR_HALF },   // <- corr1 (오두막)
      { side: 'west', from: 22, to: 26 },                    // <- doorW (창고)
      { side: 'east', from: 22, to: 26 },                    // <- doorE (실험실)
      { side: 'south', from: -DOOR_HALF, to: DOOR_HALF },    // -> corr2 (출구)
    ],
  },
  {
    id: 'storage',
    chapter: 1,
    kind: 'storage',
    minX: -32, maxX: -19, minZ: 16, maxZ: 32,
    gaps: [
      { side: 'east', from: 22, to: 26 },
      { side: 'south', from: -27, to: -23 }, // -> 숨겨진 금고
    ],
  },
  {
    id: 'lab',
    chapter: 1,
    kind: 'lab',
    minX: 19, maxX: 32, minZ: 16, maxZ: 32,
    gaps: [{ side: 'west', from: 22, to: 26 }],
  },
  {
    id: 'vault',
    chapter: 1,
    kind: 'vault',
    minX: -30, maxX: -20, minZ: 35, maxZ: 44,
    gaps: [{ side: 'north', from: -27, to: -23 }],
  },
  {
    id: 'gate',
    chapter: 1,
    kind: 'facility',
    minX: -10, maxX: 10, minZ: 46, maxZ: 56,
    gaps: [
      { side: 'north', from: -DOOR_HALF, to: DOOR_HALF },
      { side: 'south', from: -DOOR_HALF, to: DOOR_HALF }, // 잠긴 문 (키카드 필요)
    ],
  },
  // ---------------- 2장: 시설 심부 ----------------
  {
    id: 'arena',
    chapter: 2,
    kind: 'arena',
    minX: -20, maxX: 20, minZ: 64, maxZ: 92,
    gaps: [{ side: 'north', from: -DOOR_HALF, to: DOOR_HALF }],
  },
];

// axis: which way the corridor runs. `span` is the visual extent (floor, ceiling,
// side walls) -- exactly the gap between the two rooms. The walkable rect is the
// span grown by OVERLAP at both ends so it merges with the rooms it connects.
export const OVERLAP = 1;

export const CORRIDORS = [
  { id: 'corr1', chapter: 1, kind: 'corridor', axis: 'z', minX: -DOOR_HALF, maxX: DOOR_HALF, from: 4, to: 14 },
  { id: 'doorW', chapter: 1, kind: 'storage', axis: 'x', minZ: 22, maxZ: 26, from: -19, to: -16 },
  { id: 'doorE', chapter: 1, kind: 'lab', axis: 'x', minZ: 22, maxZ: 26, from: 16, to: 19 },
  { id: 'vaultDoor', chapter: 1, kind: 'vault', axis: 'z', minX: -27, maxX: -23, from: 32, to: 35 },
  { id: 'corr2', chapter: 1, kind: 'corridor', axis: 'z', minX: -DOOR_HALF, maxX: DOOR_HALF, from: 38, to: 46 },
  { id: 'corr3', chapter: 2, kind: 'deep', axis: 'z', minX: -DOOR_HALF, maxX: DOOR_HALF, from: 56, to: 64 },
];

// Static blockers. Each is a box mesh + a collision rect, so the player has to
// path around them instead of walking through -- this is roadmap item 3's
// "지도 개선": the map is no longer an empty box you can sprint across.
// [x, z, width, depth, height, kind]
export const PROPS = [
  // 중앙 홀 -- 시야를 끊는 기둥과 화물 상자
  { x: -8, z: 20, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  { x: 7, z: 19, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  { x: -5, z: 28, w: 1.4, d: 1.4, h: 2.4, kind: 'pillar' },
  { x: 10, z: 30, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  { x: 0, z: 24, w: 1.4, d: 1.4, h: 2.4, kind: 'pillar' },
  { x: -12, z: 33, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  { x: 12, z: 35, w: 1.4, d: 1.4, h: 2.4, kind: 'pillar' },
  { x: -11, z: 17, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  // 창고 -- 선반 줄
  { x: -28, z: 19, w: 6, d: 1, h: 2.2, kind: 'shelf' },
  { x: -28, z: 24, w: 6, d: 1, h: 2.2, kind: 'shelf' },
  { x: -28, z: 29, w: 6, d: 1, h: 2.2, kind: 'shelf' },
  // 실험실 -- 작업대
  { x: 24, z: 19, w: 5, d: 1.2, h: 1.1, kind: 'table' },
  { x: 24, z: 29, w: 5, d: 1.2, h: 1.1, kind: 'table' },
  { x: 29.5, z: 24, w: 1.2, d: 5, h: 1.1, kind: 'table' },
  // 보스 아레나 -- 엄폐물 (사령관의 내려찍기를 피할 곳)
  { x: -12, z: 72, w: 2, d: 2, h: 1.6, kind: 'pillar' },
  { x: 12, z: 72, w: 2, d: 2, h: 1.6, kind: 'pillar' },
  { x: -12, z: 86, w: 2, d: 2, h: 1.6, kind: 'pillar' },
  { x: 12, z: 86, w: 2, d: 2, h: 1.6, kind: 'pillar' },
];

// 천장 형광등 위치 [x, z, 밝기]
export const LIGHTS = [
  [0, -2.5, 1.0], [0, 9, 0.9],
  [-8, 18, 1.1], [8, 22, 1.1], [-6, 32, 1.0], [9, 34, 1.0], [0, 26, 1.2],
  [-26, 20, 0.9], [-26, 29, 0.9],
  [26, 20, 1.3], [26, 29, 1.3],
  [-25, 40, 0.5],
  [0, 42, 0.9], [0, 51, 1.1],
  [0, 60, 0.7],
  [-10, 70, 1.0], [10, 70, 1.0], [0, 80, 1.2], [-10, 88, 1.0], [10, 88, 1.0],
];
