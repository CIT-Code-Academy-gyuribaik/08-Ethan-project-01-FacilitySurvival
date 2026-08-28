import * as THREE from 'three';
import { Creature } from './Creature.js';
import { metalTexture } from '../world/Textures.js';

const SWING_RANGE = 3.4;
const SWING_TELL = 0.65;
const SWING_DAMAGE = 18;
const SLAM_RADIUS = 6.5;
const SLAM_TELL = 0.95;
const SLAM_DAMAGE = 26;
const CHARGE_TELL = 0.6;
const CHARGE_SPEED = 13;
const CHARGE_TIME = 0.75;
const CHARGE_DAMAGE = 22;
const PHASE2_AT = 0.5; // fraction of hp where the fight escalates

// "사령관 - 멋진 갑옷을 입은 인간", the final boss (기획서 4번/12번).
//
// Every attack is telegraphed on the floor or in his posture before it lands,
// because the design doc's only defensive verb is movement ("이동으로 공격
// 피하기") -- an untelegraphed boss would be unfair with no block or dodge roll.
export class Commander extends Creature {
  constructor(facility, position) {
    super(facility, position, { hp: 450, speed: 2.6, wanderArea: 'arena', expValue: 0 });
    this.hostile = true;
    this.isBoss = true;
    this.name = '사령관';
    this.phase = 1;

    this.state = 'idle';
    this._timer = 0;
    this._cooldown = 1.2;
    this._chargeDir = new THREE.Vector3();
    this._hitPlayerThisMove = false;
    this._slamNext = false;

    this._buildMesh();
  }

  _buildMesh() {
    const armorTex = metalTexture();
    this.material = new THREE.MeshStandardMaterial({
      map: armorTex, color: 0x6c7a8a, roughness: 0.35, metalness: 0.75,
    });
    this._baseEmissive = 0x000000;

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 1.05, 6, 12), this.material);
    torso.position.y = 1.25;
    torso.castShadow = true;
    this.mesh.add(torso);

    // pauldrons
    for (const sx of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), this.material);
      pauldron.position.set(sx * 0.62, 1.75, 0);
      pauldron.scale.set(1, 0.75, 1);
      pauldron.castShadow = true;
      this.mesh.add(pauldron);
    }

    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), this.material);
    helm.position.y = 2.15;
    helm.castShadow = true;
    this.mesh.add(helm);

    // visor slit -- the only part of him that emits light, so you can read facing
    this.visorMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3311 });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.1), this.visorMat);
    visor.position.set(0, 2.16, 0.3);
    this.mesh.add(visor);

    // the halberd he swings
    this.weapon = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3128, roughness: 0.8 })
    );
    this.weapon.add(shaft);
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.55, 0.08),
      new THREE.MeshStandardMaterial({ map: armorTex, roughness: 0.25, metalness: 0.9 })
    );
    blade.position.set(0.4, 1.1, 0);
    this.weapon.add(blade);
    this.weapon.position.set(0.85, 1.3, 0.2);
    this.weapon.rotation.z = 0.25;
    this.weapon.castShadow = true;
    this.mesh.add(this.weapon);

    // floor telegraph ring, hidden until an attack is winding up
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4422, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.visible = false;
    this.mesh.add(this.ring);

    this.aura = new THREE.PointLight(0xff4422, 0, 10, 2);
    this.aura.position.y = 2;
    this.mesh.add(this.aura);
  }

  _enterPhase2() {
    this.phase = 2;
    this.speed = 3.5;
    this.material.color.setHex(0x8a5a4a);
    this.visorMat.emissive.setHex(0xffaa22);
    this.onPhaseChange?.(2);
  }

  _showRing(radius, progress) {
    this.ring.visible = true;
    this.ring.scale.setScalar(radius);
    this.ringMat.opacity = 0.25 + progress * 0.5;
    this.aura.intensity = progress * 2.5;
  }

  _hideRing() {
    this.ring.visible = false;
    this.aura.intensity = 0;
  }

  _facePlayer(player) {
    this.mesh.rotation.y = Math.atan2(
      player.position.x - this.mesh.position.x,
      player.position.z - this.mesh.position.z
    );
  }

  // Cone in front of him, matching where the halberd actually sweeps.
  _swingHits(player) {
    const to = new THREE.Vector3().subVectors(player.position, this.mesh.position);
    to.y = 0;
    const dist = to.length();
    if (dist > SWING_RANGE) return false;
    to.normalize();
    const forward = new THREE.Vector3(
      Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y)
    );
    return forward.dot(to) > 0.2; // ~150 degree arc
  }

  update(dt, player) {
    if (!this.alive) return;

    if (this.phase === 1 && this.hp <= this.maxHp * PHASE2_AT) this._enterPhase2();

    const dist = this.mesh.position.distanceTo(player.position);
    this._timer -= dt;
    this._cooldown -= dt;

    switch (this.state) {
      case 'idle': {
        this._facePlayer(player);
        if (!player.alive) break;
        if (dist > SWING_RANGE - 0.6) this._moveToward(player.position, dt, 1);
        if (this._cooldown <= 0) {
          // Pick the attack that fits the range. In phase 2 the slam alternates
          // with the swing so that standing in his face is punished rather than
          // safe -- the swing arc alone can be out-ranged by circling.
          const canSlam = this.phase === 2 && dist < SLAM_RADIUS;
          if (canSlam && (this._slamNext || dist > SWING_RANGE)) {
            this._slamNext = false;
            this.state = 'slam-tell';
            this._timer = SLAM_TELL;
          } else if (dist <= SWING_RANGE) {
            this._slamNext = true;
            this.state = 'swing-tell';
            this._timer = SWING_TELL;
          } else if (dist < 22) {
            this.state = 'charge-tell';
            this._timer = CHARGE_TELL;
            this._chargeDir
              .subVectors(player.position, this.mesh.position)
              .setY(0)
              .normalize();
          }
        }
        break;
      }

      case 'swing-tell': {
        this._facePlayer(player);
        const p = 1 - Math.max(0, this._timer) / SWING_TELL;
        this._showRing(SWING_RANGE, p);
        this.weapon.rotation.z = 0.25 - p * 2.2; // wind the halberd back
        if (this._timer <= 0) {
          this.weapon.rotation.z = 1.6;
          if (this._swingHits(player)) player.takeDamage(SWING_DAMAGE);
          this._hideRing();
          this.state = 'recover';
          this._timer = 0.45;
          this._cooldown = this.phase === 2 ? 0.9 : 1.5;
        }
        break;
      }

      case 'slam-tell': {
        const p = 1 - Math.max(0, this._timer) / SLAM_TELL;
        this._showRing(SLAM_RADIUS * p, p); // ring grows -- run past its edge
        this.weapon.rotation.x = -p * 1.4;
        if (this._timer <= 0) {
          this.weapon.rotation.x = 0;
          if (dist <= SLAM_RADIUS) player.takeDamage(SLAM_DAMAGE);
          this._hideRing();
          this.onSlam?.(this.mesh.position.clone(), SLAM_RADIUS);
          this.state = 'recover';
          this._timer = 0.7;
          this._cooldown = 1.6;
        }
        break;
      }

      case 'charge-tell': {
        this.mesh.rotation.y = Math.atan2(this._chargeDir.x, this._chargeDir.z);
        this._showRing(1.6, 1 - Math.max(0, this._timer) / CHARGE_TELL);
        if (this._timer <= 0) {
          this._hideRing();
          this.state = 'charging';
          this._timer = CHARGE_TIME;
          this._hitPlayerThisMove = false;
        }
        break;
      }

      case 'charging': {
        const step = CHARGE_SPEED * dt;
        const resolved = this.facility.resolveMove(
          this.mesh.position.x,
          this.mesh.position.z,
          this._chargeDir.x * step,
          this._chargeDir.z * step,
          0.8
        );
        const blocked =
          resolved.x === this.mesh.position.x && resolved.z === this.mesh.position.z;
        this.mesh.position.x = resolved.x;
        this.mesh.position.z = resolved.z;

        const distNow = this.mesh.position.distanceTo(player.position);
        if (!this._hitPlayerThisMove && distNow < 1.9) {
          this._hitPlayerThisMove = true;
          player.takeDamage(CHARGE_DAMAGE);
        }
        if (this._timer <= 0 || blocked) {
          this.state = 'recover';
          this._timer = blocked ? 1.1 : 0.6; // slamming into a wall staggers him
          this._cooldown = 1.2;
        }
        break;
      }

      case 'recover': {
        this.weapon.rotation.z += (0.25 - this.weapon.rotation.z) * Math.min(1, dt * 6);
        this.weapon.rotation.x += (0 - this.weapon.rotation.x) * Math.min(1, dt * 6);
        if (this._timer <= 0) this.state = 'idle';
        break;
      }
    }

    this._applyHitFlash(dt, this.material);
  }
}
