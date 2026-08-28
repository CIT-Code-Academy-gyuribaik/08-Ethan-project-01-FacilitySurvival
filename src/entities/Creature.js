import * as THREE from 'three';

// Shared base for every non-player actor: the wolf/deer of chapter 1 and the
// scientist/commander of chapter 2. Handles wandering, hp, hit feedback, and
// death. Subclasses supply the mesh and their own aggro behaviour.
export class Creature {
  constructor(facility, position, { hp = 30, speed = 2.2, wanderArea = 'hall', expValue = 0 } = {}) {
    this.facility = facility;
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.wanderArea = wanderArea;
    this.expValue = expValue;
    this.alive = true;
    this.state = 'wander';
    this.hostile = false; // does this thing attack the player?
    this.lootId = null;
    this.lootName = null;

    this._wanderTarget = null;
    this._wanderTimer = 0;
    this._hitFlashTimer = 0;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);
  }

  get position() {
    return this.mesh.position;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    this._hitFlashTimer = 0.15;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onDeath?.(this);
    }
  }

  _pickWanderTarget() {
    this._wanderTarget = this.facility.randomPointIn(this.wanderArea);
    this._wanderTimer = THREE.MathUtils.randFloat(2, 5);
  }

  // Steps toward `target`, sliding along walls. Returns the distance that was
  // remaining before the step.
  _moveToward(target, dt, speedMul = 1) {
    const dx = target.x - this.mesh.position.x;
    const dz = target.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) return dist;
    const step = Math.min(dist, this.speed * speedMul * dt);
    const resolved = this.facility.resolveMove(
      this.mesh.position.x,
      this.mesh.position.z,
      (dx / dist) * step,
      (dz / dist) * step,
      0.5
    );
    // If we're wedged against a corner, drop the current target so the wander
    // logic picks a new one instead of grinding into the wall forever.
    if (resolved.x === this.mesh.position.x && resolved.z === this.mesh.position.z) {
      this._wanderTimer = 0;
    }
    this.mesh.position.x = resolved.x;
    this.mesh.position.z = resolved.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
    return dist;
  }

  _wander(dt) {
    this._wanderTimer -= dt;
    if (!this._wanderTarget || this._wanderTimer <= 0) this._pickWanderTarget();
    this._moveToward(this._wanderTarget, dt, 0.5);
  }

  _fleeFrom(position, dt, speedMul = 1) {
    const dx = this.mesh.position.x - position.x;
    const dz = this.mesh.position.z - position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const target = new THREE.Vector3(
      this.mesh.position.x + (dx / dist) * 5,
      0,
      this.mesh.position.z + (dz / dist) * 5
    );
    this._moveToward(target, dt, speedMul);
  }

  // Subclasses call this at the end of update() for the "flash red when hit" feedback.
  _applyHitFlash(dt, material) {
    if (this._hitFlashTimer > 0) {
      this._hitFlashTimer -= dt;
      material.emissive?.setHex(0x662222);
    } else if (this._baseEmissive !== undefined) {
      material.emissive?.setHex(this._baseEmissive);
    } else {
      material.emissive?.setHex(0x000000);
    }
  }
}
