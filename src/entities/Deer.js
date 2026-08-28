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

    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 5), mat);
      leg.position.set(sx * 0.17, 0.31, 0.22);
      this.mesh.add(leg);
      const back = leg.clone();
      back.position.set(sx * 0.17, 0.31, -0.28);
      this.mesh.add(back);
    }

    const antlerMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a });
    for (const sx of [-1, 1]) {
      const antler = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.26, 5), antlerMat);
      antler.position.set(sx * 0.09, 1.2, 0.44);
      antler.rotation.z = sx * 0.3;
      this.mesh.add(antler);
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
