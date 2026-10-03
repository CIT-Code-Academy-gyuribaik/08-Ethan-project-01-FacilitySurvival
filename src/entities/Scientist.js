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

    // coat split at the front, hanging open -- two thin panels instead of one
    // sealed capsule so the silhouette reads as a coat, not a robe
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xd6d3c8, roughness: 0.9 });
    for (const sx of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.04), panelMat);
      panel.position.set(sx * 0.13, 0.7, 0.3);
      this.mesh.add(panel);
    }

    // collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 6, 12, Math.PI), coatMat);
    collar.rotation.x = Math.PI;
    collar.position.set(0, 1.32, 0.05);
    this.mesh.add(collar);

    // an ID badge clipped to the pocket -- a "person who used to work here" detail
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.13, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x3a6ea5, emissive: 0x0c1a2a, roughness: 0.4 })
    );
    badge.position.set(0.16, 1.05, 0.34);
    this.mesh.add(badge);

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8b494, roughness: 0.9 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), skinMat);
    head.position.y = 1.6;
    head.castShadow = true;
    this.mesh.add(head);

    // a cap of hair -- without it the sphere head reads as bald from every angle
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0x3a332c, roughness: 1 })
    );
    hair.position.y = 1.66;
    this.mesh.add(hair);

    // blank reflective goggles -- reads as "not going to talk to you"
    this.goggleMat = new THREE.MeshStandardMaterial({
      color: 0x101418, emissive: 0x224455, roughness: 0.2, metalness: 0.7,
    });
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.1), this.goggleMat);
    goggles.position.set(0, 1.63, 0.23);
    this.mesh.add(goggles);
    // strap around the back of the head so the goggles don't float
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.015, 6, 12), this.goggleMat);
    strap.rotation.y = Math.PI / 2;
    strap.position.set(0, 1.63, 0);
    this.mesh.add(strap);

    // gloved hands
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0xcbead8, roughness: 0.6 });
    const offHand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), gloveMat);
    offHand.position.set(-0.32, 1.0, 0.15);
    this.mesh.add(offHand);

    // the syringe they're about to throw
    this.hand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0x9fe8c8, emissive: 0x2a6b55 })
    );
    this.hand.rotation.x = Math.PI / 2;
    this.hand.position.set(0.34, 1.05, 0.2);
    this.mesh.add(this.hand);
    const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 5), gloveMat);
    plunger.rotation.x = Math.PI / 2;
    plunger.position.set(0.34, 1.05, 0.37);
    this.mesh.add(plunger);
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
