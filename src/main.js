import * as THREE from 'three';
import './style.css';
import { Game } from './core/Game.js';
import { InputManager } from './core/InputManager.js';
import { Facility } from './world/Facility.js';
import { Player } from './entities/Player.js';
import { Wolf } from './entities/Wolf.js';
import { Deer } from './entities/Deer.js';
import { Scientist } from './entities/Scientist.js';
import { Commander } from './entities/Commander.js';
import { Pickup } from './entities/Pickup.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { InteractionSystem } from './systems/Interaction.js';
import { ITEMS, WORLD_ITEMS } from './systems/Items.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { HUD } from './ui/HUD.js';

const WOLF_SPAWN_INTERVAL = 40; // seconds between reinforcements in chapter 1
const SCIENTIST_COUNT = 4;

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
const input = new InputManager();
const hud = new HUD(document.getElementById('ui-root'));

const facility = new Facility(game.scene);
const player = new Player(facility, facility.spawnPoint);
game.scene.add(player.mesh);
facility.viewer = player.position; // so Facility can cull distant lights

const enemies = []; // every hittable actor: wolves, deer, scientists, commander
const pickups = [];
const projectiles = [];

const interaction = new InteractionSystem(player);
const combat = new CombatSystem(player, enemies, {
  onKill: (e) => onEnemyKilled(e),
});

// ---------------------------------------------------------------- run state

const run = {
  mode: 'title', // title | playing | paused | dead | ending
  chapter: 1,
  elapsed: 0,
  wolfTimer: 0,
  wolvesSpawned: 0,
  chapter2Started: false,
  commander: null,
  commanderDefeated: false,
  takenWorldItems: [], // indices into WORLD_ITEMS, so a reload doesn't respawn them
};

let menuIndex = 0;
let menuItems = [];
let menuTitle = '';
let menuSubtitle = '';

player.onLevelUp = (level) => {
  hud.log(`레벨 업! (Lv.${level}) 공격력과 최대 HP가 올랐다.`);
};

// ---------------------------------------------------------------- spawning

function addEnemy(enemy) {
  enemy.onDeath = onEnemyDied;
  enemies.push(enemy);
  game.scene.add(enemy.mesh);
  return enemy;
}

function spawnWolf(tier = 1, position) {
  return addEnemy(
    new Wolf(facility, position ?? facility.randomHuntingGround(player.position), tier)
  );
}

function spawnDeer(position) {
  return addEnemy(new Deer(facility, position ?? facility.randomHuntingGround(player.position)));
}

function spawnPickup(itemId, position, count = 1) {
  const pickup = new Pickup(itemId, position, count);
  pickups.push(pickup);
  game.scene.add(pickup.mesh);
  interaction.add({
    position: pickup.position,
    interactRadius: pickup.interactRadius,
    get promptText() {
      return pickup.taken ? null : pickup.promptText;
    },
    onInteract(p) {
      if (pickup.taken) return;
      pickup.taken = true;
      p.addItem(pickup.itemId, pickup.name, pickup.count);
      hud.log(`${pickup.name}을(를) 얻었다.`);
      removePickup(pickup, this);
      if (pickup.worldIndex !== undefined) run.takenWorldItems.push(pickup.worldIndex);
    },
  });
  return pickup;
}

function removePickup(pickup, target) {
  game.scene.remove(pickup.mesh);
  const i = pickups.indexOf(pickup);
  if (i !== -1) pickups.splice(i, 1);
  interaction.remove(target);
}

function spawnWorldItems() {
  WORLD_ITEMS.forEach((entry, index) => {
    if (run.takenWorldItems.includes(index)) return;
    const pickup = spawnPickup(entry.id, new THREE.Vector3(entry.x, 0, entry.z));
    pickup.worldIndex = index;
  });
}

// Loot now drops on the floor and has to be picked up (roadmap item 4), instead
// of teleporting into the inventory the instant something dies.
function onEnemyDied(enemy) {
  if (enemy.lootId) {
    const where = enemy.position.clone();
    where.y = 0;
    spawnPickup(enemy.lootId, where);
  }

  // sink the corpse instead of popping it out of existence
  const startY = enemy.mesh.position.y;
  let t = 0;
  const sink = () => {
    t += 1 / 60;
    enemy.mesh.position.y = startY - t * 0.5;
    enemy.mesh.rotation.x += 0.03;
    if (t < 1.6) requestAnimationFrame(sink);
    else game.scene.remove(enemy.mesh);
  };
  sink();
}

function onEnemyKilled(enemy) {
  if (enemy.isBoss) {
    run.commanderDefeated = true;
    run.commander = null;
    hud.hideBoss();
    facility.markEscapeReady();
    hud.log('사령관이 무릎을 꿇었다. 출구의 잠금이 풀렸다.');
    hud.setObjective('아레나 끝의 문으로 탈출하기');
  } else if (enemy instanceof Scientist) {
    const left = enemies.filter((e) => e instanceof Scientist && e.alive).length;
    if (left > 0) {
      hud.setObjective(`시설 심부의 연구원 제압 (${SCIENTIST_COUNT - left}/${SCIENTIST_COUNT})`);
    } else {
      spawnCommander();
    }
  }
}

// ------------------------------------------------------- chapter transitions

function startChapter2() {
  if (run.chapter2Started) return;
  run.chapter2Started = true;
  run.chapter = 2;

  hud.log('공기가 차가워졌다. 발소리가 들린다.');
  hud.setObjective(`시설 심부의 연구원 제압 (0/${SCIENTIST_COUNT})`);

  const spots = [
    [-10, 74], [10, 74], [-7, 84], [8, 84],
  ];
  for (let i = 0; i < SCIENTIST_COUNT; i++) {
    const [x, z] = spots[i % spots.length];
    addEnemy(
      new Scientist(facility, new THREE.Vector3(x, 0, z), {
        onProjectile: (proj) => {
          projectiles.push(proj);
          game.scene.add(proj.mesh);
        },
      })
    );
  }

  // the tone shifts with the chapter
  game.scene.fog.color.setHex(0x0c1216);
  game.scene.fog.density = 0.03;
}

function spawnCommander() {
  const boss = new Commander(facility, new THREE.Vector3(0, 0, 88));
  boss.onSlam = (center, radius) => spawnShockwave(center, radius);
  boss.onPhaseChange = () => hud.log('사령관이 갑주의 잠금을 풀었다.');
  run.commander = addEnemy(boss);
  hud.showBoss(boss.name);
  hud.updateBoss(boss.hp, boss.maxHp);
  hud.log('사령관: "실험체가 여기까지 왔군."');
  hud.setObjective('사령관 처치');
}

// Purely visual: an expanding ring on the floor where the slam landed.
const shockwaves = [];
function spawnShockwave(center, radius) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff5533, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(center.x, 0.08, center.z);
  game.scene.add(ring);
  shockwaves.push({ ring, mat, t: 0, radius });
}

function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.t += dt * 2.4;
    s.ring.scale.setScalar(s.radius * Math.min(1, s.t));
    s.mat.opacity = 0.6 * (1 - Math.min(1, s.t));
    if (s.t >= 1) {
      game.scene.remove(s.ring);
      shockwaves.splice(i, 1);
    }
  }
}

// ------------------------------------------------------- fixed interactables

interaction.add({
  fixed: true,
  position: facility.gatePosition,
  interactRadius: 3.2,
  get promptText() {
    if (facility.gateDoor.open) return null;
    return player.hasItem('keycard') ? '출입 카드로 문 열기' : '잠긴 문 살펴보기';
  },
  onInteract(p) {
    if (!p.hasItem('keycard')) {
      hud.log('붉은 램프가 깜빡인다. 출입 카드가 있어야 열린다.');
      return;
    }
    p.consumeItem('keycard');
    facility.unlockGate();
    hud.log('카드를 갖다 대자 문이 굉음을 내며 올라간다.');
    hud.setObjective('문 너머로 나아가기');
  },
});

interaction.add({
  fixed: true,
  position: facility.bedPosition,
  interactRadius: 2.4,
  get promptText() {
    return run.mode === 'playing' ? '침대에서 쉬며 기록하기 (저장)' : null;
  },
  onInteract() {
    if (saveGame()) hud.log('기록했다. 잠시 숨을 돌린다.');
    else hud.log('기록할 수 없었다.');
  },
});

interaction.add({
  fixed: true,
  position: facility.escapePosition,
  interactRadius: 3.2,
  get promptText() {
    if (!run.commanderDefeated) return null;
    return '문을 열고 나간다';
  },
  onInteract() {
    finishRun();
  },
});

// ------------------------------------------------------------- run lifecycle

function clearWorld() {
  for (const e of enemies) game.scene.remove(e.mesh);
  enemies.length = 0;
  for (const p of pickups) game.scene.remove(p.mesh);
  pickups.length = 0;
  for (const p of projectiles) game.scene.remove(p.mesh);
  projectiles.length = 0;
  for (const s of shockwaves) game.scene.remove(s.ring);
  shockwaves.length = 0;
  // pickup targets die with their pickups; door/bed/exit are marked fixed
  interaction.targets = interaction.targets.filter((t) => t.fixed);
  interaction.current = null;
}

function newRun(saved = null) {
  clearWorld();
  facility.resetDoors();

  run.chapter = saved?.chapter ?? 1;
  run.elapsed = saved?.elapsed ?? 0;
  run.wolfTimer = 0;
  run.wolvesSpawned = saved?.wolvesSpawned ?? 0;
  run.chapter2Started = false;
  run.commander = null;
  run.commanderDefeated = false;
  run.takenWorldItems = saved?.takenWorldItems ?? [];

  player.reset(facility.spawnPoint);
  if (saved) {
    player.hp = saved.hp;
    player.maxHp = saved.maxHp;
    player.hunger = saved.hunger;
    player.level = saved.level;
    player.exp = saved.exp;
    player.expToNext = saved.expToNext;
    player.attackDamage = saved.attackDamage;
    player.inventory = saved.inventory.map((i) => ({ ...i }));
    player.mesh.position.set(saved.x, 0, saved.z);
    // the keycard is consumed on use, so the gate must come back already open
    if (saved.gateUnlocked) facility.unlockGate();
  }

  game.scene.fog.color.setHex(0x1a1708);
  game.scene.fog.density = 0.045;

  spawnWorldItems();
  for (let i = 0; i < 4; i++) spawnDeer();
  for (let i = 0; i < 2; i++) spawnWolf();

  hud.hideBoss();
  hud.setObjective('시설을 돌아다니며 출구를 찾기');
  hud.setHudVisible(true);
  hud.hideOverlay();
  run.mode = 'playing';
}

function finishRun() {
  const secret = SaveSystem.isNewGamePlus && player.hasItem('strange-material');
  run.mode = 'ending';
  hud.setHudVisible(false);
  hud.hideBoss();
  SaveSystem.clear();

  if (secret) {
    SaveSystem.recordClear('secret');
    hud.showOverlay(
      '??? 엔딩',
      '문을 나서기 전, 주머니 속 재료가 맥박처럼 뛰었다.<br />' +
        '주인공은 뒤를 돌아본다. 시설은 감옥이 아니라 설계도였다.<br />' +
        '밖으로 나온 것은 실험체가 아니라, 실험의 <b>결과</b>였다.',
      'Enter — 처음으로',
      { tone: 'bad' }
    );
  } else {
    SaveSystem.recordClear('normal');
    hud.showOverlay(
      '노멀 엔딩 — 탈출',
      '사령관을 쓰러뜨리고 문을 열었다.<br />' +
        '복도 끝에서 처음으로 형광등이 아닌 빛이 들어온다.<br />' +
        '무슨 실험이었는지는 끝내 알 수 없었다.',
      'Enter — 처음으로',
      { tone: 'good' }
    );
  }
}

function die() {
  run.mode = 'dead';
  hud.hideBoss();
  hud.showOverlay(
    '사망',
    '허기와 위협 속에서 쓰러졌다.',
    SaveSystem.hasSave() ? 'Enter — 마지막 기록에서 다시' : 'Enter — 처음부터 다시',
    { tone: 'bad' }
  );
}

// ------------------------------------------------------------- save / load

function saveGame() {
  return SaveSystem.save({
    chapter: run.chapter,
    gateUnlocked: facility.gateDoor.open,
    elapsed: run.elapsed,
    wolvesSpawned: run.wolvesSpawned,
    takenWorldItems: run.takenWorldItems,
    hp: player.hp,
    maxHp: player.maxHp,
    hunger: player.hunger,
    level: player.level,
    exp: player.exp,
    expToNext: player.expToNext,
    attackDamage: player.attackDamage,
    inventory: player.inventory,
    x: player.position.x,
    z: player.position.z,
  });
}

// A save always resumes from the cabin's chapter-1 state; the chapter-2 wing is
// rebuilt by walking into it again. Simpler than serialising boss state, and the
// only save point is the bed in chapter 1 anyway.
function loadGame() {
  const saved = SaveSystem.load();
  if (!saved) return false;
  newRun(saved);
  hud.log('기록을 불러왔다.');
  return true;
}

// ------------------------------------------------------------------- screens

function showTitle() {
  run.mode = 'title';
  hud.setHudVisible(false);
  menuIndex = 0;
  menuItems = [
    { id: 'new', label: '새 게임' },
    { id: 'continue', label: '이어하기', disabled: !SaveSystem.hasSave() },
  ];
  const cleared = SaveSystem.clearCount;
  drawMenu(
    '시설 생존기',
    cleared > 0 ? `클리어 ${cleared}회 · 2회차에서는 무언가 달라진다` : '낯선 방에서 눈을 떴다...'
  );
}

function drawMenu(title = menuTitle, subtitle = menuSubtitle) {
  menuTitle = title;
  menuSubtitle = subtitle;
  hud.showMenu(title, menuItems, menuIndex, subtitle);
}

function showPauseMenu() {
  run.mode = 'paused';
  menuIndex = 0;
  menuItems = [
    { id: 'resume', label: '계속하기' },
    { id: 'save', label: '저장하기' },
    { id: 'load', label: '불러오기', disabled: !SaveSystem.hasSave() },
    { id: 'title', label: '저장하고 처음으로' },
  ];
  drawMenu('일시정지', 'Shift — 닫기');
}

function menuConfirm() {
  const item = menuItems[menuIndex];
  if (!item || item.disabled) return;

  switch (item.id) {
    case 'new':
      SaveSystem.clear();
      newRun();
      break;
    case 'continue':
      if (!loadGame()) showTitle();
      break;
    case 'resume':
      run.mode = 'playing';
      hud.hideOverlay();
      hud.setHudVisible(true);
      break;
    case 'save':
      if (saveGame()) {
        const loadItem = menuItems.find((m) => m.id === 'load');
        if (loadItem) loadItem.disabled = false;
        drawMenu('일시정지', '기록했습니다. Shift — 닫기');
      } else {
        drawMenu('일시정지', '저장에 실패했습니다 (브라우저 저장소 사용 불가)');
      }
      break;
    case 'load':
      loadGame();
      break;
    case 'title':
      saveGame();
      showTitle();
      break;
  }
}

function handleMenuInput() {
  if (input.wasJustPressed('ArrowUp') || input.wasJustPressed('KeyW')) {
    menuIndex = (menuIndex - 1 + menuItems.length) % menuItems.length;
    drawMenu();
  }
  if (input.wasJustPressed('ArrowDown') || input.wasJustPressed('KeyS')) {
    menuIndex = (menuIndex + 1) % menuItems.length;
    drawMenu();
  }
  if (input.confirmPressed) menuConfirm();
  if (run.mode === 'paused' && input.cancelPressed) {
    run.mode = 'playing';
    hud.hideOverlay();
    hud.setHudVisible(true);
  }
}

// ---------------------------------------------------------------- actions

function tryEat() {
  // eat the least valuable food first so the good stuff is kept for emergencies
  const foods = player.inventory
    .filter((i) => ITEMS[i.id]?.kind === 'food')
    .sort((a, b) => ITEMS[a.id].restoreHunger - ITEMS[b.id].restoreHunger);
  if (foods.length === 0) {
    hud.log('먹을 것이 없다.');
    return;
  }
  const def = ITEMS[foods[0].id];
  player.eat(foods[0].id, def.restoreHunger);
  hud.log(`${def.name}을(를) 먹었다. (허기 +${def.restoreHunger})`);
}

// Boost items are used the moment they're picked up -- there's no equipment
// screen, and the design doc's growth loop is "get stronger", not "manage gear".
function consumeBoosts() {
  for (const entry of [...player.inventory]) {
    const def = ITEMS[entry.id];
    if (def?.kind !== 'boost') continue;
    for (let i = 0; i < entry.count; i++) player.applyBoost(def);
    player.consumeItem(entry.id, entry.count);
    hud.log(`${def.name}을(를) 주입했다. 몸이 뜨거워진다. (공격력 +${def.attack})`);
  }
}

// --------------------------------------------------------------- camera

// Negative z: the offset is rotated by the player's facing, so it has to point
// BEHIND them. A positive z parks the camera in front, which silently inverts
// WASD and makes the camera oscillate as facing and offset chase each other.
const cameraOffset = new THREE.Vector3(0, 3.4, -6);
function updateCamera(dt) {
  const desired = player.mesh.position
    .clone()
    .add(cameraOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), player.facingAngle));
  game.camera.position.lerp(desired, Math.min(1, dt * 4));
  game.camera.lookAt(player.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)));
}
game.camera.position.copy(player.mesh.position).add(cameraOffset);
game.camera.lookAt(player.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)));

// ------------------------------------------------------------- main loop

const mainLoop = {
  update(dt) {
    switch (run.mode) {
      case 'title':
      case 'paused':
        handleMenuInput();
        break;

      case 'dead':
        if (input.confirmPressed) {
          if (!loadGame()) newRun();
        }
        break;

      case 'ending':
        if (input.confirmPressed) showTitle();
        break;

      case 'playing':
        tick(dt);
        break;
    }
    input.endFrame();
  },
};

function tick(dt) {
  run.elapsed += dt;

  if (input.pausePressed || input.cancelPressed) {
    showPauseMenu();
    return;
  }
  if (input.eatPressed) tryEat();

  player.update(dt, input, game.camera);
  combat.update(dt);
  interaction.update(dt, input);
  consumeBoosts();

  for (const e of enemies) e.update(dt, player);
  for (let i = enemies.length - 1; i >= 0; i--) {
    // drop corpses once their sink animation has detached the mesh
    if (!enemies[i].alive && !enemies[i].mesh.parent) enemies.splice(i, 1);
  }
  for (const p of pickups) p.update(dt);

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.update(dt, player, facility);
    if (!proj.alive) {
      game.scene.remove(proj.mesh);
      projectiles.splice(i, 1);
    }
  }
  updateShockwaves(dt);

  // chapter 2 begins the moment the player steps past the unlocked gate
  if (!run.chapter2Started && facility.gateDoor.open) {
    const area = facility.areaAt(player.position.x, player.position.z);
    if (area === 'arena' || area === 'corr3') startChapter2();
  }

  if (run.commander?.alive) hud.updateBoss(run.commander.hp, run.commander.maxHp);

  // chapter 1 difficulty ramp: reinforcements keep arriving, and get nastier
  if (!run.chapter2Started) {
    run.wolfTimer += dt;
    if (run.wolfTimer >= WOLF_SPAWN_INTERVAL) {
      run.wolfTimer = 0;
      run.wolvesSpawned += 1;
      spawnWolf(1 + Math.floor(run.wolvesSpawned / 3));
      hud.log('무언가 어둠 속에서 다가온다...');
    }
  }

  if (!player.alive) {
    die();
    return;
  }

  hud.setPrompt(interaction.promptText);
  updateCamera(dt);
  hud.update(dt, player);
}

game.add(facility);
game.add(mainLoop);
game.start();
showTitle();
