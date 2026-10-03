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
    const scale = 1 + (this.tier - 1) * 0.12; // alphas read as physically bigger, not just recolored
    const mat = new THREE.MeshStandardMaterial({
      map: furTexture(shades[Math.min(this.tier - 1, shades.length - 1)]),
      roughness: 1,
    });
    this.material = mat;
    this.mesh.scale.setScalar(scale);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), mat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.5;
    body.castShadow = true;
    this.mesh.add(body);

    // haunches -- without them the capsule body reads as a sausage from the side
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), mat);
    hip.scale.set(1, 1.1, 0.85);
    hip.position.set(0, 0.5, -0.42);
    hip.castShadow = true;
    this.mesh.add(hip);

    // snout as its own cone in front of the head so the muzzle actually projects
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat);
    head.position.set(0, 0.58, 0.42);
    head.castShadow = true;
    this.mesh.add(head);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 8), mat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.5, 0.68);
    this.mesh.add(snout);

    // a visible jaw of teeth -- reads as a threat in the dark even before it lunges
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 4), toothMat);
      tooth.rotation.x = Math.PI;
      tooth.position.set(sx * 0.06, 0.42, 0.78);
      this.mesh.add(tooth);
    }

    // ears -- pinned back for a hostile silhouette
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 5), mat);
      ear.position.set(sx * 0.14, 0.78, 0.36);
      ear.rotation.set(-0.3, 0, sx * 0.35);
      this.mesh.add(ear);
    }

    // tail, low and stiff -- a wolf that isn't wagging it
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 6), mat);
    tail.rotation.x = Math.PI / 2.6;
    tail.position.set(0, 0.5, -0.72);
    this.mesh.add(tail);

    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.5, 5), mat);
      leg.position.set(sx * 0.2, 0.25, 0.25);
      this.mesh.add(leg);
      const back = leg.clone();
      back.position.set(sx * 0.2, 0.25, -0.3);
      this.mesh.add(back);
    }

    // tier 3 (alpha): a ridge of spine spikes down the back so it's identifiable
    // as the dangerous one at a glance, not just a stat difference
    if (this.tier >= 3) {
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), spikeMat);
        spike.position.set(0, 0.78, 0.3 - i * 0.22);
        this.mesh.add(spike);
      }
    }

    // red eyeshine -- the "not a real wolf" tell
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2222 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), this.eyeMat);
      eye.position.set(sx * 0.1, 0.6, 0.6);
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
