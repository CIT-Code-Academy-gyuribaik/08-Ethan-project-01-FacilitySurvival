import * as THREE from 'three';
import { wallTexture, floorTexture, ceilingTexture, metalTexture } from './Textures.js';
import { ROOMS, CORRIDORS, PROPS, LIGHTS, PALETTE, WALL_HEIGHT, OVERLAP } from './LevelData.js';

// How many of the ceiling fluorescents are lit at once (nearest to the player).
const LIGHT_BUDGET = 8;

// Builds the whole level from LevelData and answers collision queries.
//
// Collision model: the walkable area is the union of every room/corridor rect,
// minus a list of blocker rects (props, the locked gate). It's not a navmesh,
// but with rects that overlap at the seams it handles the branching layout fine
// and both the player and the creature AI share it, so nothing can clip through.
export class Facility {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.areas = new Map(); // id -> { minX, maxX, minZ, maxZ, kind, chapter }
    this.blockers = []; // { minX, maxX, minZ, maxZ, id? }
    this.flickerLights = [];
    this.viewer = null; // set by main.js to the player position, for light culling
    this._t = 0;

    this.wallTex = wallTexture();
    this.floorTex = floorTexture();
    this.ceilTex = ceilingTexture();
    this.metalTex = metalTexture();

    for (const room of ROOMS) this._buildRoom(room);
    for (const corr of CORRIDORS) this._buildCorridor(corr);
    this._buildProps();
    this._buildCabinDressing();
    this._buildLabDressing();
    this._buildGateDoor();
    this._buildEscapeDoor();
    this._buildLights();

    this.spawnPoint = new THREE.Vector3(0, 0, -3);
  }

  // ---- geometry helpers -------------------------------------------------

  _floorAndCeiling(minX, maxX, minZ, maxZ, kind) {
    const pal = PALETTE[kind] ?? PALETTE.facility;
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: this.floorTex, color: pal.floor, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    this.group.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: this.ceilTex, roughness: 1 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, WALL_HEIGHT, cz);
    this.group.add(ceil);
  }

  _wall(x, z, w, d, color) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, WALL_HEIGHT, d),
      new THREE.MeshStandardMaterial({ map: this.wallTex, color, roughness: 0.9 })
    );
    mesh.position.set(x, WALL_HEIGHT / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  // Walls around a rect, skipping the doorway gaps.
  _perimeterWithGaps(minX, maxX, minZ, maxZ, color, gaps = []) {
    const t = 0.3;
    const segsFor = (side, lo, hi) => {
      const sideGaps = gaps.filter((g) => g.side === side).sort((a, b) => a.from - b.from);
      const segs = [];
      let cursor = lo;
      for (const g of sideGaps) {
        if (g.from > cursor) segs.push([cursor, g.from]);
        cursor = Math.max(cursor, g.to);
      }
      if (cursor < hi) segs.push([cursor, hi]);
      return segs;
    };
    for (const [a, b] of segsFor('north', minX, maxX)) this._wall((a + b) / 2, minZ, b - a, t, color);
    for (const [a, b] of segsFor('south', minX, maxX)) this._wall((a + b) / 2, maxZ, b - a, t, color);
    for (const [a, b] of segsFor('west', minZ, maxZ)) this._wall(minX, (a + b) / 2, t, b - a, color);
    for (const [a, b] of segsFor('east', minZ, maxZ)) this._wall(maxX, (a + b) / 2, t, b - a, color);
  }

  // ---- level construction ------------------------------------------------

  _buildRoom(room) {
    const { id, minX, maxX, minZ, maxZ, kind, gaps, chapter } = room;
    this.areas.set(id, { minX, maxX, minZ, maxZ, kind, chapter });
    this._floorAndCeiling(minX, maxX, minZ, maxZ, kind);
    this._perimeterWithGaps(minX, maxX, minZ, maxZ, PALETTE[kind].wall, gaps);
  }

  // A corridor's visual body spans exactly the gap between two rooms, but its
  // walkable rect is grown at both ends so it merges with them (see LevelData).
  _buildCorridor(corr) {
    const { id, axis, from, to, kind, chapter } = corr;
    const pal = PALETTE[kind];
    let rect;
    if (axis === 'z') {
      this._floorAndCeiling(corr.minX, corr.maxX, from, to, kind);
      this._wall(corr.minX, (from + to) / 2, 0.3, to - from, pal.wall);
      this._wall(corr.maxX, (from + to) / 2, 0.3, to - from, pal.wall);
      rect = { minX: corr.minX, maxX: corr.maxX, minZ: from - OVERLAP, maxZ: to + OVERLAP };
    } else {
      this._floorAndCeiling(from, to, corr.minZ, corr.maxZ, kind);
      this._wall((from + to) / 2, corr.minZ, to - from, 0.3, pal.wall);
      this._wall((from + to) / 2, corr.maxZ, to - from, 0.3, pal.wall);
      rect = { minX: from - OVERLAP, maxX: to + OVERLAP, minZ: corr.minZ, maxZ: corr.maxZ };
    }
    this.areas.set(id, { ...rect, kind, chapter });
  }

  _buildProps() {
    const mats = {
      crate: new THREE.MeshStandardMaterial({ color: 0x9c7f4e, roughness: 1 }),
      pillar: new THREE.MeshStandardMaterial({ map: this.wallTex, color: 0xa89550, roughness: 1 }),
      shelf: new THREE.MeshStandardMaterial({ color: 0x6e6252, roughness: 1 }),
      table: new THREE.MeshStandardMaterial({ map: this.metalTex, roughness: 0.6, metalness: 0.3 }),
    };
    for (const p of PROPS) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), mats[p.kind]);
      mesh.position.set(p.x, p.h / 2, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.blockers.push({
        minX: p.x - p.w / 2, maxX: p.x + p.w / 2,
        minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2,
      });
    }
  }

  _buildCabinDressing() {
    // The bed the player wakes up on. Doubles as the save point (기획서 10번).
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.4, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 })
    );
    frame.position.set(-2.6, 0.2, -3.4);
    frame.castShadow = true;
    this.group.add(frame);
    const sheet = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x8fa2b8, roughness: 1 })
    );
    sheet.position.set(-2.6, 0.5, -3.4);
    this.group.add(sheet);
    this.blockers.push({ minX: -3.7, maxX: -1.5, minZ: -4.05, maxZ: -2.75 });
    this.bedPosition = new THREE.Vector3(-2.6, 0, -2.2);
  }

  _buildLabDressing() {
    // Glowing specimen tanks -- makes the lab read as "where the experiment happened".
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x66ddbb, emissive: 0x1b5c4a, transparent: true, opacity: 0.45, roughness: 0.2,
    });
    for (const [x, z] of [[21.5, 24], [27, 17.5], [30, 30]]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 14), glassMat);
      tank.position.set(x, 1.2, z);
      this.group.add(tank);
      const glow = new THREE.PointLight(0x55ffcc, 0.6, 7, 2);
      glow.position.set(x, 1.6, z);
      this.group.add(glow);
      this.blockers.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
    }
  }

  // The locked door between chapter 1 and chapter 2. Blocks movement until the
  // keycard is used, at which point the blocker is dropped and the slab slides up.
  _buildGateDoor() {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 3.6, 0.4),
      new THREE.MeshStandardMaterial({
        map: this.metalTex, color: 0xb04a3a, roughness: 0.5, metalness: 0.4,
        emissive: 0x330000,
      })
    );
    mesh.position.set(0, 1.8, 56);
    mesh.castShadow = true;
    this.group.add(mesh);

    const lamp = new THREE.PointLight(0xff3322, 1.4, 9, 2);
    lamp.position.set(0, 3.2, 55);
    this.group.add(lamp);

    this.gateDoor = { mesh, lamp, open: false, _t: 0 };
    this.gateBlocker = { minX: -1.7, maxX: 1.7, minZ: 55.6, maxZ: 56.4, id: 'gate-door' };
    this.blockers.push(this.gateBlocker);
    this.gatePosition = new THREE.Vector3(0, 0, 54.6);
  }

  // The way out, at the far end of the arena. Only becomes usable once the
  // commander is down -- that's the normal ending (기획서 12번).
  _buildEscapeDoor() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x224433, emissive: 0x061a10, roughness: 0.6,
    });
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.8, 0.4), mat);
    door.position.set(0, 1.9, 91.7);
    this.group.add(door);
    this.escapeDoor = { mesh: door, material: mat };
    this.escapePosition = new THREE.Vector3(0, 0, 90.2);
    this.exitPosition = this.escapePosition; // kept for older call sites
  }

  _buildLights() {
    for (const [x, z, base] of LIGHTS) {
      const light = new THREE.PointLight(0xfff3c4, base, 16, 2);
      light.position.set(x, 3.5, z);
      light.visible = false;
      this.group.add(light);
      this.flickerLights.push({ light, phase: Math.random() * 10, base });
    }
    this._lightCullTimer = 0;
  }

  // Every fluorescent lit at once is ~20 point lights in one MeshStandardMaterial
  // shader, which is needlessly expensive for a level you only ever see one room
  // of. Keep a FIXED budget of the nearest few: fixed, because Three recompiles
  // materials whenever the visible light count changes, and a count that flickers
  // with the player's position would stutter far worse than the lights cost.
  _cullLights(dt) {
    if (!this.viewer) return;
    this._lightCullTimer -= dt;
    if (this._lightCullTimer > 0) return;
    this._lightCullTimer = 0.25;

    const budget = Math.min(LIGHT_BUDGET, this.flickerLights.length);
    const ranked = this.flickerLights
      .map((f) => ({ f, d: f.light.position.distanceToSquared(this.viewer) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < ranked.length; i++) ranked[i].f.light.visible = i < budget;
  }

  // ---- runtime ----------------------------------------------------------

  unlockGate() {
    if (this.gateDoor.open) return;
    this.gateDoor.open = true;
    this.blockers = this.blockers.filter((b) => b !== this.gateBlocker);
    this.gateDoor.lamp.color.setHex(0x33ff66);
  }

  // The level persists across runs (rebuilding it every restart would be
  // wasteful), so anything a run mutates has to be put back here. Missing this
  // is how a fresh game starts with the gate already open -- or worse, how a
  // loaded save finds it shut with the keycard already spent.
  resetDoors() {
    this.gateDoor.open = false;
    this.gateDoor.mesh.position.y = 1.8;
    this.gateDoor.lamp.color.setHex(0xff3322);
    if (!this.blockers.includes(this.gateBlocker)) this.blockers.push(this.gateBlocker);

    this.escapeDoor.material.emissive.setHex(0x061a10);
    if (this.escapeLight) {
      this.group.remove(this.escapeLight);
      this.escapeLight = null;
    }
  }

  markEscapeReady() {
    this.escapeDoor.material.emissive.setHex(0x22aa55);
    if (!this.escapeLight) {
      this.escapeLight = new THREE.PointLight(0x44ffaa, 2, 14, 2);
      this.escapeLight.position.set(0, 2.4, 90);
      this.group.add(this.escapeLight);
    }
  }

  update(dt) {
    this._t += dt;
    this._cullLights(dt);
    for (const f of this.flickerLights) {
      if (!f.light.visible) continue;
      const flicker =
        Math.sin(this._t * 9 + f.phase) * 0.15 + Math.sin(this._t * 27 + f.phase) * 0.1;
      f.light.intensity = Math.max(0.15, f.base + flicker + (Math.random() < 0.01 ? -0.8 : 0));
    }
    // slide the unlocked gate up into the ceiling
    const g = this.gateDoor;
    if (g.open && g.mesh.position.y < 5.2) {
      g.mesh.position.y = Math.min(5.2, g.mesh.position.y + dt * 1.6);
    }
  }

  // ---- collision ---------------------------------------------------------

  isWalkable(x, z, margin = 0.4) {
    let inside = false;
    for (const a of this.areas.values()) {
      if (x > a.minX + margin && x < a.maxX - margin && z > a.minZ + margin && z < a.maxZ - margin) {
        inside = true;
        break;
      }
    }
    if (!inside) return false;
    for (const b of this.blockers) {
      if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) {
        return false;
      }
    }
    return true;
  }

  // Slides along a wall instead of stopping dead when only one axis is blocked.
  resolveMove(x, z, dx, dz, margin = 0.4) {
    const nx = x + dx;
    const nz = z + dz;
    if (this.isWalkable(nx, nz, margin)) return { x: nx, z: nz };
    if (this.isWalkable(nx, z, margin)) return { x: nx, z };
    if (this.isWalkable(x, nz, margin)) return { x, z: nz };
    return { x, z };
  }

  areaAt(x, z) {
    for (const [id, a] of this.areas) {
      if (x > a.minX && x < a.maxX && z > a.minZ && z < a.maxZ) return id;
    }
    return null;
  }

  randomPointIn(id, tries = 30) {
    const a = this.areas.get(id);
    if (!a) return new THREE.Vector3();
    for (let i = 0; i < tries; i++) {
      const x = THREE.MathUtils.randFloat(a.minX + 2, a.maxX - 2);
      const z = THREE.MathUtils.randFloat(a.minZ + 2, a.maxZ - 2);
      if (this.isWalkable(x, z, 0.8)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3((a.minX + a.maxX) / 2, 0, (a.minZ + a.maxZ) / 2);
  }

  randomPointInHall() {
    return this.randomPointIn('hall');
  }

  // Somewhere in chapter 1 that isn't right on top of the player.
  randomHuntingGround(awayFrom, minDist = 12) {
    const pools = ['hall', 'hall', 'storage', 'lab'];
    for (let i = 0; i < 20; i++) {
      const p = this.randomPointIn(pools[Math.floor(Math.random() * pools.length)]);
      if (!awayFrom || p.distanceTo(awayFrom) > minDist) return p;
    }
    return this.randomPointIn('hall');
  }
}
