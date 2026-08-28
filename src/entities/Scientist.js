import * as THREE from 'three';
import { Creature } from './Creature.js';
import { Projectile } from './Projectile.js';

const AGGRO_RADIUS = 18;
const PREFERRED_RANGE = 8; // kites: backs off if you close in, advances if you run
const THROW_COOLDOWN = 2.2;
const THROW_TELL = 0.55;

// "과학자 - 출구를 찾은 뒤 나타나는 적" (기획서 4번). The facility's staff,
// still doing their job. They keep their distance and throw sedative syringes,
// so chapter 2 asks a different question than chapter 1's melee wolves: close
// the gap without eating a dart.
export class Scientist extends Creature {
  constructor(facility, position, { onProjectile } = {}) {
    super(facility, position, { hp: 55, speed: 2.9, wanderArea: 'arena', expValue: 25 });
    this.hostile = true;
    this.damage = 9;
    this.onProjectile = onProjectile;
    this._cooldown = Math.random() * THROW_COOLDOWN;
    this._tellTimer = 0;
    this._buildMesh();
  }

  _buildMesh() {
    // lab coat
    const coatMat = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.85 });
    this.material = coatMat;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.85, 4, 8), coatMat);
    body.position.y = 0.92;
    body.castShadow = true;
    this.mesh.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8b494, roughness: 0.9 })
    );
    head.position.y = 1.6;
    head.castShadow = true;
    this.mesh.add(head);

    // blank reflective goggles -- reads as "not going to talk to you"
    this.goggleMat = new THREE.MeshStandardMaterial({
      color: 0x101418, emissive: 0x224455, roughness: 0.2, metalness: 0.7,
    });
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.1), this.goggleMat);
    goggles.position.set(0, 1.63, 0.23);
    this.mesh.add(goggles);

    // the syringe they're about to throw
    this.hand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0x9fe8c8, emissive: 0x2a6b55 })
    );
    this.hand.rotation.x = Math.PI / 2;
    this.hand.position.set(0.34, 1.05, 0.2);
    this.mesh.add(this.hand);
  }

  update(dt, player) {
    if (!this.alive) return;
    this._cooldown = Math.max(0, this._cooldown - dt);

    const dist = this.mesh.position.distanceTo(player.position);

    if (this._tellTimer > 0) {
      // wind-up: stand still, goggles flare. Player's window to break line of sight.
      this._tellTimer -= dt;
      this.goggleMat.emissive.setHex(0xff5522);
      this.mesh.lookAt(player.position.x, this.mesh.position.y, player.position.z);
      if (this._tellTimer <= 0) {
        this.goggleMat.emissive.setHex(0x224455);
        const dir = new THREE.Vector3().subVectors(player.position, this.mesh.position);
        this.onProjectile?.(
          new Projectile(this.mesh.position, dir, { damage: this.damage })
        );
      }
    } else if (dist <= AGGRO_RADIUS && player.alive) {
      this.state = 'fight';
      if (dist < PREFERRED_RANGE - 2) {
        this._fleeFrom(player.position, dt, 1); // too close, back away
      } else if (dist > PREFERRED_RANGE + 2) {
        this._moveToward(player.position, dt, 1);
      }
      this.mesh.lookAt(player.position.x, this.mesh.position.y, player.position.z);
      if (this._cooldown <= 0) {
        this._cooldown = THROW_COOLDOWN;
        this._tellTimer = THROW_TELL;
      }
    } else {
      this.state = 'wander';
      this._wander(dt);
    }

    this._applyHitFlash(dt, this.material);
  }
}
