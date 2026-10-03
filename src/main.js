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
import { Gatekeeper } from './entities/Gatekeeper.js';
import { Mutant } from './entities/Mutant.js';
import { Doppelganger } from './entities/Doppelganger.js';
import { Pickup } from './entities/Pickup.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { InteractionSystem } from './systems/Interaction.js';
import { ITEMS, WORLD_ITEMS, INTEL_TOTAL } from './systems/Items.js';
import { HIDDEN_BOSSES } from './world/LevelData.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { DialogueSystem, SCRIPT } from './systems/Dialogue.js';
import { HUD } from './ui/HUD.js';
import { createAudioSystem } from './systems/AudioSystem.js';

const WOLF_SPAWN_INTERVAL = 40; // seconds between reinforcements in chapter 1
const SCIENTIST_COUNT = 4;
const MATERIALS_FOR_SECRET = HIDDEN_BOSSES.length; // 기획서 8번: 재료를 모두 모아야 함
const INTEL_FOR_TRUE = INTEL_TOTAL; // 진 엔딩: 기밀 문서 전부 + 2회차

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
const input = new InputManager();
const hud = new HUD(document.getElementById('ui-root'));
const audio = createAudioSystem();
// AudioContext는 사용자 제스처 안에서만 시작/resume할 수 있다 (자동재생 정책).
// 클릭/키 입력 둘 중 뭐가 먼저 오든 한 번만 unlock하면 된다.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

const facility = new Facility(game.scene);
const player = new Player(facility, facility.spawnPoint);
game.scene.add(player.mesh);
facility.viewer = player.position; // so Facility can cull distant lights
let lastPlayerHp = player.hp; // frame-to-frame delta -- if it drops, something hit us

let settings = SaveSystem.settings;
audio.setEnabled(settings.soundOn);

// First-person weapon viewmodel: a stub of the pipe, parented to the camera so
// it rides along with the view. Only shown in first-person mode.
const viewmodel = new THREE.Group();
{
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a8f95, roughness: 0.5, metalness: 0.5 })
  );
  pipe.rotation.set(1.1, 0.3, 0.2);
  const hand = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xe0b090, roughness: 0.9 })
  );
  hand.position.set(0, -0.18, 0.02);
  viewmodel.add(pipe, hand);
  viewmodel.position.set(0.28, -0.24, -0.55);
  // a soft fill so the weapon stays readable in the dark rooms
  const fill = new THREE.PointLight(0xffe6c0, 0.35, 3, 2);
  fill.position.set(0, 0.2, 0.1);
  viewmodel.add(fill);
  game.camera.add(viewmodel);
  game.scene.add(game.camera); // camera must be in the graph for its child to render
}

// 손전등: 카메라 자식으로 붙여서 항상 시선 방향을 비춘다 (뷰모델과 같은 이유).
// player.hasFlashlight가 false면 애초에 켤 수 없고(toggleFlashlight에서 막음),
// 이 라이트 자체는 항상 존재하되 visible로만 on/off한다.
const flashlight = new THREE.SpotLight(0xfff2cc, 3.4, 16, Math.PI / 7.5, 0.45, 1.5);
flashlight.visible = false;
flashlight.position.set(0, 0, 0);
flashlight.target.position.set(0, 0, -1);
game.camera.add(flashlight, flashlight.target);
// a little lens glint so the beam has a visible source, not just a lit cone
const flashlightBulb = new THREE.Mesh(
  new THREE.SphereGeometry(0.02, 6, 6),
  new THREE.MeshBasicMaterial({ color: 0xfff6dd })
);
flashlightBulb.visible = false;
flashlight.add(flashlightBulb);

function toggleFlashlight() {
  if (!player.hasFlashlight) {
    hud.log('손전등이 없다.');
    return;
  }
  player.flashlightOn = !player.flashlightOn;
  flashlight.visible = player.flashlightOn;
  flashlightBulb.visible = player.flashlightOn;
  audio.playSfx('menuMove');
  hud.log(player.flashlightOn ? '손전등을 켰다.' : '손전등을 껐다.');
}

const enemies = []; // every hittable actor: wolves, deer, scientists, commander
const pickups = [];
const projectiles = [];

const interaction = new InteractionSystem(player);
const dialogue = new DialogueSystem();
const combat = new CombatSystem(player, enemies, {
  onHit: () => audio.playSfx('hit'),
  onKill: (e) => {
    audio.playSfx('enemyDeath');
    onEnemyKilled(e);
  },
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
  consoleUsed: false, // 통제 콘솔로 연구원 조우를 우회했는지 (기획서 5번 "이길 방법이 여러 가지인가")
  ngPlus: false, // 2회차 이상: 숨겨진 보스가 깨어나고 적이 강해진다
  ngPlusLevel: 0, // 클리어 횟수 (0=1회차). 3회차부터는 이 수치로 난이도가 계속 오른다
  takenWorldItems: [], // indices into WORLD_ITEMS, so a reload doesn't respawn them
  mutants: [],
  inSanctum: false, // 진 엔딩 루트: "???" 구역에 들어와 있다
  doppel: null,
  gatekeeper: null, // 1장 미니보스 "문지기" -- 쓰러뜨려야 출입 카드를 얻는다
};

let menuIndex = 0;
let menuItems = [];
let menuTitle = '';
let menuSubtitle = '';

player.onLevelUp = (level) => {
  hud.log(`레벨 업! (Lv.${level}) 공격력과 최대 HP가 올랐다.`);
  audio.playSfx('levelUp');
};

// ---------------------------------------------------------------- spawning

function addEnemy(enemy) {
  enemy.onDeath = onEnemyDied;
  enemies.push(enemy);
  game.scene.add(enemy.mesh);
  return enemy;
}

function spawnWolf(tier = 1, position) {
  const bumped = tier + run.ngPlusLevel;
  return addEnemy(
    new Wolf(facility, position ?? facility.randomHuntingGround(player.position), bumped)
  );
}

// The facility's original specimens. Second run only -- they're the whole
// content of 기획서 8번's ??? ending, and dropping them into a first run would
// spoil the twist and wreck the difficulty curve at the same time.
function spawnHiddenBosses() {
  run.mutants = [];
  for (const spot of HIDDEN_BOSSES) {
    const m = new Mutant(facility, new THREE.Vector3(spot.x, 0, spot.z), spot.type, {
      area: spot.area,
      onProjectile: (proj) => {
        projectiles.push(proj);
        game.scene.add(proj.mesh);
      },
      onWake: (self) => {
        dialogue.say(SCRIPT.mutantWake);
        hud.log(`${self.name} — ${self.def.subtitle}`);
        audio.playSfx('bossAppear');
      },
    });
    // 숨겨진 보스 3기는 원래부터 "2회차" 기준으로 잡혀 있던 수치라, 3회차부터
    // 추가로 조금씩 더 강해진다 (사령관/늑대와 같은 결의 계속되는 난이도 곡선).
    if (run.ngPlusLevel > 1) {
      const mult = 1 + 0.2 * (run.ngPlusLevel - 1);
      m.maxHp = Math.round(m.maxHp * mult);
      m.hp = m.maxHp;
      m.damageMul = mult;
    }
    m.onSlam = (center, radius) => spawnShockwave(center, radius);
    m.onEnrage = (self) => hud.log(`${self.name}의 봉인이 완전히 풀렸다.`);
    run.mutants.push(addEnemy(m));
  }
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
      audio.playSfx('pickup');
      if (pickup.itemId === 'research-log') {
        dialogue.say([
          { speaker: '연구 일지', text: '"실패작 3기(1974·2045·0268)는 하위 구역에 봉인. 폐기 보류."' },
          { speaker: '연구 일지', text: '"실험체가 실패작을 마주하는 경우는 상정하지 않았다."' },
          { speaker: '', text: '...봉인. 이 숲 어딘가에 아직 뭔가 남아 있다.' },
        ]);
      }
      if (pickup.itemId === 'strange-material') {
        const n = p.countOf('strange-material');
        hud.log(`이상한 재료 ${n}/${MATERIALS_FOR_SECRET}`);
      }
      if (pickup.itemId === 'facility-file') {
        const n = p.countOf('facility-file');
        hud.log(`기밀 문서 ${n}/${INTEL_FOR_TRUE}`);
        if (n === INTEL_FOR_TRUE) {
          dialogue.say([
            { speaker: '', text: '문서 세 장이 한 사건을 세 방향에서 가리킨다.' },
            {
              speaker: '',
              text: SaveSystem.isNewGamePlus
                ? '관측실 하부에 "원본 보관고"가 있다. 사령관 너머, 출구 대신 그리로.'
                : '"원본 보관고"라는 단어. 지금의 나로는 갈 수 없는 곳이다.',
            },
          ]);
        }
      }
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
  if (enemy instanceof Doppelganger) {
    run.doppel = null;
    hud.hideBoss();
    dialogue.say(SCRIPT.doppelDefeated, () => trueEnding());
  } else if (enemy.isBoss) {
    run.commanderDefeated = true;
    run.commander = null;
    hud.hideBoss();
    facility.markEscapeReady();
    dialogue.say(SCRIPT.commanderDefeated, () => {
      const n = player.countOf('facility-file');
      if (run.ngPlus && n >= INTEL_FOR_TRUE) {
        dialogue.say(SCRIPT.intelGateReady);
      }
    });
    hud.setObjective('아레나 끝의 문으로');
  } else if (enemy instanceof Scientist) {
    // Only the opening wave of 4 gates the boss. Scientists the boss summons in
    // phase 2 must not re-trigger spawnCommander when the last one dies.
    if (run.commander || run.commanderDefeated) return;
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
  audio.setMusicState('breach'); // "facility breach" -- 기획서 6번, enter facility(2)
  dialogue.say(SCRIPT.forestReveal, () => dialogue.say(SCRIPT.scientistFirst));

  const spots = [
    [-13, 126.3], [13, 126.3], [-9.1, 140.6], [10.4, 140.6],
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

  // the tone shifts with the chapter -- back to cold facility grey now that
  // the forest has been revealed as illusion
  game.scene.fog.color.setHex(0x0c1216);
  game.scene.fog.density = 0.02;
}

function spawnCommander() {
  const boss = new Commander(facility, new THREE.Vector3(0, 0, 146));
  if (run.ngPlusLevel > 0) {
    // 2회차 1.3배로 시작해, 이후 회차마다 조금씩 더 (4회차 이후 1.9배에서 상한).
    const mult = 1 + 0.3 * run.ngPlusLevel;
    boss.maxHp = Math.round(boss.maxHp * mult);
    boss.hp = boss.maxHp;
  }
  boss.onSlam = (center, radius) => spawnShockwave(center, radius);
  boss.onPhaseChange = () => {
    hud.log('project 0003이 갑주의 잠금을 풀었다.');
    audio.playSfx('bossPhase');
  };
  boss.onSummon = (self) => {
    // 기획서 5번: 사령관은 과학자도 불러낸다
    const side = Math.random() < 0.5 ? -1 : 1;
    const spot = new THREE.Vector3(self.position.x + side * 6, 0, self.position.z - 4);
    addEnemy(
      new Scientist(facility, spot, {
        onProjectile: (proj) => {
          projectiles.push(proj);
          game.scene.add(proj.mesh);
        },
      })
    );
    hud.log('0003이 연구원을 호출했다.');
  };
  run.commander = addEnemy(boss);
  hud.setObjective('project 0003 처치');
  dialogue.say(run.ngPlus ? SCRIPT.commanderAppearNgPlus : SCRIPT.commanderAppear);
  audio.playSfx('bossAppear');
}

// 1장 미니보스 "문지기" -- 실험실에서 출입 카드를 지킨다. 사령관(project 0003)과
// 달리 컷신 없이 그냥 그 자리에 서 있다 -- 처음부터 눈에 보이는, 피할 수 없는
// 관문이라 등장을 따로 연출할 필요가 없다.
function spawnGatekeeper() {
  const gk = new Gatekeeper(facility, new THREE.Vector3(40, 0, 40));
  run.gatekeeper = addEnemy(gk);
}

// One bar, whichever big thing is currently fighting you. Mutants are optional
// and can be walked away from, so the bar follows the nearest awake one.
function updateBossBar() {
  let target = run.doppel?.alive ? run.doppel : run.commander?.alive ? run.commander : null;
  if (!target && run.gatekeeper?.alive && run.gatekeeper.position.distanceTo(player.position) < 20) {
    target = run.gatekeeper;
  }
  if (!target) {
    let best = Infinity;
    for (const m of run.mutants) {
      if (!m.alive || !m.awake) continue;
      const d = m.position.distanceTo(player.position);
      if (d < 24 && d < best) {
        best = d;
        target = m;
      }
    }
  }
  if (target) {
    hud.showBoss(target.name);
    hud.updateBoss(target.hp, target.maxHp);
    // 기획서 6번 BGM 표: 보스마다 지정된 트랙이 있으면 튼다. 문지기는 표에
    // 없는 존재라 트랙을 안 바꾸고 그때까지의 배경음을 그대로 둔다.
    const track = target === run.doppel ? 'selfhate'
      : target === run.commander ? 'project0003'
      : run.mutants.includes(target) ? 'failure'
      : null;
    if (track) audio.setMusicState(track);
  } else {
    hud.hideBoss();
    // "???" 구역은 그 안의 이야기 비트(도착/그와의 조우)가 직접 트랙을 정하므로
    // 여기서 덮어쓰지 않는다 -- enterSanctum() 참고.
    if (!run.inSanctum) audio.setMusicState(run.chapter === 2 ? 'breach' : 'peace');
  }
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
      audio.playSfx('doorLocked');
      return;
    }
    p.consumeItem('keycard');
    facility.unlockGate();
    hud.log('카드를 갖다 대자 문이 굉음을 내며 올라간다.');
    hud.setObjective('문 너머로 나아가기');
    audio.playSfx('doorOpen');
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
    if (saveGame()) {
      hud.log('기록했다. 잠시 숨을 돌린다.');
      audio.playSfx('save');
    } else hud.log('기록할 수 없었다.');
  },
});

// A non-combat alternative to the scientist wave (기획서 5번 "이길 수 있는 방법이
// 한 가지뿐인가"). Costs the XP/growth those four kills would have given --
// spawnCommander() is the same call the normal kill-count path makes, so the
// boss fight itself is untouched either way.
interaction.add({
  fixed: true,
  position: facility.consolePosition,
  interactRadius: 2.6,
  get promptText() {
    if (!run.chapter2Started || run.commander || run.commanderDefeated || run.consoleUsed) return null;
    const remaining = enemies.some((e) => e instanceof Scientist && e.alive);
    return remaining ? '통제 콘솔 해킹 — 진정 가스 살포' : null;
  },
  onInteract() {
    run.consoleUsed = true;
    facility.useConsole();
    for (const e of enemies) {
      if (e instanceof Scientist && e.alive) e.takeDamage(e.hp);
    }
    hud.log('가스가 새어 나오며 연구원들이 하나둘 쓰러진다. 싸우지 않고 지나간다.');
    audio.playSfx('override');
    spawnCommander();
  },
});

function trueRouteReady() {
  return (
    run.ngPlus &&
    run.commanderDefeated &&
    !run.inSanctum &&
    player.countOf('facility-file') >= INTEL_FOR_TRUE
  );
}

interaction.add({
  fixed: true,
  position: facility.escapePosition,
  interactRadius: 3.2,
  get promptText() {
    if (run.inSanctum || !run.commanderDefeated) return null;
    return trueRouteReady() ? '원본 보관고로 내려간다' : '문을 열고 나간다';
  },
  onInteract() {
    if (trueRouteReady()) enterSanctum();
    else finishRun();
  },
});

// ------------------------------------------------------------- run lifecycle

// Wipe every live combatant/projectile but leave the run intact. Used when the
// story teleports the player somewhere new (the 진 엔딩 sanctum) and the old
// chapter's enemies shouldn't follow.
function clearCombatActors() {
  for (const e of enemies) game.scene.remove(e.mesh);
  enemies.length = 0;
  for (const p of projectiles) game.scene.remove(p.mesh);
  projectiles.length = 0;
  for (const s of shockwaves) game.scene.remove(s.ring);
  shockwaves.length = 0;
  run.mutants = [];
  run.commander = null;
  run.gatekeeper = null;
}

function clearWorld() {
  for (const e of enemies) game.scene.remove(e.mesh);
  enemies.length = 0;
  for (const p of pickups) game.scene.remove(p.mesh);
  pickups.length = 0;
  for (const p of projectiles) game.scene.remove(p.mesh);
  projectiles.length = 0;
  for (const s of shockwaves) game.scene.remove(s.ring);
  shockwaves.length = 0;
  run.mutants = [];
  run.doppel = null;
  run.gatekeeper = null;
  // pickup targets die with their pickups; door/bed/exit are marked fixed
  interaction.targets = interaction.targets.filter((t) => t.fixed);
  interaction.current = null;
}

function newRun(saved = null) {
  clearWorld();
  facility.resetDoors();
  dialogue.clear();
  hud.hideDialogue();
  settings = SaveSystem.settings;
  audio.setEnabled(settings.soundOn);
  audio.setMusicState('peace'); // saves only ever resume in chapter 1
  run.ngPlus = SaveSystem.isNewGamePlus;
  // 3회차 이후로도 계속 강해지되, 무한히 치솟지 않게 4회차(레벨 3)에서 상한.
  run.ngPlusLevel = Math.min(SaveSystem.clearCount, 3);

  run.chapter = saved?.chapter ?? 1;
  run.elapsed = saved?.elapsed ?? 0;
  run.wolfTimer = 0;
  run.wolvesSpawned = saved?.wolvesSpawned ?? 0;
  run.chapter2Started = false;
  run.commander = null;
  run.commanderDefeated = false;
  run.consoleUsed = false;
  run.inSanctum = false;
  run.doppel = null;
  run.takenWorldItems = saved?.takenWorldItems ?? [];

  applyCameraMode();
  player.reset(facility.spawnPoint);
  if (saved) {
    player.hp = saved.hp;
    player.maxHp = saved.maxHp;
    player.hunger = saved.hunger;
    player.level = saved.level;
    player.exp = saved.exp;
    player.expToNext = saved.expToNext;
    player.attackDamage = saved.attackDamage;
    player.armorMul = saved.armorMul ?? 1;
    player.armorMesh.visible = player.armorMul < 1;
    player.hasFlashlight = saved.hasFlashlight ?? false;
    player.inventory = saved.inventory.map((i) => ({ ...i }));
    player.mesh.position.set(saved.x, 0, saved.z);
    // the keycard is consumed on use, so the gate must come back already open
    if (saved.gateUnlocked) facility.unlockGate();
  }
  // flashlight always loads OFF (reset() already cleared it) even if it was on
  // when saved -- the light node itself needs to match, since reset() only
  // touches the player-side flag.
  flashlight.visible = false;
  flashlightBulb.visible = false;
  lastPlayerHp = player.hp; // avoid a phantom "hurt" sfx from a stale pre-reset reading

  game.scene.fog.color.setHex(0x243420);
  game.scene.fog.density = 0.03;

  spawnWorldItems();
  for (let i = 0; i < 4; i++) spawnDeer();
  for (let i = 0; i < 2; i++) spawnWolf();
  // 카드를 이미 쓴 적(문이 열려 있음) 또는 이미 갖고 있으면 다시 세우지 않는다
  // -- 저장을 불러왔을 뿐인데 의미 없는 재대결을 강제하지 않기 위해서.
  if (!facility.gateDoor.open && !player.hasItem('keycard')) spawnGatekeeper();
  if (run.ngPlus) spawnHiddenBosses();

  hud.hideBoss();
  hud.setObjective('숲을 헤매며 출구를 찾기');
  hud.setHudVisible(true);
  hud.hideOverlay();
  run.mode = 'playing';
  // A loaded save drops you back mid-story; replaying the opening would be noise.
  if (!saved) dialogue.say(run.ngPlus ? SCRIPT.introNgPlus : SCRIPT.intro);
  else requestLook();
}

function finishRun() {
  const secret =
    run.ngPlus && player.countOf('strange-material') >= MATERIALS_FOR_SECRET;
  run.mode = 'ending';
  hud.setHudVisible(false);
  hud.hideBoss();
  releasePointer();
  SaveSystem.clear();

  if (secret) {
    SaveSystem.recordClear('secret');
    hud.showOverlay(
      '??? 엔딩 — 새 사령관',
      '문 앞에서, 세 개의 재료가 한 박자로 뛰기 시작했다.<br />' +
        '실패작들의 조각을 몸에 새기자 갑주가 스스로 맞물린다.<br />' +
        '출구 너머로 나간 것은 도망친 실험체가 아니라,<br />' +
        '다음 실험체를 맞이할 <b>새로운 사령관</b>이었다.',
      'Enter — 처음으로',
      { tone: 'bad' }
    );
  } else {
    SaveSystem.recordClear('normal');
    hud.showOverlay(
      '노멀 엔딩 — 탈출',
      'project 0003을 쓰러뜨리고 문을 열었다.<br />' +
        '복도 끝에서, 캐노피가 아닌 진짜 하늘이 처음으로 보인다.<br />' +
        '무슨 실험이었는지는 끝내 알 수 없었다.',
      'Enter — 처음으로',
      { tone: 'good' }
    );
  }
}

// 진 엔딩 루트: 아레나 출구에서 "???" 구역으로 옮겨간다. 걸어서 이어지는
// 공간이 아니라, 조건을 채운 순간 장면이 전환된다.
function enterSanctum() {
  run.inSanctum = true;
  run.chapter = 3;
  clearCombatActors(); // 남은 과학자·시체 정리
  player.mesh.position.copy(facility.sanctumEntrance);
  player.facingAngle = 0;
  player.pitch = 0;
  player.hp = player.maxHp; // 마지막 싸움은 온전한 상태에서 시작
  hud.setObjective('');
  hud.hideBoss();
  facility.showHe();
  game.scene.fog.color.setHex(0x040406);
  game.scene.fog.density = 0.04;
  audio.setMusicState('dark'); // "the forest of dark" -- 기획서 6번, "???" 진입

  dialogue.say(SCRIPT.sanctumArrival, () => {
    audio.setMusicState('him'); // "him" -- 기획서 6번, encountering "he"
    dialogue.say(SCRIPT.heMeeting, () => {
      facility.hideHe();
      const you = new Doppelganger(facility, facility.sanctumCenter.clone().setZ(facility.sanctumCenter.z + 3));
      you.onEnrage = () => dialogue.say(SCRIPT.doppelEnrage);
      run.doppel = addEnemy(you);
      dialogue.say(SCRIPT.doppelAppear);
      hud.setObjective('나를 넘어선다');
      audio.playSfx('bossAppear');
    });
  });
}

function trueEnding() {
  run.mode = 'ending';
  hud.setHudVisible(false);
  hud.hideBoss();
  releasePointer();
  SaveSystem.clear();
  SaveSystem.recordClear('true');
  hud.showOverlay(
    '진 엔딩 — 진실',
    '마지막 조각이 회수되고, 실험이 끝났다.<br />' +
      '늑대도 사령관도, 전부 한 사람에게서 떠낸 파편이었다. 나 자신에게서.<br />' +
      '그는 문을 가리켰다. 처음부터 잠겨 있지 않았던 문을.<br />' +
      '무엇을 위한 실험이었는지, 이제는 안다.',
    'Enter — 처음으로',
    { tone: 'good' }
  );
}

function die() {
  run.mode = 'dead';
  hud.hideBoss();
  releasePointer();
  hud.showOverlay(
    '사망',
    '허기와 위협 속에서 쓰러졌다.',
    SaveSystem.hasSave() ? 'Enter — 마지막 기록에서 다시' : 'Enter — 처음부터 다시',
    { tone: 'bad' }
  );
}

// ------------------------------------------------------------- save / load

function saveGame() {
  // The 진 엔딩 chamber has no save point and rebuilding it from a save isn't
  // supported -- a save made here would strand the player in an empty room.
  if (run.inSanctum) return false;
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
    armorMul: player.armorMul,
    hasFlashlight: player.hasFlashlight,
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

let menuScreen = 'root'; // root | settings

function showTitle() {
  run.mode = 'title';
  audio.setMusicState('peace'); // "the forest of peace" -- 기획서 6번, start game
  menuScreen = 'root';
  hud.setHudVisible(false);
  try {
    document.exitPointerLock?.();
  } catch {
    /* ignore */
  }
  menuIndex = 0;
  menuItems = [
    { id: 'new', label: '새 게임' },
    { id: 'continue', label: '이어하기', disabled: !SaveSystem.hasSave() },
    { id: 'settings', label: '설정' },
  ];
  const cleared = SaveSystem.clearCount;
  drawMenu(
    '시설 생존기',
    cleared > 0 ? `클리어 ${cleared}회 · 2회차에서는 무언가 달라진다` : '낯선 방에서 눈을 떴다...'
  );
}

const SENS_LABEL = { low: '낮음', normal: '보통', high: '높음' };

function settingsItems() {
  const s = SaveSystem.settings;
  return [
    { id: 'cameraMode', label: `시점:  ${s.cameraMode === 'third' ? '3인칭' : '1인칭'}` },
    { id: 'sensitivity', label: `마우스 감도:  ${SENS_LABEL[s.sensitivity] ?? '보통'}` },
    { id: 'invertY', label: `Y축 반전:  ${s.invertY ? '켬' : '끔'}` },
    { id: 'soundOn', label: `소리:  ${s.soundOn ? '켬' : '끔'}` },
    { id: 'back', label: '← 돌아가기' },
  ];
}

function showSettingsMenu() {
  menuScreen = 'settings';
  menuIndex = 0;
  menuItems = settingsItems();
  drawMenu('설정', '↑↓ 이동 · ←→ / Enter 변경 · Shift 닫기');
}

// Each option just steps through its allowed values.
function cycleSetting(id) {
  const s = SaveSystem.settings;
  if (id === 'cameraMode') {
    SaveSystem.setSetting('cameraMode', s.cameraMode === 'third' ? 'first' : 'third');
  } else if (id === 'sensitivity') {
    const order = ['low', 'normal', 'high'];
    const next = order[(order.indexOf(s.sensitivity) + 1) % order.length];
    SaveSystem.setSetting('sensitivity', next);
  } else if (id === 'invertY') {
    SaveSystem.setSetting('invertY', !s.invertY);
  } else if (id === 'soundOn') {
    SaveSystem.setSetting('soundOn', !s.soundOn);
  }
  settings = SaveSystem.settings;
  applyCameraMode();
  audio.setEnabled(settings.soundOn);
  menuItems = settingsItems();
  drawMenu();
}

function drawMenu(title = menuTitle, subtitle = menuSubtitle) {
  menuTitle = title;
  menuSubtitle = subtitle;
  hud.showMenu(title, menuItems, menuIndex, subtitle);
}

function showPauseMenu() {
  run.mode = 'paused';
  menuScreen = 'root';
  try {
    document.exitPointerLock?.();
  } catch {
    /* ignore */
  }
  menuIndex = 0;
  menuItems = [
    { id: 'resume', label: '계속하기' },
    { id: 'settings', label: '설정' },
    { id: 'save', label: '저장하기', disabled: run.inSanctum },
    { id: 'load', label: '불러오기', disabled: !SaveSystem.hasSave() },
    { id: 'title', label: '저장하고 처음으로' },
  ];
  drawMenu('일시정지', 'Shift — 닫기');
}

function closeMenuToPlay() {
  run.mode = 'playing';
  hud.hideOverlay();
  hud.setHudVisible(true);
  if (!dialogue.active) requestLook();
}

function menuConfirm() {
  const item = menuItems[menuIndex];
  if (!item || item.disabled) return;

  if (menuScreen === 'settings') {
    if (item.id === 'back') {
      if (run.mode === 'paused') showPauseMenu();
      else showTitle();
    } else {
      cycleSetting(item.id);
    }
    return;
  }

  switch (item.id) {
    case 'new':
      SaveSystem.clear();
      newRun();
      break;
    case 'continue':
      if (!loadGame()) showTitle();
      break;
    case 'settings':
      showSettingsMenu();
      break;
    case 'resume':
      closeMenuToPlay();
      break;
    case 'save':
      if (saveGame()) {
        const loadItem = menuItems.find((m) => m.id === 'load');
        if (loadItem) loadItem.disabled = false;
        drawMenu('일시정지', '기록했습니다. Shift — 닫기');
        audio.playSfx('save');
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
    audio.playSfx('menuMove');
  }
  if (input.wasJustPressed('ArrowDown') || input.wasJustPressed('KeyS')) {
    menuIndex = (menuIndex + 1) % menuItems.length;
    drawMenu();
    audio.playSfx('menuMove');
  }
  // ←→ cycles the focused option on the settings screen
  if (
    menuScreen === 'settings' &&
    menuItems[menuIndex] &&
    menuItems[menuIndex].id !== 'back' &&
    (input.wasJustPressed('ArrowLeft') || input.wasJustPressed('KeyA') ||
      input.wasJustPressed('ArrowRight') || input.wasJustPressed('KeyD'))
  ) {
    cycleSetting(menuItems[menuIndex].id);
    audio.playSfx('menuMove');
  }
  if (input.confirmPressed) {
    audio.playSfx('menuConfirm');
    menuConfirm();
  }
  if (input.cancelPressed) {
    if (menuScreen === 'settings') {
      if (run.mode === 'paused') showPauseMenu();
      else showTitle();
    } else if (run.mode === 'paused') {
      closeMenuToPlay();
    }
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
  audio.playSfx('eat');
}

// 응급 키트: food와 달리 인벤토리에 쌓아두고, 필요할 때 직접 쓴다 (허기가 아니라
// HP를 즉시 채우므로 배가 불러도 의미가 있다).
function tryUseMedkit() {
  if (!player.hasItem('medkit')) {
    hud.log('사용할 응급 키트가 없다.');
    return;
  }
  if (player.hp >= player.maxHp) {
    hud.log('이미 체력이 가득하다.');
    return;
  }
  const def = ITEMS.medkit;
  player.consumeItem('medkit', 1);
  player.hp = Math.min(player.maxHp, player.hp + def.healHp);
  hud.log(`${def.name}을(를) 사용했다. (HP +${def.healHp})`);
  audio.playSfx('heal');
}

// Boost/equip 아이템은 줍는 순간 곧바로 적용된다 -- 장비 관리 화면이 없는
// 게임이라, "강해져야 한다"(boost)도 "장비"(equip)도 가장 마찰 없는 형태로
// 구현한 것. 차이는 boost는 수치만 남고, equip은 player에 상태로 남아
// (armorMul/hasFlashlight) HUD에 계속 표시되고 손전등은 L로 다시 켜고 끌 수
// 있다는 것.
function consumeInstantItems() {
  for (const entry of [...player.inventory]) {
    const def = ITEMS[entry.id];
    if (def?.kind === 'boost') {
      for (let i = 0; i < entry.count; i++) player.applyBoost(def);
      player.consumeItem(entry.id, entry.count);
      hud.log(`${def.name}을(를) 주입했다. 몸이 뜨거워진다. (공격력 +${def.attack})`);
    } else if (def?.kind === 'equip') {
      player.equip(def);
      player.consumeItem(entry.id, entry.count);
      hud.log(`${def.name}을(를) 장착했다.`);
      audio.playSfx('equip');
    }
  }
}

// --------------------------------------------------------------- camera

// The camera has two modes (기획서 밖의 요청: 1인칭 기본, 설정에서 전환).
//
// First-person: the camera sits at eye height and its yaw/pitch ARE the mouse
// look. player.facingAngle is the yaw, so movement and view can't disagree.
// rotation.y = facingAngle + PI because the camera looks down its local -Z,
// while the player's forward is +Z-at-angle.
//
// Third-person: a chase cam parked behind the player along the same yaw, so the
// mouse still turns you; pitch raises/lowers the eye.
const EYE = new THREE.Vector3(0, 1.62, 0);
const TP_DIST = 6;
const TP_HEIGHT = 3.4;

function applyCameraMode() {
  const fp = settings.cameraMode !== 'third';
  viewmodel.visible = fp;
  player.mesh.visible = !fp;
}

function updateCamera(dt) {
  const eye = player.mesh.position.clone().add(EYE);
  if (settings.cameraMode === 'third') {
    const behind = new THREE.Vector3(
      -Math.sin(player.facingAngle) * TP_DIST,
      TP_HEIGHT + player.pitch * 3,
      -Math.cos(player.facingAngle) * TP_DIST
    );
    const desired = player.mesh.position.clone().add(EYE).add(behind);
    game.camera.position.lerp(desired, Math.min(1, dt * 8));
    game.camera.lookAt(eye);
  } else {
    game.camera.position.copy(eye);
    game.camera.rotation.set(player.pitch, player.facingAngle + Math.PI, 0, 'YXZ');
  }
}
applyCameraMode();
updateCamera(1);

// Bob the viewmodel with the swing.
function updateViewmodel() {
  const s = player.swingT;
  viewmodel.rotation.x = -s * 1.4;
  viewmodel.position.z = -0.55 + s * 0.12;
}

// --------------------------------------------------------- pointer lock

const PITCH_LIMIT = 1.45;

function requestLook() {
  try {
    canvas.requestPointerLock?.();
  } catch {
    /* not fatal -- the game still plays, the view just won't turn */
  }
}

function releasePointer() {
  try {
    document.exitPointerLock?.();
  } catch {
    /* ignore */
  }
}

canvas.addEventListener('click', () => {
  if (run.mode === 'playing' && !dialogue.active) requestLook();
});

document.addEventListener('pointerlockchange', () => {
  // Losing the lock mid-fight (usually the player hit Esc) drops us into the
  // pause menu -- Esc is also the pause key, so this just keeps them in sync.
  if (!document.pointerLockElement && run.mode === 'playing' && !dialogue.active) {
    showPauseMenu();
  }
});

// Turn accumulated pointer motion into yaw/pitch. Called only while actually
// playing so a cutscene or menu doesn't bank up a lurch.
function applyMouseLook() {
  const look = input.consumeLook();
  if (!look.dx && !look.dy) return;
  const speed = SaveSystem.lookSpeed;
  player.facingAngle += look.dx * speed;
  const dir = settings.invertY ? -1 : 1;
  player.pitch = THREE.MathUtils.clamp(
    player.pitch - look.dy * speed * dir,
    -PITCH_LIMIT,
    PITCH_LIMIT
  );
}

// ------------------------------------------------------------- main loop

const mainLoop = {
  update(dt) {
    switch (run.mode) {
      case 'title':
        handleMenuInput();
        break;

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

  // Dialogue is a cutscene: hold the world so a story beat can't be interrupted
  // by a wolf, and so Enter unambiguously means "next line".
  if (dialogue.active) {
    input.consumeLook(); // don't let pointer motion bank up behind a cutscene
    dialogue.update(input);
    if (dialogue.active) {
      const line = dialogue.current;
      hud.showDialogue(line.speaker, line.text);
    } else {
      hud.hideDialogue();
    }
    updateCamera(dt);
    hud.update(dt, player);
    return;
  }

  if (input.pausePressed || input.cancelPressed) {
    showPauseMenu();
    return;
  }
  if (input.eatPressed) tryEat();
  if (input.usePressed) tryUseMedkit();
  if (input.flashlightPressed) toggleFlashlight();

  // Cheat code: type 0209 to fill HP to 999 instantly. maxHp goes with it --
  // otherwise the next regen tick (Player.update clamps hp to maxHp) would
  // snap it straight back down to 100.
  if (input.consumeDigitSequence('0209')) {
    player.maxHp = 999;
    player.hp = 999;
    hud.log('치트 입력: HP 999.');
    audio.playSfx('levelUp');
  }

  applyMouseLook();
  player.update(dt, input);
  combat.update(dt);
  interaction.update(dt, input);
  consumeInstantItems();

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

  if (player.hp < lastPlayerHp) audio.playSfx('hurt');
  lastPlayerHp = player.hp;

  // chapter 2 begins the moment the player steps past the unlocked gate
  if (!run.chapter2Started && facility.gateDoor.open) {
    const area = facility.areaAt(player.position.x, player.position.z);
    if (area === 'arena' || area === 'corr3') startChapter2();
  }

  updateBossBar();

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

  // Nudge the player to grab the pointer if the view isn't responding yet.
  if (interaction.promptText) {
    hud.setPrompt(interaction.promptText);
  } else if (!input.pointerLocked) {
    hud.setPrompt('클릭하면 마우스로 주위를 둘러본다', { bare: true });
  } else {
    hud.setPrompt(null);
  }
  if (run.ngPlus && run.commanderDefeated && !run.inSanctum) {
    const mats = player.countOf('strange-material');
    const intel = player.countOf('facility-file');
    if (intel >= INTEL_FOR_TRUE) {
      hud.setObjective('원본 보관고로 내려가는 길이 열렸다');
    } else if (mats >= MATERIALS_FOR_SECRET) {
      hud.setObjective('재료를 모두 모았다. 문으로 나가기');
    } else {
      hud.setObjective(`아레나 끝의 문으로 (재료 ${mats}/${MATERIALS_FOR_SECRET})`);
    }
  }
  updateViewmodel();
  updateCamera(dt);
  hud.update(dt, player);
}

game.add(facility);
game.add(mainLoop);
game.start();
showTitle();
