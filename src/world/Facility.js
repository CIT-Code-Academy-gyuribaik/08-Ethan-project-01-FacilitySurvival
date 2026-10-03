import * as THREE from 'three';
import {
  wallTexture, floorTexture, ceilingTexture, woodTexture, metalTexture,
  facilityWallTexture, facilityFloorTexture, facilityCeilingTexture,
} from './Textures.js';
import { ROOMS, CORRIDORS, PROPS, LIGHTS, PALETTE, WALL_HEIGHT, OVERLAP } from './LevelData.js';

// How many of the canopy lanterns are lit at once (nearest to the player).
const LIGHT_BUDGET = 8;

// Blanket brightness multiplier on every lantern's base intensity, applied
// once at build time. Bumped up so the facility reads less like a cave --
// LevelData.LIGHTS keeps its per-fixture relative values, this just scales all
// of them together.
const LIGHT_BRIGHTNESS_MUL = 1.5;

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
    this.woodTex = woodTexture();
    // chapter-2 only ("진짜" 시설 -- 1장의 숲은 착시였다는 반전 지점)
    this.metalTex = metalTexture();
    this.facWallTex = facilityWallTexture();
    this.facFloorTex = facilityFloorTexture();
    this.facCeilTex = facilityCeilingTexture();

    for (const room of ROOMS) this._buildRoom(room);
    for (const corr of CORRIDORS) this._buildCorridor(corr);
    this._buildProps();
    this._buildCorridorVines();
    this._buildCabinDressing();
    this._buildLabDressing();
    this._buildVaultDressing();
    this._buildArenaDressing();
    this._buildGateDoor();
    this._buildEscapeDoor();
    this._buildSanctum();
    this._buildLights();

    this.spawnPoint = new THREE.Vector3(0, 0, -3);
  }

  // ---- geometry helpers -------------------------------------------------

  // chapter param picks the texture set: chapter 2 (arena + corr3) is the
  // reveal -- everywhere else stays forest. See LevelData.js's "리스킨 3차" note.
  _floorAndCeiling(minX, maxX, minZ, maxZ, kind, chapter) {
    const pal = PALETTE[kind] ?? PALETTE.facility;
    const facility = chapter === 2;
    const w = maxX - minX;
    const d = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({
        map: facility ? this.facFloorTex : this.floorTex, color: pal.floor, roughness: 0.95,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    this.group.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({
        map: facility ? this.facCeilTex : this.ceilTex, color: pal.wall, roughness: 1,
      })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, WALL_HEIGHT, cz);
    this.group.add(ceil);
  }

  // A "wall" is a short stretch of treeline everywhere except chapter 2 (the
  // reveal), where it's a plain concrete slab -- see LevelData.js's "리스킨
  // 3차" note. Treeline: a low hedge strip (keeps a continuous silhouette so
  // gaps between trunks don't read as holes) plus a few trunks with a canopy
  // clump each, spaced along whichever axis is the segment's long one. w/d
  // keep meaning exactly what they meant for the old box wall (thin along one
  // axis, long along the other), so every caller in
  // _perimeterWithGaps/_buildCorridor works unchanged regardless of chapter.
  _wall(x, z, w, d, color, chapter) {
    if (chapter === 2) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, WALL_HEIGHT, d),
        new THREE.MeshStandardMaterial({ map: this.facWallTex, color, roughness: 0.9 })
      );
      mesh.position.set(x, WALL_HEIGHT / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    }

    const group = new THREE.Group();
    const horizontal = w >= d;
    const length = Math.max(w, d);

    const hedge = new THREE.Mesh(
      new THREE.BoxGeometry(w, 1.1, d),
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    );
    hedge.position.y = 0.55;
    hedge.receiveShadow = true;
    group.add(hedge);

    const trunkMat = new THREE.MeshStandardMaterial({ map: this.wallTex, color: 0x5c4630, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    const count = Math.max(1, Math.round(length / 2.4));
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const h = WALL_HEIGHT + 1 + Math.random() * 1.5;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16 + Math.random() * 0.1, 0.24, h, 7),
        trunkMat
      );
      trunk.position.y = h / 2;
      if (horizontal) trunk.position.x = t * length;
      else trunk.position.z = t * length;
      trunk.rotation.y = Math.random() * Math.PI;
      trunk.castShadow = true;
      group.add(trunk);

      const canopy = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.8 + Math.random() * 0.5, 0),
        leafMat
      );
      canopy.position.copy(trunk.position);
      canopy.position.y = WALL_HEIGHT + 0.4;
      canopy.castShadow = true;
      group.add(canopy);
    }

    group.position.set(x, 0, z);
    this.group.add(group);
    return group;
  }

  // Walls around a rect, skipping the doorway gaps.
  _perimeterWithGaps(minX, maxX, minZ, maxZ, color, gaps = [], chapter) {
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
    for (const [a, b] of segsFor('north', minX, maxX)) this._wall((a + b) / 2, minZ, b - a, t, color, chapter);
    for (const [a, b] of segsFor('south', minX, maxX)) this._wall((a + b) / 2, maxZ, b - a, t, color, chapter);
    for (const [a, b] of segsFor('west', minZ, maxZ)) this._wall(minX, (a + b) / 2, t, b - a, color, chapter);
    for (const [a, b] of segsFor('east', minZ, maxZ)) this._wall(maxX, (a + b) / 2, t, b - a, color, chapter);
  }

  // ---- level construction ------------------------------------------------

  _buildRoom(room) {
    const { id, minX, maxX, minZ, maxZ, kind, gaps, chapter } = room;
    this.areas.set(id, { minX, maxX, minZ, maxZ, kind, chapter });
    this._floorAndCeiling(minX, maxX, minZ, maxZ, kind, chapter);
    this._perimeterWithGaps(minX, maxX, minZ, maxZ, PALETTE[kind].wall, gaps, chapter);
  }

  // A corridor's visual body spans exactly the gap between two rooms, but its
  // walkable rect is grown at both ends so it merges with them (see LevelData).
  _buildCorridor(corr) {
    const { id, axis, from, to, kind, chapter } = corr;
    const pal = PALETTE[kind];
    let rect;
    if (axis === 'z') {
      this._floorAndCeiling(corr.minX, corr.maxX, from, to, kind, chapter);
      this._wall(corr.minX, (from + to) / 2, 0.3, to - from, pal.wall, chapter);
      this._wall(corr.maxX, (from + to) / 2, 0.3, to - from, pal.wall, chapter);
      rect = { minX: corr.minX, maxX: corr.maxX, minZ: from - OVERLAP, maxZ: to + OVERLAP };
    } else {
      this._floorAndCeiling(from, to, corr.minZ, corr.maxZ, kind, chapter);
      this._wall((from + to) / 2, corr.minZ, to - from, 0.3, pal.wall, chapter);
      this._wall((from + to) / 2, corr.maxZ, to - from, 0.3, pal.wall, chapter);
      rect = { minX: from - OVERLAP, maxX: to + OVERLAP, minZ: corr.minZ, maxZ: corr.maxZ };
    }
    this.areas.set(id, { ...rect, kind, chapter });
  }

  // id -> chapter, for props/lights that are only placed once all rooms exist
  // (unlike _buildRoom/_buildCorridor, which already know their own chapter).
  _chapterAt(x, z) {
    const id = this.areaAt(x, z);
    return id ? this.areas.get(id)?.chapter : null;
  }

  // Same PROPS data, same collision blockers (still the box footprint below)
  // -- only the meshes changed. `crate` reads as a stump obstacle now (no
  // hazard-tape variant any more -- warning tape is a human/industrial tell,
  // and the whole point of this pass is that nothing here should read as
  // built). `pillar` is a trunk+canopy sight-blocker outside chapter 2, but a
  // concrete pillar inside it (the arena's cover objects, in the reveal zone).
  // `shelf` is a fallen-log pile, `table` a mossy flat slab.
  _buildProps() {
    const stumpMat = new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0x6e5636, roughness: 1 });
    const trunkMat = new THREE.MeshStandardMaterial({ map: this.wallTex, color: 0x5c4630, roughness: 1 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3f5a34, roughness: 1 });
    const logMat = new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0x4a3c26, roughness: 1 });
    const slabMat = new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0x6b7a63, roughness: 0.9 });
    const concreteMat = new THREE.MeshStandardMaterial({ map: this.facWallTex, color: 0x8a9098, roughness: 0.7 });

    for (const p of PROPS) {
      if (p.kind === 'crate') {
        // tree stump: a squat cylinder using the box footprint as its diameter
        const stump = new THREE.Mesh(
          new THREE.CylinderGeometry(p.w / 2, p.w / 2 * 1.1, p.h, 10),
          stumpMat
        );
        stump.position.set(p.x, p.h / 2, p.z);
        stump.castShadow = true;
        stump.receiveShadow = true;
        this.group.add(stump);
      } else if (p.kind === 'pillar' && this._chapterAt(p.x, p.z) === 2) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), concreteMat);
        mesh.position.set(p.x, p.h / 2, p.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      } else if (p.kind === 'pillar') {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(Math.min(p.w, p.d) / 2, Math.min(p.w, p.d) / 2 * 1.2, p.h, 9),
          trunkMat
        );
        trunk.position.set(p.x, p.h / 2, p.z);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        this.group.add(trunk);
        const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(Math.max(p.w, p.d) * 0.7, 0), canopyMat);
        canopy.position.set(p.x, p.h + 0.4, p.z);
        canopy.castShadow = true;
        this.group.add(canopy);
      } else if (p.kind === 'shelf') {
        const log = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), logMat);
        log.position.set(p.x, p.h / 2, p.z);
        log.castShadow = true;
        log.receiveShadow = true;
        this.group.add(log);
        // a few branch stubs poking off the top -- breaks up the flat rack silhouette
        for (let i = 0; i < 3; i++) {
          const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.4 + Math.random() * 0.3, 6), logMat);
          stub.position.set(p.x + (Math.random() - 0.5) * p.w * 0.7, p.h + 0.1, p.z + (Math.random() - 0.5) * p.d * 0.7);
          stub.rotation.set(Math.random() * 0.6, 0, Math.random() * 0.6);
          this.group.add(stub);
        }
      } else {
        // table
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), slabMat);
        mesh.position.set(p.x, p.h / 2, p.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }

      this.blockers.push({
        minX: p.x - p.w / 2, maxX: p.x + p.w / 2,
        minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2,
      });
    }
  }

  // Vines strung along every chapter-1 corridor's canopy, with a leaf tuft
  // every couple units -- ties the corridor visually to the space instead of
  // a plain box hallway. corr3 (chapter 2, the reveal) gets metal conduits
  // instead, same geometry/positioning as the old pre-reskin pipes.
  _buildCorridorVines() {
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x466b34, roughness: 1 });
    const pipeMat = new THREE.MeshStandardMaterial({ map: this.metalTex, roughness: 0.5, metalness: 0.6 });
    for (const corr of CORRIDORS) {
      const facility = corr.chapter === 2;
      const len = corr.to - corr.from;
      const mat = facility ? pipeMat : vineMat;
      const radius = facility ? 0.09 : 0.06;
      const line = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, facility ? 8 : 6), mat);
      if (corr.axis === 'z') {
        line.rotation.x = Math.PI / 2;
        line.position.set(corr.minX + (corr.maxX - corr.minX) * 0.3, WALL_HEIGHT - 0.35, (corr.from + corr.to) / 2);
      } else {
        line.rotation.z = Math.PI / 2;
        line.position.set((corr.from + corr.to) / 2, WALL_HEIGHT - 0.35, corr.minZ + (corr.maxZ - corr.minZ) * 0.3);
      }
      this.group.add(line);
      // joints every couple units, same spacing either style uses
      const joints = Math.max(1, Math.floor(len / 4));
      for (let i = 0; i <= joints; i++) {
        const joint = facility
          ? new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 10), pipeMat)
          : new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), leafMat);
        const t = i / joints;
        if (corr.axis === 'z') {
          if (facility) joint.rotation.x = Math.PI / 2;
          joint.position.set(line.position.x, line.position.y, corr.from + len * t);
        } else {
          if (facility) joint.rotation.y = Math.PI / 2;
          joint.position.set(corr.from + len * t, line.position.y, line.position.z);
        }
        this.group.add(joint);
      }
    }
  }

  // Tangled roots plunging down around a hollow in the ground -- the vault
  // holds "이상한 재료" and hints at project 0268 before the player ever wakes it.
  // Same ring layout as the old cage bars, just gnarled root tendrils instead
  // of metal.
  _buildVaultDressing() {
    const v = this.areas.get('vault');
    if (!v) return;
    const rootMat = new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0x4a3c26, roughness: 1 });
    const cx = (v.minX + v.maxX) / 2;
    const cz = (v.minZ + v.maxZ) / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 2.4, 6), rootMat);
      bar.position.set(cx + Math.cos(a) * 1.4, 1.2, cz + Math.sin(a) * 1.4);
      bar.rotation.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
      this.group.add(bar);
    }
    const glow = new THREE.PointLight(0xcc66ff, 0.9, 6, 2);
    glow.position.set(cx, 1.6, cz);
    this.group.add(glow);
  }

  // Chains and scorch-dark floor patches around the boss arena perimeter --
  // dressing the room as a place things have already died, before the fight
  // starts. Metal, not roots: the arena is chapter 2, past the reveal, so it
  // should read as unmistakably built (기획서 반전 -- "not in a forest").
  _buildArenaDressing() {
    const a = this.areas.get('arena');
    if (!a) return;
    const chainMat = new THREE.MeshStandardMaterial({ map: this.metalTex, color: 0x30302e, roughness: 0.7, metalness: 0.5 });
    const scorchMat = new THREE.MeshStandardMaterial({ color: 0x1a1610, roughness: 1, transparent: true, opacity: 0.5 });
    for (const [x, z] of [[-20.8, 117.7], [20.8, 117.7], [-20.8, 146.3], [20.8, 146.3]]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, WALL_HEIGHT - 0.4, 6), chainMat);
      chain.position.set(x, WALL_HEIGHT / 2, z);
      this.group.add(chain);
      const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.6, 16), scorchMat);
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.set(x, 0.02, z);
      this.group.add(scorch);
    }

    // A containment control console near the entrance -- an alternate way
    // through the scientist encounter (기획서 5번 "이길 방법이 여러 가지인가").
    // Fits chapter 2's "real facility" reveal: industrial fixtures are meant
    // to read here (see 리스킨 3차 note), so a console doesn't clash.
    const consoleBodyMat = new THREE.MeshStandardMaterial({ map: this.metalTex, color: 0x3a3f3c, roughness: 0.6, metalness: 0.6 });
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x0a1210, emissive: 0x1fae7a, emissiveIntensity: 0.9, roughness: 0.3 });
    this.consolePosition = new THREE.Vector3(22, 0, 118);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 0.6), consoleBodyMat);
    stand.position.set(this.consolePosition.x, 0.52, this.consolePosition.z);
    stand.castShadow = true;
    this.group.add(stand);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.06), screenMat);
    screen.position.set(this.consolePosition.x, 1.15, this.consolePosition.z - 0.05);
    screen.rotation.x = -0.35;
    this.group.add(screen);
    this.consoleScreenMat = screenMat;
    this.blockers.push({
      minX: this.consolePosition.x - 0.5, maxX: this.consolePosition.x + 0.5,
      minZ: this.consolePosition.z - 0.35, maxZ: this.consolePosition.z + 0.35,
    });
  }

  _buildCabinDressing() {
    // The bed the player wakes up on. Doubles as the save point (기획서 10번).
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.4, 1.3),
      new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0x8a6a45, roughness: 1 })
    );
    frame.position.set(-2.6, 0.2, -3.4);
    frame.castShadow = true;
    this.group.add(frame);
    // bed posts at each corner -- a flat box read as a crate; posts read as a bed
    const postMat = new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0x6b4a2b, roughness: 1 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), postMat);
      post.position.set(-2.6 + sx * 1.02, 0.35, -3.4 + sz * 0.58);
      this.group.add(post);
    }
    const sheet = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x8fa2b8, roughness: 1 })
    );
    sheet.position.set(-2.6, 0.5, -3.4);
    this.group.add(sheet);
    // pillow
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.14, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 1 })
    );
    pillow.position.set(-2.6, 0.63, -3.85);
    this.group.add(pillow);
    this.blockers.push({ minX: -3.7, maxX: -1.5, minZ: -4.05, maxZ: -2.75 });
    this.bedPosition = new THREE.Vector3(-2.6, 0, -2.2);

    // a small table + lamp beside the bed -- the cabin needs one more prop or
    // it reads as a bed dropped in an empty box
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.5, 10),
      new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0x6b4a2b, roughness: 1 })
    );
    table.position.set(-0.9, 0.25, -3.6);
    this.group.add(table);
    const lamp = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8d090, emissive: 0x554015, roughness: 0.5 })
    );
    lamp.position.set(-0.9, 0.6, -3.6);
    this.group.add(lamp);
    const lampGlow = new THREE.PointLight(0xffdd99, 0.6, 4, 2);
    lampGlow.position.set(-0.9, 0.7, -3.6);
    this.group.add(lampGlow);
    this.blockers.push({ minX: -1.25, maxX: -0.55, minZ: -3.95, maxZ: -3.25 });
  }

  // Clusters of glowing fungus growing out of the ground -- makes the lab
  // clearing read as "where the experiment happened" without a single glass
  // tank or anything else obviously built. Same footprint/blocker/glow as the
  // old specimen tanks, just organic instead of laboratory equipment.
  _buildLabDressing() {
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x66ddbb, emissive: 0x2b8c6a, emissiveIntensity: 0.9, roughness: 0.5,
    });
    const stalkMat = new THREE.MeshStandardMaterial({ map: this.woodTex, color: 0xdcd8c0, roughness: 0.8 });
    for (const [x, z] of [[34.3, 40], [41.5, 27], [45.4, 52]]) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.55;
        const h = 0.5 + Math.random() * 0.7;
        const sx = x + Math.cos(a) * r;
        const sz = z + Math.sin(a) * r;
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, h, 6), stalkMat);
        stalk.position.set(sx, h / 2, sz);
        this.group.add(stalk);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.1, 8, 6), capMat);
        cap.position.set(sx, h, sz);
        cap.scale.y = 0.6;
        this.group.add(cap);
      }
      const glow = new THREE.PointLight(0x55ffcc, 0.6, 7, 2);
      glow.position.set(x, 1.2, z);
      this.group.add(glow);
      this.blockers.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
    }
  }

  // A dense bundle of trunks bound with root/vine wraps, filling a doorway --
  // used for both blocking doors below instead of a flat man-made slab. All
  // logs share one material so a door's readiness glow (emissive) can still
  // be toggled with a single `material.emissive.setHex(...)`, and the whole
  // bundle is one Group so the existing "slide the door up" animation (which
  // just moves `mesh.position.y`) keeps working unchanged.
  _buildLogBarrier(width, height, matOptions) {
    const mat = new THREE.MeshStandardMaterial({ map: this.wallTex, roughness: 0.9, ...matOptions });
    const group = new THREE.Group();
    const count = 6;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const r = 0.24 + Math.random() * 0.12;
      const h = height * (0.92 + Math.random() * 0.16);
      const log = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 8), mat);
      log.position.set(t * width, h / 2, 0);
      log.rotation.z = (Math.random() - 0.5) * 0.12;
      log.castShadow = true;
      group.add(log);
    }
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, width * 1.05, 6), vineMat);
      vine.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      vine.position.set(0, height * (0.25 + i * 0.28), 0.15);
      group.add(vine);
    }
    return { group, mat };
  }

  // The locked door between chapter 1 and chapter 2. Blocks movement until the
  // keycard is used, at which point the blocker is dropped and the bundle
  // slides up.
  _buildGateDoor() {
    const { group } = this._buildLogBarrier(3.4, 3.6, { color: 0x6b4a2b, emissive: 0x330000 });
    group.position.set(0, 0, 92);
    this.group.add(group);

    const lamp = new THREE.PointLight(0xff3322, 1.4, 9, 2);
    lamp.position.set(0, 3.2, 91);
    this.group.add(lamp);

    this.gateDoor = { mesh: group, lamp, open: false, _t: 0 };
    this.gateBlocker = { minX: -1.7, maxX: 1.7, minZ: 91.6, maxZ: 92.4, id: 'gate-door' };
    this.blockers.push(this.gateBlocker);
    this.gatePosition = new THREE.Vector3(0, 0, 90.6);
  }

  // The way out, at the far end of the arena. Only becomes usable once the
  // commander is down -- that's the normal ending (기획서 12번). Plain metal,
  // no branding/text -- chapter 2 should feel wrong and unnatural, not like a
  // labeled office door.
  _buildEscapeDoor() {
    const mat = new THREE.MeshStandardMaterial({
      map: this.metalTex, color: 0x224433, emissive: 0x061a10, roughness: 0.6,
    });
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.8, 0.4), mat);
    door.position.set(0, 1.9, 151.7);
    this.group.add(door);
    this.escapeDoor = { mesh: door, material: mat };
    this.escapePosition = new THREE.Vector3(0, 0, 150.2);
    this.exitPosition = this.escapePosition; // kept for older call sites
  }

  // The "???" chamber of the 진 엔딩. A single cold shaft of light on the far
  // wall, and "그" -- the facility's designer -- standing under it: a shape that
  // absorbs light rather than reflecting it (기획서 4번, "그림자진 형체").
  _buildSanctum() {
    const s = this.areas.get('sanctum');
    this.sanctumEntrance = new THREE.Vector3(0, 0, s.minZ + 4);
    this.sanctumCenter = new THREE.Vector3(0, 0, (s.minZ + s.maxZ) / 2);

    // dark monoliths lining the approach -- half-formed things standing in
    // rows, the same silhouette as "그" repeated, so the room already feels
    // wrong before he speaks
    const monolithMat = new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 1 });
    for (let i = 0; i < 5; i++) {
      const z = s.minZ + 10 + i * 5;
      for (const sx of [-1, 1]) {
        const mono = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2 + Math.random(), 0.6), monolithMat);
        mono.position.set(sx * 6, mono.geometry.parameters.height / 2, z);
        mono.rotation.y = Math.random() * 0.3;
        this.group.add(mono);
        this.blockers.push({ minX: sx * 6 - 0.3, maxX: sx * 6 + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
      }
    }

    // shattered mirror shards drifting near the center -- literal broken
    // reflections, echoing the doppelganger fought here
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x1a2436, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.5,
    });
    this.sanctumShards = [];
    for (let i = 0; i < 8; i++) {
      const shard = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), shardMat);
      shard.position.set(
        THREE.MathUtils.randFloatSpread(6),
        1.2 + Math.random() * 1.5,
        this.sanctumCenter.z + THREE.MathUtils.randFloatSpread(6)
      );
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      this.group.add(shard);
      this.sanctumShards.push({ mesh: shard, phase: Math.random() * 10 });
    }

    const heMat = new THREE.MeshBasicMaterial({ color: 0x050506 });
    const he = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.5, 6, 10), heMat);
    torso.position.y = 1.4;
    he.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), heMat);
    head.position.y = 2.35;
    he.add(head);
    // a thin robe skirt so the silhouette isn't just a capsule
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.8, 12, 1, true), heMat);
    robe.position.y = 0.9;
    he.add(robe);
    he.position.set(0, 0, s.maxZ - 5);
    he.visible = false;
    this.group.add(he);
    this.heFigure = he;

    const halo = new THREE.PointLight(0x8899bb, 0, 10, 2);
    halo.position.set(0, 3.2, s.maxZ - 5);
    this.group.add(halo);
    this.heHalo = halo;
  }

  showHe() {
    this.heFigure.visible = true;
    this.heHalo.intensity = 1.6;
  }

  hideHe() {
    this.heFigure.visible = false;
    this.heHalo.intensity = 0;
  }

  _buildLights() {
    // No cord, no glass -- a loose cluster of glowing spores drifting under the
    // canopy at each fixture position. Reads as bioluminescence, not a hung
    // lantern, so nothing here says "someone installed lighting". Chapter 2
    // (the reveal) gets a plain flush ceiling glow instead -- still minimal,
    // no visible fixture/housing, just enough to read as "artificial" rather
    // than "someone mounted a light here".
    const sporeMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c4, emissive: 0xfff3c4, emissiveIntensity: 1.3, roughness: 0.5, transparent: true, opacity: 0.8,
    });
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0xf2f6ff, emissive: 0xd8e4ff, emissiveIntensity: 1.1, roughness: 0.6,
    });
    for (const [x, z, rawBase] of LIGHTS) {
      const base = rawBase * LIGHT_BRIGHTNESS_MUL;
      const light = new THREE.PointLight(0xfff3c4, base, 20, 2);
      light.position.set(x, 3.5, z);
      light.visible = false;
      this.group.add(light);
      this.flickerLights.push({ light, phase: Math.random() * 10, base });

      // decorative mesh only -- unlike the point lights, meshes don't force a
      // shader recompile, so it's fine to draw every one of these even though
      // only LIGHT_BUDGET of the actual lights are ever visible at once
      if (this._chapterAt(x, z) === 2) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), panelMat);
        panel.rotation.x = Math.PI / 2;
        panel.position.set(x, WALL_HEIGHT - 0.05, z);
        this.group.add(panel);
        continue;
      }
      for (let i = 0; i < 4; i++) {
        const spore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 + Math.random() * 0.05, 0), sporeMat);
        spore.position.set(
          x + THREE.MathUtils.randFloatSpread(0.4),
          3.3 + Math.random() * 0.3,
          z + THREE.MathUtils.randFloatSpread(0.4)
        );
        this.group.add(spore);
      }
    }
    this._lightCullTimer = 0;
  }

  // Every lantern lit at once is ~20 point lights in one MeshStandardMaterial
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
    this.gateDoor.mesh.position.y = 0; // log bundle rests on the ground, unlike the old box's centered y=1.8
    this.gateDoor.lamp.color.setHex(0xff3322);
    if (!this.blockers.includes(this.gateBlocker)) this.blockers.push(this.gateBlocker);

    this.escapeDoor.material.emissive.setHex(0x061a10);
    if (this.escapeLight) {
      this.group.remove(this.escapeLight);
      this.escapeLight = null;
    }
    this.hideHe();

    this.consoleScreenMat.emissive.setHex(0x1fae7a);
    this.consoleScreenMat.emissiveIntensity = 0.9;
  }

  // Spent once the player uses it to gas the remaining scientists instead of
  // fighting them -- screen goes dead so it doesn't keep offering a prompt.
  useConsole() {
    this.consoleScreenMat.emissive.setHex(0x441111);
    this.consoleScreenMat.emissiveIntensity = 0.4;
  }

  markEscapeReady() {
    this.escapeDoor.material.emissive.setHex(0x22aa55);
    if (!this.escapeLight) {
      this.escapeLight = new THREE.PointLight(0x44ffaa, 2, 14, 2);
      this.escapeLight.position.set(0, 2.4, 150);
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
    // mirror shards drift slowly in place, never settling
    if (this.sanctumShards) {
      for (const s of this.sanctumShards) {
        s.mesh.rotation.x += dt * 0.15;
        s.mesh.position.y += Math.sin(this._t * 0.5 + s.phase) * dt * 0.05;
      }
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
