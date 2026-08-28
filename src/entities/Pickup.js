import * as THREE from 'three';
import { ITEMS } from '../systems/Items.js';

// A single item sitting on the floor. Bobs and spins so it's visible in the
// gloom, and registers itself as an interactable so the player has to walk over
// and press E -- roadmap item 4 (상호작용), instead of loot teleporting into
// the inventory the moment something dies.
export class Pickup {
  constructor(itemId, position, count = 1) {
    const def = ITEMS[itemId];
    this.itemId = itemId;
    this.count = count;
    this.name = def?.name ?? itemId;
    this.taken = false;
    this.interactRadius = 2.2;

    const mat = new THREE.MeshStandardMaterial({
      color: def?.color ?? 0xffffff,
      emissive: new THREE.Color(def?.color ?? 0xffffff).multiplyScalar(0.25),
      roughness: 0.6,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), mat);
    this.mesh.castShadow = true;
    this.mesh.position.copy(position);
    this.mesh.position.y = 0.5;

    // a soft glow makes ground loot findable in the gloom, without a minimap
    this.glow = new THREE.PointLight(def?.color ?? 0xffffff, 0.5, 3.5, 2);
    this.mesh.add(this.glow);

    this._t = Math.random() * Math.PI * 2;
    this._baseY = 0.5;
  }

  get position() {
    return this.mesh.position;
  }

  get promptText() {
    return this.count > 1 ? `${this.name} x${this.count} 줍기` : `${this.name} 줍기`;
  }

  update(dt) {
    this._t += dt;
    this.mesh.rotation.y += dt * 1.4;
    this.mesh.position.y = this._baseY + Math.sin(this._t * 2) * 0.09;
  }
}
