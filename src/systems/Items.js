// Central registry so loot drops, the HUD, the eat action, and the door-unlock
// check all agree on names and effects in one place.
//
// kind:
//   'food'  -> Enter 로 먹어서 허기 회복
//   'key'   -> 특정 상호작용(잠긴 문)에서 소비됨
//   'boost' -> 즉시 사용해 주인공을 영구 강화 (기획서: "강해져야 한다")
//   'quest' -> 시크릿 엔딩용 재료. 소비되지 않음
export const ITEMS = {
  'deer-meat': { name: '살점', kind: 'food', restoreHunger: 35, color: 0xb3705a },
  'wolf-meat': { name: '수상한 고기', kind: 'food', restoreHunger: 25, color: 0x7a4a44 },
  'canned-food': { name: '통조림', kind: 'food', restoreHunger: 50, color: 0xa8a294 },
  keycard: { name: '출입 카드', kind: 'key', color: 0x44d0ff },
  stimulant: { name: '강화 주사기', kind: 'boost', attack: 6, maxHp: 15, color: 0x66ffbb },
  'strange-material': { name: '이상한 재료', kind: 'quest', color: 0xcc66ff },
  'research-log': { name: '연구 일지', kind: 'quest', color: 0xffcf66 },
};

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}

// Items scattered around the map for the player to find. Placed by hand so each
// branch of the map is worth exploring: 창고 = 식량, 실험실 = 진행 + 강화,
// 숨겨진 금고 = 시크릿 엔딩 재료.
export const WORLD_ITEMS = [
  { id: 'canned-food', x: -28, z: 21.5 },
  { id: 'canned-food', x: -28, z: 26.5 },
  { id: 'canned-food', x: -21, z: 30 },
  { id: 'stimulant', x: -21, z: 18 },
  { id: 'keycard', x: 29.5, z: 21 },
  { id: 'stimulant', x: 24, z: 30.6 },
  { id: 'canned-food', x: 21, z: 30 },
  { id: 'research-log', x: -28, z: 42 },
  { id: 'canned-food', x: -22, z: 42 },
];
