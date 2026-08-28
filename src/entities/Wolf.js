import * as THREE from 'three';
import { Creature } from './Creature.js';
import { furTexture } from '../world/Textures.js';

const AGGRO_RADIUS = 10;
const ATTACK_RADIUS = 1.5;
const ATTACK_COOLDOWN = 1.1;
const LUNGE_TELL = 0.35; // it freezes and crouches before biting -- your cue to move

// "늑대(?) - 진짜 늑대는 아님": reads as a wolf-shaped threat but it's a thing
// the facility made. Both the main danger of chapter 1 and a food source.
export class Wolf extends Creature {
  constructor(facility, position, tier = 1) {
    super(facility, position, {
      hp: 40 + (tier - 1) * 18,
      speed: 3.4,
      wanderArea: 'hall',
      expValue: 12 + (tier - 1) * 6,
    });
    this.tier = tier;
    this.hostile = true;
    this.damage = 8 + (tier - 1) * 3;
    this.lootId = 'wolf-meat';
    this.lootName = '수상한 고기';
    this._attackCooldown = 0;
    this._tellTimer = 0;
    this._buildMesh();
  }

  _buildMesh() {
    // higher tiers are visibly paler/sicker so you can read the threat at a glance
    const shades = ['#4a4238', '#5a4a4a', '#6b4a52'];
    const mat = new THREE.MeshStandardMaterial({
      map: furTexture(shades[Math.min(this.tier - 1, shades.length - 1)]),
      roughness: 1,
    });
    this.material = mat;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), mat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.5;
    body.castShadow = true;
    this.mesh.add(body);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 8), mat);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.55, 0.55);
    head.castShadow = true;
    this.mesh.add(head);

    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 5), mat);
      leg.position.set(sx * 0.2, 0.25, 0.25);
      this.mesh.add(leg);
      const back = leg.clone();
      back.position.set(sx * 0.2, 0.25, -0.3);
      this.mesh.add(back);
    }

    // red eyeshine -- the "not a real wolf" tell
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2222 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), this.eyeMat);
      eye.position.set(sx * 0.1, 0.6, 0.78);
      this.mesh.add(eye);
    }
  }

  update(dt, player) {
    if (!this.alive) return;
    this._attackCooldown = Math.max(0, this._attackCooldown - dt);

    const dist = this.mesh.position.distanceTo(player.position);

    if (this._tellTimer > 0) {
      // wind-up: hold still, crouch, then bite if the player is still in range
      this._tellTimer -= dt;
      this.mesh.position.y = -0.08;
      this.eyeMat.emissive.setHex(0xff8800);
      if (this._tellTimer <= 0) {
        this.mesh.position.y = 0;
        this.eyeMat.emissive.setHex(0xff2222);
        if (this.mesh.position.distanceTo(player.position) <= ATTACK_RADIUS + 0.4) {
          player.takeDamage(this.damage);
        }
      }
    } else if (dist <= AGGRO_RADIUS && player.alive) {
      this.state = 'chase';
      if (dist > ATTACK_RADIUS) {
        this._moveToward(player.position, dt, 1);
      } else if (this._attackCooldown <= 0) {
        this._attackCooldown = ATTACK_COOLDOWN;
        this._tellTimer = LUNGE_TELL;
      }
    } else {
      this.state = 'wander';
      this._wander(dt);
    }

    this._applyHitFlash(dt, this.material);
  }
}
