import * as THREE from 'three';
import { Creature } from './Creature.js';
import { Projectile } from './Projectile.js';
import { furTexture, metalTexture } from '../world/Textures.js';

const WAKE_RADIUS = 8;

// The hidden bosses of 기획서 8번's ??? ending. They only exist on a second
// run: the facility's original specimens, the things the wolves and deer were
// copied FROM. Each drops one 이상한 재료, and all three are needed for the
// secret ending.
//
// They sleep until you walk near, so a second-run player who just wants the
// normal ending can walk past without ever fighting them.
export const MUTANT_TYPES = {
  'W-01': {
    name: '표본 W-01',
    subtitle: '늑대의 원형',
    hp: 110, speed: 4.3, damage: 13, pattern: 'lunge',
    tell: 0.75, cooldown: 2.6, range: 2.2,
  },
  'D-02': {
    name: '표본 D-02',
    subtitle: '사슴의 원형',
    hp: 95, speed: 3.2, damage: 7, pattern: 'volley',
    tell: 0.8, cooldown: 3.0, range: 9,
  },
  'C-00': {
    name: '표본 C-00',
    subtitle: '폐기된 시제품',
    hp: 130, speed: 2.3, damage: 16, pattern: 'slam',
    tell: 1.2, cooldown: 2.8, range: 5,
  },
};

// How far a woken specimen will follow you before giving up and going home.
// Without a leash, waking one in the storage means it trails you through the
// hall while the wolves pile on -- and there'd be no way to back out of a fight
// you opened by accident. It keeps the damage you've done, so retreating to
// heal and coming back is a real tactic rather than a reset.
const LEASH_RADIUS = 20;

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

    this.awake = false;
    this.state = 'dormant';
    this.home = new THREE.Vector3().copy(position);
    this._timer = 0;
    this._cooldown = def.cooldown;
    this._dashDir = new THREE.Vector3();
    this._hitThisDash = false;

    this._buildMesh();
  }

  _buildMesh() {
    const t = this.typeId;
    if (t === 'C-00') {
      this.material = new THREE.MeshStandardMaterial({
        map: metalTexture(), color: 0x5a5148, roughness: 0.5, metalness: 0.6,
      });
    } else {
      this.material = new THREE.MeshStandardMaterial({
        map: furTexture(t === 'W-01' ? '#c9bfae' : '#b9a98c'),
        roughness: 1,
      });
    }
    this._baseEmissive = 0x000000;

    if (t === 'W-01') {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 5, 10), this.material);
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.85;
      body.castShadow = true;
      this.mesh.add(body);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.9, 8), this.material);
      head.rotation.x = Math.PI / 2;
      head.position.set(0, 0.95, 1);
      this.mesh.add(head);
      for (const sx of [-1, 1]) {
        for (const dz of [0.5, -0.5]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.85, 6), this.material);
          leg.position.set(sx * 0.32, 0.42, dz);
          this.mesh.add(leg);
        }
      }
    } else if (t === 'D-02') {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1, 5, 10), this.material);
      body.rotation.z = Math.PI / 2;
      body.position.y = 1.15;
      body.castShadow = true;
      this.mesh.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), this.material);
      head.position.set(0, 1.65, 0.75);
      this.mesh.add(head);
      // far too many antlers -- the "원형" of the thing you've been eating
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.9 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.75, 5), spikeMat);
        spike.position.set(Math.cos(a) * 0.24, 1.95, 0.7 + Math.sin(a) * 0.24);
        spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        this.mesh.add(spike);
      }
      for (const sx of [-1, 1]) {
        for (const dz of [0.42, -0.42]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 1.15, 6), this.material);
          leg.position.set(sx * 0.28, 0.57, dz);
          this.mesh.add(leg);
        }
      }
    } else {
      // C-00: the commander's silhouette, unfinished
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.15, 6, 12), this.material);
      torso.position.y = 1.3;
      torso.castShadow = true;
      this.mesh.add(torso);
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 10), this.material);
      helm.position.y = 2.15;
      this.mesh.add(helm);
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.9, 4, 8), this.material);
        arm.position.set(sx * 0.72, 1.35, 0);
        this.mesh.add(arm);
      }
    }

    // eyes: dark while dormant, lit once awake -- the tell that it noticed you
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), this.eyeMat);
      eye.position.set(sx * 0.14, this.typeId === 'C-00' ? 2.16 : 1.05, this.typeId === 'C-00' ? 0.32 : 1.35);
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
          damage: this.def.damage, speed: 11, color: 0xcc66ff,
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
            if (dist <= this.def.range) player.takeDamage(this.def.damage);
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
          this._cooldown = this.def.cooldown;
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
          player.takeDamage(this.def.damage);
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
