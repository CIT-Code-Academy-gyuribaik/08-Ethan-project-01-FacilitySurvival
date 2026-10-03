import * as THREE from 'three';
import { Creature } from './Creature.js';

// 기획서 4번/8번의 "너" -- the true ending's final boss. A replica of the
// player that fights by REPLAYING what you just did, a beat behind: it retraces
// your exact path and, when you swing, it swings back a moment later, as hard as
// you hit. You can only cut it down as fast as you're willing to be cut, so the
// fight is a test of nerve rather than a damage race -- swing, then step out of
// your own arc before the copy lands.
const HISTORY_SECONDS = 1.4;

// Delay between your action and the copy's. Shrinks when it's hurt.
const LAG = 0.45;
const LAG_ENRAGED = 0.28;

// Windup on the mirrored swing, on top of LAG, so there's always a readable
// window to sidestep the hit you set up.
const SWING_TELL = 0.3;
const SWING_TELL_ENRAGED = 0.2;
const SWING_RANGE = 2.7;

const ENRAGE_AT = 0.4;
const CATCHUP_MUL = 1.06; // a hair faster than you, so it can close the trail

export class Doppelganger extends Creature {
  constructor(facility, position) {
    super(facility, position, { hp: 999, speed: 5, wanderArea: 'sanctum', expValue: 0 });
    this.hostile = true;
    this.isBoss = true;
    this.name = '너';
    this.hitRadius = 0.7;
    this.enraged = false;

    this.home = new THREE.Vector3().copy(position);
    this.state = 'mirror'; // mirror | swing-tell | recover
    this._timer = 0;
    this._history = []; // { t, pos, swung }
    this._clock = 0;
    this._prevPlayerSwing = false;
    this._mirrorTarget = new THREE.Vector3().copy(position);

    this._buildMesh();
  }

  _buildMesh() {
    // the player's silhouette, gone wrong: deep blue, cracked with red light,
    // and just slightly mis-proportioned -- limbs a little too long, so even
    // standing still it doesn't quite read as human.
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1c2c48, roughness: 0.7, emissive: 0x3a0a12, emissiveIntensity: 0.6,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), this.bodyMat);
    body.position.y = 0.95;
    body.rotation.x = 0.1;
    body.castShadow = true;
    this.mesh.add(body);

    // overlong arms, hanging past where a human's would
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 1.15, 4, 8), this.bodyMat);
      arm.position.set(sx * 0.4, 0.55, 0.05);
      arm.rotation.z = sx * 0.12;
      this.mesh.add(arm);
    }
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.85, 4, 8), this.bodyMat);
      leg.position.set(sx * 0.14, 0.05, 0);
      this.mesh.add(leg);
    }

    const headMat = new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 1 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), headMat);
    head.position.set(0, 1.63, 0.05);
    this.mesh.add(head);

    // fractured-glass shards over the head -- a face that's a broken reflection
    // rather than a face
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x223047, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.55,
    });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 3), shardMat);
      shard.position.set(Math.cos(a) * 0.24, 1.66 + Math.sin(a) * 0.1, 0.1 + Math.sin(a) * 0.15);
      shard.rotation.set(Math.random(), Math.random(), Math.random());
      this.mesh.add(shard);
    }

    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffdddd });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), this.eyeMat);
      eye.position.set(sx * 0.1, 1.66, 0.26);
      this.mesh.add(eye);
    }

    // a tattered cloak of torn strips instead of a solid cape -- reads as
    // "coming apart" rather than "wearing armor" like the commander's
    const cloakMat = new THREE.MeshStandardMaterial({
      color: 0x0e1420, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.85,
    });
    this.cloakStrips = [];
    for (let i = -2; i <= 2; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.0 + Math.random() * 0.3), cloakMat);
      strip.position.set(i * 0.15, 0.7, -0.32);
      strip.rotation.x = 0.2;
      this.mesh.add(strip);
      this.cloakStrips.push({ mesh: strip, phase: Math.random() * 10 });
    }

    this.weapon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a6f75, roughness: 0.5, metalness: 0.5 })
    );
    this.weapon.position.set(0.42, 0.95, 0.25);
    this.weapon.rotation.set(Math.PI / 2.4, 0, 0.3);
    this.mesh.add(this.weapon);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3344, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.ring.visible = false;
    this.mesh.add(this.ring);

    this.aura = new THREE.PointLight(0xff3344, 0.5, 8, 2);
    this.aura.position.y = 1.4;
    this.mesh.add(this.aura);

    this._baseEmissive = 0x3a0a12;
  }

  get _lag() {
    return this.enraged ? LAG_ENRAGED : LAG;
  }

  get _swingTell() {
    return this.enraged ? SWING_TELL_ENRAGED : SWING_TELL;
  }

  _enrage() {
    this.enraged = true;
    this.speed *= 1.12;
    this.bodyMat.emissive.setHex(0xff1e2e);
    this.aura.intensity = 1.4;
    this.onEnrage?.(this);
  }

  _face(player) {
    this.mesh.rotation.y = Math.atan2(
      player.position.x - this.mesh.position.x,
      player.position.z - this.mesh.position.z
    );
  }

  // The sample from `_lag` seconds ago -- what the player was doing then.
  _sampleFromPast() {
    const cutoff = this._clock - this._lag;
    let chosen = this._history[0];
    for (const s of this._history) {
      if (s.t <= cutoff) chosen = s;
      else break;
    }
    return chosen;
  }

  update(dt, player) {
    if (!this.alive) return;

    this._clock += dt;
    this._timer -= dt;

    // record the player's state this frame
    const didSwing = player.attackWindowTimer > 0 && !this._prevPlayerSwing;
    this._prevPlayerSwing = player.attackWindowTimer > 0;
    this._history.push({ t: this._clock, pos: player.position.clone(), swung: didSwing });
    while (this._history.length > 2 && this._history[0].t < this._clock - HISTORY_SECONDS) {
      this._history.shift();
    }

    if (!this.enraged && this.hp <= this.maxHp * ENRAGE_AT) this._enrage();

    // pulse the red seams so it never reads as inert
    this.bodyMat.emissiveIntensity = 0.5 + Math.sin(this._clock * 4) * 0.2;
    // cloak strips drift independently, like something moving in dead air
    for (const s of this.cloakStrips) {
      s.mesh.rotation.z = Math.sin(this._clock * 1.6 + s.phase) * 0.12;
    }

    const past = this._sampleFromPast();
    const dist = this.mesh.position.distanceTo(player.position);

    switch (this.state) {
      case 'mirror': {
        this._face(player);
        // retrace the path the player walked a beat ago
        this._mirrorTarget.copy(past.pos);
        if (this.mesh.position.distanceTo(this._mirrorTarget) > 0.2) {
          this._moveToward(this._mirrorTarget, dt, CATCHUP_MUL);
          this._face(player);
        }
        if (past.swung && dist <= SWING_RANGE + 1.2) {
          this.state = 'swing-tell';
          this._timer = this._swingTell;
          this.ring.visible = true;
        }
        break;
      }

      case 'swing-tell': {
        this._face(player);
        const p = 1 - Math.max(0, this._timer) / this._swingTell;
        this.ring.scale.setScalar(SWING_RANGE);
        this.ringMat.opacity = 0.2 + p * 0.5;
        this.weapon.rotation.z = 0.3 - p * 2.2;
        this.aura.intensity = 0.5 + p * 2;
        if (this._timer <= 0) {
          this.weapon.rotation.z = 1.7;
          this.ring.visible = false;
          this.aura.intensity = this.enraged ? 1.4 : 0.5;
          const to = new THREE.Vector3().subVectors(player.position, this.mesh.position).setY(0);
          const forward = new THREE.Vector3(
            Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y)
          );
          if (to.length() <= SWING_RANGE && forward.dot(to.normalize()) > 0.1) {
            // hits exactly as hard as the player does -- the whole point
            player.takeDamage(Math.max(12, player.attackDamage));
          }
          this.state = 'recover';
          this._timer = this.enraged ? 0.25 : 0.45;
        }
        break;
      }

      case 'recover': {
        this._face(player);
        this.weapon.rotation.z += (0.3 - this.weapon.rotation.z) * Math.min(1, dt * 8);
        if (this._timer <= 0) this.state = 'mirror';
        break;
      }
    }

    this._applyHitFlash(dt, this.bodyMat);
  }
}
