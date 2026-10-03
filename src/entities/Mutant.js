import * as THREE from 'three';
import { Creature } from './Creature.js';
import { Projectile } from './Projectile.js';
import { organicTexture, veinGlowTexture, metalTexture } from '../world/Textures.js';

const WAKE_RADIUS = 8;

// The facility's failed experiments -- 기획서 4번의 project 0268 / 2045 / 1974,
// the mini bosses of the ??? ending. They only exist on a second run: each drops
// one 이상한 재료, and all three are needed for that ending.
//
// They sleep until you walk near, so a second-run player who only wants the
// normal ending can walk past without ever fighting them. Stats come straight
// from 기획서 5번's balancing table.
export const MUTANT_TYPES = {
  '1974': {
    name: 'project 1974',
    subtitle: '실패한 실험체',
    hp: 210, speed: 4.5, damage: 23, pattern: 'lunge',
    tell: 0.6, cooldown: 2.1, range: 2.2, tint: '#b06a5c',
  },
  '2045': {
    name: 'project 2045',
    subtitle: '실패한 실험체',
    hp: 234, speed: 3.4, damage: 21, pattern: 'volley',
    tell: 0.65, cooldown: 2.4, range: 9, tint: '#a6a49a',
  },
  '0268': {
    name: 'project 0268',
    subtitle: '실패한 실험체',
    hp: 222, speed: 2.5, damage: 24, pattern: 'slam',
    tell: 1.0, cooldown: 2.2, range: 5.2, tint: '#5a5148',
  },
};

// How far a woken specimen will follow you before giving up and going home.
// Without a leash, waking one in the storage means it trails you through the
// hall while the wolves pile on -- and there'd be no way to back out of a fight
// you opened by accident. It keeps the damage you've done, so retreating to
// heal and coming back is a real tactic rather than a reset.
const LEASH_RADIUS = 20;

// Disengaging heals it. The leash alone made "back off, regenerate, plink"
// strictly better than fighting -- the player regenerates 1.2 hp/s, so any
// specimen that kept its wounds could be ground down at zero risk. It out-heals
// you by a wide margin, which makes retreat a way to survive rather than a way
// to win.
const DISENGAGE_RADIUS = 14;
const REGEN_PER_SEC = 5;

// Below half health it stops giving you as much room. Escalation the player can
// feel beats a bigger health bar they just chew through.
const ENRAGE_AT = 0.5;
const ENRAGE_COOLDOWN_MUL = 0.65;
const ENRAGE_SPEED_MUL = 1.15;

const DASH_SPEED = 15;
const DASH_TIME = 0.55;

export class Mutant extends Creature {
  constructor(facility, position, typeId, { onProjectile, onWake, area = 'hall' } = {}) {
    const def = MUTANT_TYPES[typeId];
    super(facility, position, { hp: def.hp, speed: def.speed, wanderArea: area, expValue: 60 });
    this.typeId = typeId;
    this.def = def;
    this.name = def.name;
    this.hostile = true;
    this.isMiniBoss = true;
    this.hitRadius = 0.8;
    this.lootId = 'strange-material';
    this.lootName = '이상한 재료';
    this.onProjectile = onProjectile;
    this.onWake = onWake;
    // Runs 3+ scale this instead of def.damage directly -- def is the shared
    // MUTANT_TYPES entry, not a per-instance copy, so mutating it would leak
    // into every future spawn (including a fresh save).
    this.damageMul = 1;

    this.awake = false;
    this.state = 'dormant';
    this.enraged = false;
    this.home = new THREE.Vector3().copy(position);
    this._timer = 0;
    this._cooldown = def.cooldown;
    this._dashDir = new THREE.Vector3();
    this._hitThisDash = false;

    this._buildMesh();
  }

  // All three are "실패한 실험체" -- warped humanoids now, not the animal-shaped
  // originals of the old build. One body, tinted per type; the attack pattern is
  // what actually tells them apart in a fight.
  _buildMesh() {
    const t = this.typeId;
    // 실패한 실험체: raw, scarred flesh with glowing vein cracks rather than fur --
    // organicTexture/veinGlowTexture (0268 keeps its armor plating over the top).
    this.material = new THREE.MeshStandardMaterial({
      map: t === '0268' ? metalTexture() : organicTexture(this.def.tint),
      emissive: t === '0268' ? 0x000000 : new THREE.Color(this.def.tint),
      emissiveIntensity: 0.9,
      color: new THREE.Color(this.def.tint),
      roughness: t === '0268' ? 0.5 : 1,
      metalness: t === '0268' ? 0.5 : 0,
    });
    if (t !== '0268') this.material.emissiveMap = veinGlowTexture(this.def.tint);
    this._baseEmissive = t === '0268' ? 0x000000 : new THREE.Color(this.def.tint).getHex();

    const heavy = t === '0268';
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(heavy ? 0.6 : 0.44, heavy ? 1.2 : 1, 6, 12),
      this.material
    );
    torso.position.y = heavy ? 1.35 : 1.2;
    torso.rotation.x = 0.12; // hunched
    torso.castShadow = true;
    this.mesh.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(heavy ? 0.34 : 0.3, 12, 12), this.material);
    head.position.set(0, heavy ? 2.15 : 1.9, 0.18);
    this.mesh.add(head);

    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(
        new THREE.CapsuleGeometry(heavy ? 0.19 : 0.14, heavy ? 0.95 : 0.85, 4, 8),
        this.material
      );
      arm.position.set(sx * (heavy ? 0.72 : 0.56), heavy ? 1.35 : 1.2, 0.1);
      arm.rotation.x = 0.35;
      this.mesh.add(arm);
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.1, heavy ? 1.0 : 1.1, 6),
        this.material
      );
      leg.position.set(sx * 0.24, heavy ? 0.5 : 0.55, 0);
      this.mesh.add(leg);
    }

    // extra silhouette per type so they're not identical from across the room
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a2422, roughness: 0.9 });
    if (t === '2045') {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 5), spikeMat);
        spine.position.set(Math.cos(a) * 0.2, 1.5, 0.1 + Math.sin(a) * 0.2);
        spine.rotation.set(Math.sin(a), 0, -Math.cos(a));
        this.mesh.add(spine);
      }
      // a segmented tail curling behind it -- volley-caster reads as "keeps range
      // with something that isn't legs"
      let segPos = new THREE.Vector3(0, 1.3, -0.35);
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.09 - i * 0.012, 6, 6), this.material);
        seg.position.copy(segPos);
        this.mesh.add(seg);
        segPos = segPos.clone().add(new THREE.Vector3(0, -0.05, -0.18));
      }
    } else if (t === '1974') {
      const claws = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), spikeMat);
      claws.rotation.x = Math.PI / 2;
      claws.position.set(0, 1.15, 0.7);
      this.mesh.add(claws);
      // a second, oversized clawed arm hanging off one shoulder -- the lunger's
      // asymmetry, so it reads as "wrong" even standing still
      const bigArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.05, 4, 8), this.material);
      bigArm.position.set(-0.75, 1.05, 0.15);
      bigArm.rotation.x = 0.5;
      bigArm.rotation.z = 0.2;
      this.mesh.add(bigArm);
      const bigClaw = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 5), spikeMat);
      bigClaw.rotation.x = Math.PI / 2.2;
      bigClaw.position.set(-0.85, 0.55, 0.5);
      this.mesh.add(bigClaw);
    } else if (t === '0268') {
      // exposed chest core glowing through a gap in the armor plating -- the
      // heavy one's "wound" that ties it back to the same body-horror family
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x1a0a0a, emissive: new THREE.Color(this.def.tint).multiplyScalar(2.2) })
      );
      core.position.set(0, 1.35, 0.56);
      this.mesh.add(core);
      // shoulder plating
      for (const sx of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.5), this.material);
        plate.position.set(sx * 0.68, 1.75, 0);
        this.mesh.add(plate);
      }
    }

    // eyes: dark while dormant, lit once awake -- the tell that it noticed you
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), this.eyeMat);
      eye.position.set(sx * 0.12, heavy ? 2.18 : 1.93, heavy ? 0.48 : 0.44);
      this.mesh.add(eye);
    }

    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xcc66ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 36), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.visible = false;
    this.mesh.add(this.ring);

    this.aura = new THREE.PointLight(0xcc66ff, 0, 9, 2);
    this.aura.position.y = 1.6;
    this.mesh.add(this.aura);

    // dormant: slumped over, lights off
    this.mesh.rotation.x = -0.25;
  }

  _wake() {
    this.awake = true;
    this.state = 'idle';
    this.mesh.rotation.x = 0;
    this.eyeMat.emissive.setHex(0xcc66ff);
    this.aura.intensity = 0.8;
    this.onWake?.(this);
  }

  _enrage() {
    this.enraged = true;
    this.speed = this.def.speed * ENRAGE_SPEED_MUL;
    this.eyeMat.emissive.setHex(0xff3355);
    this.ringMat.color.setHex(0xff3355);
    this.aura.color.setHex(0xff3355);
    this.aura.intensity = 1.6;
    this.onEnrage?.(this);
  }

  get _attackCooldown() {
    return this.def.cooldown * (this.enraged ? ENRAGE_COOLDOWN_MUL : 1);
  }

  _showRing(radius, progress) {
    this.ring.visible = true;
    this.ring.scale.setScalar(Math.max(0.01, radius));
    this.ringMat.opacity = 0.25 + progress * 0.5;
  }

  _hideRing() {
    this.ring.visible = false;
  }

  _face(player) {
    this.mesh.rotation.y = Math.atan2(
      player.position.x - this.mesh.position.x,
      player.position.z - this.mesh.position.z
    );
  }

  _fire(player) {
    const base = new THREE.Vector3().subVectors(player.position, this.mesh.position).setY(0);
    for (const spread of [-0.32, 0, 0.32]) {
      const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
      this.onProjectile?.(
        new Projectile(this.mesh.position, dir, {
          damage: this.def.damage * this.damageMul, speed: 11, color: 0xcc66ff,
        })
      );
    }
  }

  update(dt, player) {
    if (!this.alive) return;

    if (!this.awake) {
      // slow idle bob so it reads as "alive but asleep", not as scenery
      this.mesh.position.y = Math.sin(Date.now() * 0.001) * 0.03;
      if (player.alive && this.mesh.position.distanceTo(player.position) <= WAKE_RADIUS) this._wake();
      this._applyHitFlash(dt, this.material);
      // hitting it also wakes it -- being able to free-hit a sleeping boss would
      // turn every one of these into a stat check instead of a fight
      if (this.hp < this.maxHp) this._wake();
      return;
    }

    this._timer -= dt;
    this._cooldown -= dt;
    const dist = this.mesh.position.distanceTo(player.position);

    if (dist > DISENGAGE_RADIUS && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + REGEN_PER_SEC * dt);
    }
    if (!this.enraged && this.hp <= this.maxHp * ENRAGE_AT) this._enrage();

    // Chased too far from its tank? Walk back. Mid-attack states are left alone
    // so a lunge or a slam always resolves instead of being cancelled halfway.
    if (this.state === 'idle' || this.state === 'returning') {
      const fromHome = this.mesh.position.distanceTo(this.home);
      if (this.state === 'idle' && (dist > LEASH_RADIUS || fromHome > LEASH_RADIUS)) {
        this.state = 'returning';
      }
      if (this.state === 'returning') {
        if (dist < LEASH_RADIUS * 0.6 && fromHome < LEASH_RADIUS) {
          this.state = 'idle';
        } else if (this._moveToward(this.home, dt, 0.8) < 1) {
          this.state = 'idle';
        }
        this._applyHitFlash(dt, this.material);
        return;
      }
    }

    switch (this.state) {
      case 'idle': {
        this._face(player);
        if (!player.alive) break;
        if (this.def.pattern === 'volley') {
          // keeps its distance, like the scientist but meaner
          if (dist < this.def.range - 3) this._fleeFrom(player.position, dt, 1);
          else if (dist > this.def.range + 2) this._moveToward(player.position, dt, 1);
        } else if (dist > this.def.range - 0.5) {
          this._moveToward(player.position, dt, 1);
        }
        if (this._cooldown <= 0 && dist <= this.def.range + 2) {
          this.state = 'tell';
          this._timer = this.def.tell;
          if (this.def.pattern === 'lunge') {
            this._dashDir.subVectors(player.position, this.mesh.position).setY(0).normalize();
          }
        }
        break;
      }

      case 'tell': {
        const p = 1 - Math.max(0, this._timer) / this.def.tell;
        if (this.def.pattern === 'slam') this._showRing(this.def.range * p, p);
        else if (this.def.pattern === 'lunge') this._showRing(1.4, p);
        else this._face(player);
        this.aura.intensity = 0.8 + p * 2;

        if (this._timer <= 0) {
          this.aura.intensity = 0.8;
          this._hideRing();
          if (this.def.pattern === 'slam') {
            if (dist <= this.def.range) player.takeDamage(this.def.damage * this.damageMul);
            this.onSlam?.(this.mesh.position.clone(), this.def.range);
            this.state = 'recover';
            this._timer = 0.6;
          } else if (this.def.pattern === 'volley') {
            this._fire(player);
            this.state = 'recover';
            this._timer = 0.4;
          } else {
            this.state = 'dash';
            this._timer = DASH_TIME;
            this._hitThisDash = false;
          }
          this._cooldown = this._attackCooldown;
        }
        break;
      }

      case 'dash': {
        const step = DASH_SPEED * dt;
        const resolved = this.facility.resolveMove(
          this.mesh.position.x, this.mesh.position.z,
          this._dashDir.x * step, this._dashDir.z * step, 0.6
        );
        const blocked = resolved.x === this.mesh.position.x && resolved.z === this.mesh.position.z;
        this.mesh.position.x = resolved.x;
        this.mesh.position.z = resolved.z;
        if (!this._hitThisDash && this.mesh.position.distanceTo(player.position) < 1.7) {
          this._hitThisDash = true;
          player.takeDamage(this.def.damage * this.damageMul);
        }
        if (this._timer <= 0 || blocked) {
          this.state = 'recover';
          this._timer = blocked ? 0.9 : 0.5;
        }
        break;
      }

      case 'recover':
        if (this._timer <= 0) this.state = 'idle';
        break;
    }

    this._applyHitFlash(dt, this.material);
  }
}
