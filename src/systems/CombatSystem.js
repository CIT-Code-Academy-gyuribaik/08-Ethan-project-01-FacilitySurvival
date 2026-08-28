import * as THREE from 'three';

// Owns "who can hit whom" for the player's swing, so Player and the various
// Creature subclasses don't each need to know about the others. Enemies deal
// their own damage inside their update() -- only the player's attack is
// arbitrated here, because only it needs a shared target list.
export class CombatSystem {
  constructor(player, enemies, { onHit, onKill } = {}) {
    this.player = player;
    this.enemies = enemies; // live array reference, shared with main.js
    this.onHit = onHit;
    this.onKill = onKill;
    this._swingResolved = false;

    player.onAttack = () => this._resolvePlayerAttack();
  }

  _resolvePlayerAttack() {
    // Only one hit per swing, registered on the first live frame.
    if (this._swingResolved) return;
    this._swingResolved = true;

    const forward = new THREE.Vector3(
      Math.sin(this.player.facingAngle),
      0,
      Math.cos(this.player.facingAngle)
    );

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const toEnemy = new THREE.Vector3().subVectors(enemy.position, this.player.position);
      toEnemy.y = 0;
      const dist = toEnemy.length();
      // big enemies (the commander) are hittable from further out than their centre
      const reach = this.player.attackRange + (enemy.hitRadius ?? (enemy.isBoss ? 0.9 : 0.35));
      if (dist > reach) continue;
      toEnemy.normalize();
      if (forward.dot(toEnemy) < 0.35) continue; // ~120 degree forward cone

      enemy.takeDamage(this.player.attackDamage);
      this.onHit?.(enemy);
      if (!enemy.alive) {
        this.player.gainExp(enemy.expValue ?? 0);
        this.onKill?.(enemy);
      }
    }
  }

  update() {
    if (this.player.attackWindowTimer <= 0) this._swingResolved = false;
  }
}
