import * as THREE from 'three';
import { ITEMS } from '../systems/Items.js';

// A shape per item so ground loot reads as "food" / "card" / "vial" / "document"
// / "artifact" at a glance instead of every item being the same glowing cube.
function buildGeometry(itemId, def) {
  if (def?.kind === 'food') return new THREE.CylinderGeometry(0.16, 0.16, 0.26, 14); // tin/can
  if (def?.kind === 'key') return new THREE.BoxGeometry(0.32, 0.42, 0.03); // keycard
  if (def?.kind === 'boost') return new THREE.CapsuleGeometry(0.08, 0.28, 4, 8); // syringe/vial
  if (itemId === 'research-log' || itemId === 'facility-file') return new THREE.BoxGeometry(0.3, 0.06, 0.4); // document
  return new THREE.OctahedronGeometry(0.22); // strange-material and anything else quest-flavored
}

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
      roughness: def?.kind === 'key' || def?.kind === 'boost' ? 0.3 : 0.6,
      metalness: def?.kind === 'key' ? 0.4 : 0,
    });
    this.mesh = new THREE.Mesh(buildGeometry(itemId, def), mat);
    // cards/docs lie roughly flat, everything else stands upright
    if (def?.kind === 'key') this.mesh.rotation.x = Math.PI / 2.3;
    if (itemId === 'research-log' || itemId === 'facility-file') this.mesh.rotation.x = -0.15;
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
