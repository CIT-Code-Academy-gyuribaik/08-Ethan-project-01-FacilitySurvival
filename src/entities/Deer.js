import * as THREE from 'three';
import { Creature } from './Creature.js';
import { furTexture } from '../world/Textures.js';

const FLEE_RADIUS = 7;

// "사슴(?) - 진짜 사슴은 아님": a pure food source. Never attacks -- the design
// doc explicitly wanted the reference game's deer NOT to hunt you. It just bolts,
// which makes it the risk-free but harder-to-catch meal.
export class Deer extends Creature {
  constructor(facility, position) {
    super(facility, position, { hp: 20, speed: 4.2, wanderArea: 'hall', expValue: 5 });
    this.lootId = 'deer-meat';
    this.lootName = '살점';
    this._buildMesh();
  }

  _buildMesh() {
    const mat = new THREE.MeshStandardMaterial({ map: furTexture('#a0805a'), roughness: 1 });
    this.material = mat;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 4, 8), mat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.62;
    body.castShadow = true;
    this.mesh.add(body);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.45, 6), mat);
    neck.position.set(0, 0.85, 0.32);
    neck.rotation.x = 0.5;
    this.mesh.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), mat);
    head.position.set(0, 1.02, 0.48);
    head.castShadow = true;
    this.mesh.add(head);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.18, 8), mat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.96, 0.62);
    this.mesh.add(muzzle);

    // wide, alert ears -- a prey animal's tell, always turned toward the threat
    const earMat = mat;
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), earMat);
      ear.position.set(sx * 0.16, 1.16, 0.42);
      ear.rotation.set(0.2, 0, sx * 0.9);
      this.mesh.add(ear);
    }

    // short, flicking tail
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), mat);
    tail.scale.set(1, 1, 0.7);
    tail.position.set(0, 0.68, -0.34);
    this.mesh.add(tail);

    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.62, 5), mat);
      leg.position.set(sx * 0.17, 0.31, 0.22);
      this.mesh.add(leg);
      const back = leg.clone();
      back.position.set(sx * 0.17, 0.31, -0.28);
      this.mesh.add(back);
    }

    // branched antlers instead of bare cones -- two prongs each side so the
    // silhouette reads as antlers and not thorns
    const antlerMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.85 });
    for (const sx of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.3, 5), antlerMat);
      beam.position.set(sx * 0.1, 1.24, 0.42);
      beam.rotation.z = sx * 0.35;
      beam.rotation.x = -0.15;
      this.mesh.add(beam);
      const tine = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.15, 5), antlerMat);
      tine.position.set(sx * 0.17, 1.34, 0.36);
      tine.rotation.z = sx * 0.9;
      this.mesh.add(tine);
    }

    // a few pale spots on the flank -- distinguishes it from the wolf's fur at a glance
    const spotMat = new THREE.MeshStandardMaterial({ color: 0xd8c6a0, roughness: 1 });
    for (const [sx, sy, sz] of [[0.2, 0.7, 0.05], [-0.22, 0.62, -0.1], [0.15, 0.6, -0.2]]) {
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.055, 8), spotMat);
      spot.position.set(sx, sy, sz);
      spot.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.mesh.add(spot);
    }
  }

  update(dt, player) {
    if (!this.alive) return;
    const dist = this.mesh.position.distanceTo(player.position);

    if (dist <= FLEE_RADIUS) {
      this.state = 'flee';
      this._fleeFrom(player.position, dt, 1);
    } else {
      this.state = 'wander';
      this._wander(dt);
    }

    this._applyHitFlash(dt, this.material);
  }
}
