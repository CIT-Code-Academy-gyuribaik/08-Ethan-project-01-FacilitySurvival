// Central registry so loot drops, the HUD, the eat action, and the door-unlock
// check all agree on names and effects in one place.
//
// kind:
//   'food'    -> Enter 로 먹어서 허기 회복
//   'key'     -> 특정 상호작용(잠긴 문)에서 소비됨
//   'boost'   -> 줍는 즉시 주인공을 영구 강화 (기획서: "강해져야 한다")
//   'quest'   -> 시크릿/진 엔딩용 재료. 소비되지 않음
//   'medkit'  -> 인벤토리에 쌓아두고, 원할 때 E로 직접 써서 HP 회복 (허기와 무관)
//   'equip'   -> boost처럼 줍는 즉시 영구 적용되지만, 수치가 아니라 "장비"로
//                취급된다 -- HUD에 계속 표시되고(장착 중: ...), slot: 'tool'인
//                손전등은 L로 켜고 끌 수 있다. 슬롯 UI 없이 장비 느낌만 내는
//                절충 (CLAUDE.md 설계 메모의 "장비 관리 화면 없음" 유지).
export const ITEMS = {
  'deer-meat': { name: '살점', kind: 'food', restoreHunger: 35, color: 0xb3705a },
  'wolf-meat': { name: '수상한 고기', kind: 'food', restoreHunger: 25, color: 0x7a4a44 },
  'canned-food': { name: '통조림', kind: 'food', restoreHunger: 50, color: 0xa8a294 },
  keycard: { name: '출입 카드', kind: 'key', color: 0x44d0ff },
  stimulant: { name: '강화 주사기', kind: 'boost', attack: 6, maxHp: 15, color: 0x66ffbb },
  medkit: { name: '응급 키트', kind: 'medkit', healHp: 40, color: 0xff6666 },
  'armor-vest': { name: '방탄조끼', kind: 'equip', slot: 'armor', damageMul: 0.8, color: 0x556655 },
  flashlight: { name: '손전등', kind: 'equip', slot: 'tool', color: 0xffe9a8 },
  'strange-material': { name: '이상한 재료', kind: 'quest', color: 0xcc66ff },
  'research-log': { name: '연구 일지', kind: 'quest', color: 0xffcf66 },
  // 진 엔딩(기획서 8번)용. 시설의 진실이 적힌 문서 3장을 모두 모으면 2회차에
  // 한해 "???" 구역으로 가는 길이 열린다.
  'facility-file': { name: '기밀 문서', kind: 'quest', color: 0xff6688 },
};

export const INTEL_TOTAL = 3;

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}

// Items scattered around the map for the player to find. Placed by hand so each
// branch of the map is worth exploring: 창고 = 식량, 실험실 = 진행 + 강화,
// 숨겨진 금고 = 시크릿 엔딩 재료.
// NOTE (2026-09-12 지도 확장): 좌표는 전부 "옛 방 중심 기준 오프셋 * 방 확대
// 비율"로 다시 계산한 것 -- LevelData.js 헤더 주석 참고. 방 크기를 또 바꾸면
// 여기도 같이 다시 계산해야 한다.
export const WORLD_ITEMS = [
  { id: 'canned-food', x: -42.8, z: 35 },
  { id: 'canned-food', x: -42.8, z: 45 },
  { id: 'canned-food', x: -33.6, z: 52 },
  { id: 'stimulant', x: -33.6, z: 28 },
  // 출입 카드는 더는 바닥에 놓여 있지 않다 -- 실험실의 미니보스 "문지기"
  // (Gatekeeper, main.js spawnGatekeeper)를 쓰러뜨려야 떨군다.
  { id: 'stimulant', x: 37.5, z: 53.2 },
  { id: 'canned-food', x: 33.6, z: 52 },
  { id: 'research-log', x: -44.2, z: 76.7 },
  { id: 'canned-food', x: -35.8, z: 76.7 },
  // 기밀 문서 3장: 실험실 / 금고 / 2장 아레나 초입. 하나는 문 너머에 있어
  // 진 엔딩을 노리면 반드시 2장까지 들어가야 한다.
  { id: 'facility-file', x: 33, z: 44 },
  { id: 'facility-file', x: -35.8, z: 68.3 },
  { id: 'facility-file', x: -20.8, z: 117.7 },
  // 사용/장비 아이템: 손전등은 초반 홀에서 바로 주워 게임 내내 쓸 수 있게,
  // 방탄조끼는 실험실(위험 구역), 응급 키트는 1장·2장에 하나씩.
  { id: 'flashlight', x: -4.1, z: 28.8 },
  { id: 'armor-vest', x: 41.5, z: 26 },
  { id: 'medkit', x: 4.1, z: 41.6 },
  { id: 'medkit', x: 0, z: 133.4 },
];
