// Level layout, kept as pure data so adding/moving rooms doesn't mean touching
// the mesh-building code in Facility.js.
//
// Walkable space is the union of every rect below. Two spaces connect exactly
// where their rects OVERLAP -- so corridors deliberately poke ~1 unit into the
// rooms they join (see `walk` vs `span`), otherwise the collision margin would
// leave a hairline gap the player can't step across.

export const WALL_HEIGHT = 4;
export const DOOR_HALF = 1.5; // half-width of a standard doorway

// Palette per room kind (used for floor tint + the treeline/canopy tint --
// see Facility._wall / _floorAndCeiling). Room *shape* is still "시설": these
// are the same rects/gaps as before, just reskinned as forest -- warm wood for
// the cabin, undergrowth green for the open facility areas, mistier greens
// for the chapter-2 wing so the tone still shifts when the story does.
// `kind` strings (facility/lab/vault/...) are unchanged palette+identity keys,
// not a claim about indoor architecture.
// NOTE (2026-09-12 리스킨 1차): 처음엔 이 값들을 짙은 사냥꾼-그린으로 골랐다가 실제로
// 띄워보니(플레이라이트 스크린샷) 거의 안 보일 정도로 어두웠다 -- 원래 facility 팔레트는
// floor 0xffffff(순백)처럼 알베도가 아주 높았는데, 그걸 짙은 초록으로 바꾸면 조명 세기가
// 그대로여도 반사율 자체가 낮아져 체감 밝기가 확 떨어진다(map 텍스처 자체도 어두운 편이라
// 곱해지면 더 어두워짐). 그래서 색조는 숲이되 명도는 원래 팔레트에 가깝게 다시 올렸다.
//
// NOTE (2026-09-12 리스킨 3차 -- "사실은 숲이 아니었다"): `deep`/`arena`는 2장
// 전용 kind라서 여기서만 원래의 차가운 회청색으로 되돌렸다 -- 1장은 숲처럼 "보이는"
// 착시고, 2장(잠긴 문 너머)은 그 착시가 깨지는 진짜 시설이라는 반전이 생겨서다.
// 나머지 kind는 그대로 숲 톤. 벽/천장/바닥의 실제 텍스처 자체(콘크리트 vs 나무껍질)는
// Facility.js가 room.chapter===2 여부로 골라 쓴다 -- 팔레트 색만으론 질감까지는
// 못 바꾼다.
export const PALETTE = {
  cabin: { floor: 0x6b4a2b, wall: 0x8a6237 },
  facility: { floor: 0x6f8a4a, wall: 0x5f7a42 },
  corridor: { floor: 0x8a7248, wall: 0x4f6a3c },
  storage: { floor: 0x7a6a3a, wall: 0x5a6e40 },
  lab: { floor: 0x8a9880, wall: 0x6a7a64 },
  vault: { floor: 0x5a4a30, wall: 0x4a3c28 },
  deep: { floor: 0x9fb0bb, wall: 0x64798a },
  arena: { floor: 0xb0bcc4, wall: 0x55697a },
  sanctum: { floor: 0x14141a, wall: 0x0c0c10 },
};

// ---------------------------------------------------------------------------
// NOTE (2026-09-12 리스킨 2차 -- "더 크게, 시설처럼 안 보이게"): 모든 방/복도를
// 키우고 복도를 훨씬 길게 늘렸다. 손으로 배치된 PROPS/HIDDEN_BOSSES/LIGHTS 좌표는
// 전부 "옛 방 중심 기준 오프셋 * (새 반너비/옛 반너비)" 공식으로 다시 계산한 것 --
// 그냥 절대좌표를 눈대중으로 옮기면 소품이 벽에 박히거나 숨겨진 보스가 막다른 곳에
// 갇히기 쉬워서, 방 중심을 기준으로 한 스케일 변환으로 상대적 배치를 그대로
// 보존했다. 같은 이유로 Facility.js의 하드코딩된 좌표(아레나 사슬, 문 위치)와
// main.js의 보스/과학자 스폰 좌표, Items.js의 WORLD_ITEMS도 전부 같은 공식으로
// 같이 옮겼다 -- 이 파일만 고치면 하드코딩된 나머지가 다 어긋난다는 뜻이니,
// 방 크기를 또 바꿀 일이 있으면 그 세 파일도 반드시 같이 확인할 것.
// ---------------------------------------------------------------------------

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
    minX: -22, maxX: 22, minZ: 26, maxZ: 60,
    gaps: [
      { side: 'north', from: -DOOR_HALF, to: DOOR_HALF },   // <- corr1 (오두막)
      { side: 'west', from: 38, to: 44 },                    // <- doorW (창고)
      { side: 'east', from: 38, to: 44 },                    // <- doorE (실험실)
      { side: 'south', from: -DOOR_HALF, to: DOOR_HALF },    // -> corr2 (출구)
    ],
  },
  {
    id: 'storage',
    chapter: 1,
    kind: 'storage',
    minX: -48, maxX: -31, minZ: 24, maxZ: 56,
    gaps: [
      { side: 'east', from: 38, to: 44 },
      { side: 'south', from: -42, to: -38 }, // -> 숨겨진 금고
    ],
  },
  {
    id: 'lab',
    chapter: 1,
    kind: 'lab',
    minX: 31, maxX: 48, minZ: 24, maxZ: 56,
    gaps: [{ side: 'west', from: 38, to: 44 }],
  },
  {
    id: 'vault',
    chapter: 1,
    kind: 'vault',
    minX: -47, maxX: -33, minZ: 65, maxZ: 80,
    gaps: [{ side: 'north', from: -42, to: -38 }],
  },
  {
    id: 'gate',
    chapter: 1,
    kind: 'facility',
    minX: -14, maxX: 14, minZ: 78, maxZ: 92,
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
    minX: -26, maxX: 26, minZ: 112, maxZ: 152,
    gaps: [{ side: 'north', from: -DOOR_HALF, to: DOOR_HALF }],
  },
  // ---------------- 마지막장: "???" ----------------
  // 진 엔딩(기획서 7번 마지막장) 전용 공간. 본편 동선과 이어붙이지 않고 멀리
  // 떨어뜨려 뒀다 -- 조건을 채운 플레이어만 아레나 출구에서 이곳으로 옮겨진다.
  // 아레나가 커지면서 원래 좌표(z140-170)와 겹치게 돼서 더 멀리(z220-250) 밀었다.
  {
    id: 'sanctum',
    chapter: 3,
    kind: 'sanctum',
    minX: -15, maxX: 15, minZ: 220, maxZ: 250,
    gaps: [],
  },
];

// axis: which way the corridor runs. `span` is the visual extent (floor, ceiling,
// side walls) -- exactly the gap between the two rooms. The walkable rect is the
// span grown by OVERLAP at both ends so it merges with the rooms it connects.
export const OVERLAP = 1;

// 복도 길이를 전부 2~3배로 늘렸다 -- 방을 키우는 것보다 이쪽이 "숲을 오래 걷는다"는
// 체감에 훨씬 크게 기여하고, 방 내부 소품 배치를 건드리지 않아도 돼서 안전하다.
export const CORRIDORS = [
  { id: 'corr1', chapter: 1, kind: 'corridor', axis: 'z', minX: -DOOR_HALF, maxX: DOOR_HALF, from: 4, to: 26 },
  { id: 'doorW', chapter: 1, kind: 'storage', axis: 'x', minZ: 38, maxZ: 44, from: -31, to: -22 },
  { id: 'doorE', chapter: 1, kind: 'lab', axis: 'x', minZ: 38, maxZ: 44, from: 22, to: 31 },
  { id: 'vaultDoor', chapter: 1, kind: 'vault', axis: 'z', minX: -42, maxX: -38, from: 56, to: 65 },
  { id: 'corr2', chapter: 1, kind: 'corridor', axis: 'z', minX: -DOOR_HALF, maxX: DOOR_HALF, from: 60, to: 78 },
  { id: 'corr3', chapter: 2, kind: 'deep', axis: 'z', minX: -DOOR_HALF, maxX: DOOR_HALF, from: 92, to: 112 },
];

// Static blockers. Each is a box mesh + a collision rect, so the player has to
// path around them instead of walking through -- this is roadmap item 3's
// "지도 개선": the map is no longer an empty box you can sprint across.
// [x, z, width, depth, height, kind]
export const PROPS = [
  // 중앙 홀 -- 시야를 끊는 기둥과 화물 상자 (옛 좌표를 홀 중심 기준 1.375x/1.417z로 스케일)
  { x: -11, z: 34.5, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  { x: 10, z: 33, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  { x: -7, z: 46, w: 1.4, d: 1.4, h: 2.4, kind: 'pillar' },
  { x: 14, z: 49, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  { x: 0, z: 40, w: 1.4, d: 1.4, h: 2.4, kind: 'pillar' },
  { x: -16.5, z: 53, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  { x: 16.5, z: 56, w: 1.4, d: 1.4, h: 2.4, kind: 'pillar' },
  { x: -15, z: 30, w: 1.6, d: 1.6, h: 1.6, kind: 'crate' },
  // 창고 -- 선반 줄
  { x: -42.8, z: 30, w: 6, d: 1, h: 2.2, kind: 'shelf' },
  { x: -42.8, z: 40, w: 6, d: 1, h: 2.2, kind: 'shelf' },
  { x: -42.8, z: 50, w: 6, d: 1, h: 2.2, kind: 'shelf' },
  // 실험실 -- 작업대
  { x: 37.5, z: 30, w: 5, d: 1.2, h: 1.1, kind: 'table' },
  { x: 37.5, z: 50, w: 5, d: 1.2, h: 1.1, kind: 'table' },
  { x: 44.7, z: 40, w: 1.2, d: 5, h: 1.1, kind: 'table' },
  // 보스 아레나 -- 엄폐물 (사령관의 내려찍기를 피할 곳)
  { x: -15.6, z: 123.4, w: 2, d: 2, h: 1.6, kind: 'pillar' },
  { x: 15.6, z: 123.4, w: 2, d: 2, h: 1.6, kind: 'pillar' },
  { x: -15.6, z: 143.4, w: 2, d: 2, h: 1.6, kind: 'pillar' },
  { x: 15.6, z: 143.4, w: 2, d: 2, h: 1.6, kind: 'pillar' },
  // "???" -- 나를 마주하는 곳. 최소한의 엄폐물만.
  { x: -9, z: 232, w: 1.6, d: 1.6, h: 2.6, kind: 'pillar' },
  { x: 9, z: 232, w: 1.6, d: 1.6, h: 2.6, kind: 'pillar' },
  { x: -9, z: 242, w: 1.6, d: 1.6, h: 2.6, kind: 'pillar' },
  { x: 9, z: 242, w: 1.6, d: 1.6, h: 2.6, kind: 'pillar' },
];

// 2회차에만 깨어나는 숨겨진 보스 (기획서 8번). 본편 동선에서 살짝 벗어난
// 곳에 하나씩 둬서, 노멀 엔딩만 볼 사람은 지나쳐도 되게 했다.
export const HIDDEN_BOSSES = [
  { type: '1974', x: -36, z: 46, area: 'storage' },
  { type: '2045', x: 40, z: 40, area: 'lab' },
  { type: '0268', x: -40, z: 72.5, area: 'vault' },
];

// 캐노피 사이 빛무리(반딧불이/발광 포자 뭉치) 위치 [x, z, 밝기]. 사람이 단 랜턴이
// 아니라 자연 발광이라 "시설"처럼 안 읽힌다 -- Facility._buildLights 참고.
// 복도가 훨씬 길어져서 원래 없던 중간 지점 몇 개를 새로 추가했다(주석 표시).
export const LIGHTS = [
  [0, -2.5, 1.0],
  [0, 11, 0.9], [0, 20, 0.9], // corr1 (길어져서 추가)
  [-11, 31.7, 1.1], [11, 37.3, 1.1], [-8.25, 51.5, 1.0], [12.4, 54.3, 1.0], [0, 43, 1.2],
  [-17, 36, 0.8], [17, 50, 0.8], // hall 넓어져서 추가
  [-40.15, 32, 0.9], [-40.15, 41, 0.9], [-40.15, 50, 0.9],
  [40.15, 32, 1.3], [40, 41, 1.3], [40.15, 50, 1.3],
  [-40, 73.3, 0.5],
  [0, 66, 0.9], [0, 74, 0.9], // corr2
  [0, 85, 1.1], // gate
  [0, 98, 0.7], [0, 106, 0.7], // corr3
  [-13, 120.6, 1.0], [13, 120.6, 1.0], [0, 112.5, 0.8], [0, 134.9, 1.2], [-13, 146.3, 1.0], [13, 146.3, 1.0], [0, 150, 0.8],
  // "???" -- 거의 빛이 없다
  [0, 228, 0.35], [0, 238, 0.3], [0, 246, 0.25],
];
