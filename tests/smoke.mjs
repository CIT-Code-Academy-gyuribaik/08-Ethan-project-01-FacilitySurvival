// Headless smoke test: `npm test`.
//
// There's no browser here, so this stubs just enough <canvas> for the procedural
// textures and then drives the REAL Facility / Player / creature / combat code
// for a few thousand frames. It catches the class of bug that is otherwise only
// findable by playing: unreachable rooms, a door that doesn't block, an enemy
// that never lands a hit, a boss that can't be killed.
const ctx2d = () => ({
  fillStyle: '', strokeStyle: '', lineWidth: 1,
  fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
  stroke() {}, arc() {}, fill() {},
  createRadialGradient: () => ({ addColorStop() {} }),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {},
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: ctx2d }) };

const B = new URL('../src', import.meta.url).href;
const THREE = await import('three');
const { Facility } = await import(`${B}/world/Facility.js`);
const { Player } = await import(`${B}/entities/Player.js`);
const { Wolf } = await import(`${B}/entities/Wolf.js`);
const { Deer } = await import(`${B}/entities/Deer.js`);
const { Scientist } = await import(`${B}/entities/Scientist.js`);
const { Commander } = await import(`${B}/entities/Commander.js`);
const { Pickup } = await import(`${B}/entities/Pickup.js`);
const { CombatSystem } = await import(`${B}/systems/CombatSystem.js`);
const { InteractionSystem } = await import(`${B}/systems/Interaction.js`);
const { WORLD_ITEMS } = await import(`${B}/systems/Items.js`);
const { Mutant, MUTANT_TYPES } = await import(`${B}/entities/Mutant.js`);
const { DialogueSystem, SCRIPT } = await import(`${B}/systems/Dialogue.js`);
const { HIDDEN_BOSSES } = await import(`${B}/world/LevelData.js`);

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '  OK  ' : '  FAIL'} ${name}${extra ? '  — ' + extra : ''}`);
};
const section = (t) => console.log(`\n--- ${t} ---`);

const DT = 1 / 60;
const scene = new THREE.Scene();
const facility = new Facility(scene);
const player = new Player(facility, facility.spawnPoint);
facility.viewer = player.position;
const camera = new THREE.PerspectiveCamera(65, 1.6, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(0, 3.4, -6); // must match main.js

const input = {
  moveVector: { x: 0, z: 0 },
  attackPressed: false, confirmPressed: false, cancelPressed: false,
  eatPressed: false, pausePressed: false,
  wasJustPressed: () => false,
  endFrame() { this.attackPressed = false; this.confirmPressed = false; },
};

// Mirrors main.js's updateCamera. Movement is camera-relative, so a test that
// skips this walks in the wrong direction.
function syncCamera(dt = DT, snap = false) {
  const desired = player.position
    .clone()
    .add(CAM_OFFSET.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), player.facingAngle));
  if (snap) camera.position.copy(desired);
  else camera.position.lerp(desired, Math.min(1, dt * 4));
}

function teleport(x, z) {
  player.mesh.position.set(x, 0, z);
  syncCamera(DT, true);
}

// Walks with the given input for `frames`, keeping the camera in sync.
function walk(frames, move) {
  input.moveVector = move;
  for (let i = 0; i < frames; i++) {
    player.update(DT, input, camera);
    syncCamera();
    facility.update(DT);
  }
  input.moveVector = { x: 0, z: 0 };
}

const FORWARD = { x: 0, z: -1 }; // W / ArrowUp -- away from the camera

// ---------------------------------------------------------------- 맵

section('맵');
check('구역 개수', facility.areas.size === 13, `areas=${facility.areas.size}`);

teleport(0, -3);
walk(700, FORWARD);
let where = facility.areaAt(player.position.x, player.position.z);
check('오두막에서 걸어나가 홀에 도달', where === 'hall', `${where}, z=${player.position.z.toFixed(1)}`);

// every hand-placed item must be standable-next-to, not buried inside a shelf
let unreachableItems = [];
for (const it of WORLD_ITEMS) {
  let reachable = false;
  for (let a = 0; a < 32 && !reachable; a++) {
    for (let r = 0; r <= 2 && !reachable; r += 0.2) {
      const x = it.x + Math.cos((a / 32) * Math.PI * 2) * r;
      const z = it.z + Math.sin((a / 32) * Math.PI * 2) * r;
      if (facility.isWalkable(x, z)) reachable = true;
    }
  }
  if (!reachable) unreachableItems.push(`${it.id}(${it.x},${it.z})`);
}
check('배치된 아이템 전부 주울 수 있음', unreachableItems.length === 0, unreachableItems.join(', '));

// props must actually block
check('창고 선반이 통과 불가', !facility.isWalkable(-28, 24));
check('선반 사이 통로는 통과 가능', facility.isWalkable(-28, 21.5));

// ------------------------------------------------------------ 잠긴 문

section('잠긴 문 / 2장 진입');
facility.resetDoors();
teleport(0, 48);
walk(600, FORWARD);
check('키카드 없이는 문에 막힘', player.position.z < 55.3, `z=${player.position.z.toFixed(2)}`);

facility.unlockGate();
for (let i = 0; i < 120; i++) facility.update(DT); // 문이 올라가는 연출
walk(900, FORWARD);
where = facility.areaAt(player.position.x, player.position.z);
check('문을 연 뒤 아레나 진입', where === 'arena', `${where}, z=${player.position.z.toFixed(1)}`);
check('문이 천장으로 올라감', facility.gateDoor.mesh.position.y > 4);

facility.resetDoors();
check('문 잠금 복구 (새 게임 대비)', !facility.gateDoor.open && !facility.isWalkable(0, 56));

// ------------------------------------------------------------ 전투

section('전투 / 성장');
const enemies = [];
let lastKill = null;
const combat = new CombatSystem(player, enemies, { onKill: (e) => { lastKill = e; } });

// Attacks fire inside player.update, so facing has to be set before it -- and
// with no move input, update() leaves facing alone.
function attackLoop(frames, target, opts = {}) {
  let swings = 0;
  for (let i = 0; i < frames; i++) {
    if (opts.chase) {
      player.mesh.position.set(target.position.x, 0, target.position.z - 1.6);
    }
    player.facingAngle = Math.atan2(
      target.position.x - player.position.x,
      target.position.z - player.position.z
    );
    input.attackPressed = player.attackCooldownTimer <= 0;
    if (input.attackPressed) swings++;
    player.update(DT, input, camera);
    combat.update(DT);
    target.update(DT, player);
    opts.each?.(i);
    input.endFrame();
  }
  return swings;
}

player.reset(facility.spawnPoint);
const deer = new Deer(facility, new THREE.Vector3(0, 0, 20));
enemies.push(deer);
teleport(0, 18.4);
const deerSwings = attackLoop(900, deer, { chase: true });
check('사슴 처치', !deer.alive, `${deerSwings}회 공격`);
check('처치 콜백 발생', lastKill === deer);
check('처치로 경험치 획득', player.exp > 0 || player.level > 1, `exp=${player.exp} lv=${player.level}`);

const before = { atk: player.attackDamage, hp: player.maxHp, lv: player.level };
player.gainExp(500);
check('레벨업으로 강해짐',
  player.attackDamage > before.atk && player.maxHp > before.hp,
  `Lv.${before.lv}→${player.level}, 공격력 ${before.atk}→${player.attackDamage}, 최대HP ${before.hp}→${player.maxHp}`);

player.reset(facility.spawnPoint);
teleport(0, 20);
const wolf = new Wolf(facility, new THREE.Vector3(5, 0, 20), 2);
const hpBefore = player.hp;
for (let i = 0; i < 600; i++) {
  wolf.update(DT, player);
  player.invulnTimer = Math.max(0, player.invulnTimer - DT);
}
check('늑대가 추격해서 물어뜯음', player.hp < hpBefore, `HP ${hpBefore.toFixed(0)} → ${player.hp.toFixed(0)}`);

player.reset(facility.spawnPoint);
teleport(0, 78);
const darts = [];
const sci = new Scientist(facility, new THREE.Vector3(7, 0, 78), { onProjectile: (p) => darts.push(p) });
for (let i = 0; i < 600; i++) sci.update(DT, player);
check('과학자가 주사기를 던짐', darts.length > 0, `${darts.length}발`);
const hpBeforeDart = player.hp;
for (let i = 0; i < 300; i++) for (const d of darts) d.update(DT, player, facility);
check('주사기가 소멸(명중 또는 벽)', darts.every((d) => !d.alive), `HP ${hpBeforeDart.toFixed(0)} → ${player.hp.toFixed(0)}`);

// ------------------------------------------------------------ 보스

section('사령관 (최종 보스)');
player.reset(facility.spawnPoint);
player.attackDamage = 40;
teleport(0, 84);
const boss = new Commander(facility, new THREE.Vector3(0, 0, 86));
enemies.push(boss);
let slams = 0, sawTelegraph = false, phase2 = false;
boss.onSlam = () => slams++;
boss.onPhaseChange = () => { phase2 = true; };
const bossSwings = attackLoop(4000, boss, {
  chase: true,
  each: () => {
    player.hp = player.maxHp; // testing the boss, not survival
    if (boss.ring.visible) sawTelegraph = true;
  },
});
check('공격 예고(바닥 링)가 뜸', sawTelegraph);
check('체력 절반에서 2페이즈 전환', phase2, `phase=${boss.phase}`);
check('내려찍기 사용', slams > 0, `${slams}회`);
check('보스를 쓰러뜨릴 수 있음', !boss.alive, `${bossSwings}회 공격, HP ${boss.hp}/${boss.maxHp}`);

// ------------------------------------------------------------ 상호작용

section('상호작용 / 생존');
player.reset(facility.spawnPoint);
const interaction = new InteractionSystem(player);
const pickup = new Pickup('canned-food', new THREE.Vector3(0, 0, -2));
interaction.add({
  position: pickup.position, interactRadius: 2.2,
  get promptText() { return pickup.taken ? null : pickup.promptText; },
  onInteract(p) { pickup.taken = true; p.addItem('canned-food', '통조림', 1); },
});
teleport(0, -8);
interaction.update(DT, { confirmPressed: false });
check('멀리 있으면 안내 없음', interaction.promptText === null);
teleport(0, -3);
interaction.update(DT, { confirmPressed: false });
check('가까이 가면 안내 표시', interaction.promptText === '통조림 줍기', `${interaction.promptText}`);
interaction.update(DT, { confirmPressed: true });
check('Enter로 습득', player.countOf('canned-food') === 1);
interaction.update(DT, { confirmPressed: false });
check('주운 뒤 안내 사라짐', interaction.promptText === null);

player.reset(facility.spawnPoint);
player.hunger = 0.2;
for (let i = 0; i < 300; i++) player.update(DT, input, camera);
check('굶으면 HP가 깎임', player.hp < player.maxHp, `HP ${player.hp.toFixed(1)}`);
player.addItem('canned-food', '통조림', 1);
player.eat('canned-food', 50);
check('먹으면 허기 회복 + 소모', player.hunger >= 50 && !player.hasItem('canned-food'), `허기 ${player.hunger.toFixed(0)}`);


// ------------------------------------------------------ 숨겨진 보스 (2회차)

section('숨겨진 보스 / 2회차');

const badSpots = HIDDEN_BOSSES.filter((b) => !facility.isWalkable(b.x, b.z, 0.9));
check('숨겨진 보스 3기가 걸을 수 있는 곳에 배치됨', badSpots.length === 0,
  badSpots.map((b) => b.type).join(', '));
check('보스 수 = 필요한 재료 수', HIDDEN_BOSSES.length === 3);

// each type must actually be able to hurt you, or it's scenery with a health bar
for (const spot of HIDDEN_BOSSES) {
  player.reset(facility.spawnPoint);
  const darts2 = [];
  const m = new Mutant(facility, new THREE.Vector3(spot.x, 0, spot.z), spot.type, {
    area: spot.area,
    onProjectile: (proj) => darts2.push(proj),
  });
  const def = MUTANT_TYPES[spot.type];

  // far away: stays asleep
  teleport(spot.x + 20, spot.z);
  for (let i = 0; i < 60; i++) m.update(DT, player);
  const sleptWhenFar = !m.awake;

  // walk up: wakes
  teleport(spot.x, spot.z - 3);
  for (let i = 0; i < 30; i++) m.update(DT, player);
  check(`${def.name} 접근 시 각성`, sleptWhenFar && m.awake,
    `멀 때 수면=${sleptWhenFar}, 접근 후 각성=${m.awake}`);

  const hpStart = player.hp;
  for (let i = 0; i < 900; i++) {
    // hold position so the fight is about its attacks, not about chasing
    teleport(spot.x, spot.z - 3);
    m.update(DT, player);
    for (const d of darts2) d.update(DT, player, facility);
    player.invulnTimer = Math.max(0, player.invulnTimer - DT);
  }
  check(`${def.name}(${def.pattern})가 피해를 입힘`, player.hp < hpStart,
    `HP ${hpStart.toFixed(0)} → ${player.hp.toFixed(0)}`);

  // and it has to be killable. reset first -- the damage test above leaves the
  // player dead, and a dead player never swings.
  player.reset(facility.spawnPoint);
  m.hp = m.maxHp;
  const solo = [];
  const soloCombat = new CombatSystem(player, solo, {});
  solo.push(m);
  player.attackDamage = 45;
  player.hp = 999; player.maxHp = 999;
  for (let i = 0; i < 3000 && m.alive; i++) {
    player.mesh.position.set(m.position.x, 0, m.position.z - 1.8);
    player.facingAngle = 0;
    input.attackPressed = player.attackCooldownTimer <= 0;
    player.update(DT, input, camera);
    soloCombat.update(DT);
    m.update(DT, player);
    player.hp = player.maxHp;
    input.endFrame();
  }
  check(`${def.name} 처치 가능`, !m.alive, `HP ${m.hp}/${m.maxHp}`);
  check(`${def.name}가 이상한 재료를 떨굼`, m.lootId === 'strange-material');
}

// 실수로 깨웠을 때 물러설 수 있어야 한다: 멀리 도망가면 제자리로 돌아간다
player.reset(facility.spawnPoint);
const leashSpot = HIDDEN_BOSSES[0];
const leashBoss = new Mutant(
  facility, new THREE.Vector3(leashSpot.x, 0, leashSpot.z), leashSpot.type, { area: leashSpot.area }
);
teleport(leashSpot.x, leashSpot.z - 3);
for (let i = 0; i < 60; i++) leashBoss.update(DT, player);
const wokeUp = leashBoss.awake;
leashBoss.hp = leashBoss.maxHp * 0.5; // 절반 깎아둔 상태로 도망친다

teleport(2, 22); // 중앙 홀 반대편으로 도주
let chasedDistance = Infinity;
for (let i = 0; i < 900; i++) {
  leashBoss.update(DT, player);
  chasedDistance = Math.min(chasedDistance, leashBoss.position.distanceTo(player.position));
}
const home = new THREE.Vector3(leashSpot.x, 0, leashSpot.z);
check('도망치면 보스가 추격을 포기함', chasedDistance > 6,
  `가장 가까웠던 거리 ${chasedDistance.toFixed(1)}m`);
check('제자리로 복귀', leashBoss.position.distanceTo(home) < 4,
  `둥지에서 ${leashBoss.position.distanceTo(home).toFixed(1)}m`);
check('떨어져 있으면 체력 회복 (후퇴 후 반복 견제 차단)', leashBoss.hp > leashBoss.maxHp * 0.5,
  `HP ${leashBoss.hp.toFixed(0)}/${leashBoss.maxHp}`);

// 체력 절반에서 격앙: 공격 간격이 짧아지고 빨라진다
player.reset(facility.spawnPoint);
const rageSpot = HIDDEN_BOSSES[2];
const rageBoss = new Mutant(
  facility, new THREE.Vector3(rageSpot.x, 0, rageSpot.z), rageSpot.type, { area: rageSpot.area }
);
teleport(rageSpot.x, rageSpot.z - 3);
for (let i = 0; i < 30; i++) rageBoss.update(DT, player);
const calmSpeed = rageBoss.speed;
let announced = false;
rageBoss.onEnrage = () => { announced = true; };
check('절반 위에서는 평상시', !rageBoss.enraged);
rageBoss.takeDamage(rageBoss.maxHp * 0.55);
rageBoss.update(DT, player);
check('체력 절반에서 격앙 전환', rageBoss.enraged && announced);
check('격앙 시 더 빨라짐', rageBoss.speed > calmSpeed,
  `${calmSpeed.toFixed(1)} → ${rageBoss.speed.toFixed(1)}`);

// 대사 시스템: Enter 한 번이 열기와 넘기기를 동시에 하면 안 된다
section('대사');
const dlg = new DialogueSystem();
let finished = false;
dlg.say(SCRIPT.intro, () => { finished = true; });
check('대사 시작', dlg.active && dlg.current.text === SCRIPT.intro[0].text);
dlg.update({ confirmPressed: true }); // 여는 프레임은 무시되어야 함
check('여는 프레임의 Enter는 무시', dlg.index === 0);
dlg.update({ confirmPressed: true });
check('Enter로 다음 줄', dlg.index === 1);
while (dlg.active) dlg.update({ confirmPressed: true });
check('끝나면 콜백 호출', finished && !dlg.active);

// ------------------------------------------------------------ 렌더링 부하

section('조명');
const litCounts = new Set();
for (const z of [0, 20, 40, 60, 85]) {
  teleport(0, z);
  facility._lightCullTimer = 0;
  facility.update(DT);
  litCounts.add(facility.flickerLights.filter((f) => f.light.visible).length);
}
check('켜진 조명 수가 항상 일정 (셰이더 재컴파일 방지)', litCounts.size === 1, `관측값: ${[...litCounts].join(', ')}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
process.exit(failed.length ? 1 : 0);
