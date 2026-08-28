import * as THREE from 'three';

// A slow-moving thrown syringe. Deliberately slow: the design doc's dodge
// mechanic is "이동으로 공격 피하기", so every enemy attack has to be something
// you can physically walk out of.
export class Projectile {
  constructor(origin, direction, { speed = 9, damage = 7, life = 3, color = 0x9fe8c8 } = {}) {
    this.dir = direction.clone().setY(0).normalize();
    this.speed = speed;
    this.damage = damage;
    this.life = life;
    this.alive = true;

    const group = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.34, 6),
      new THREE.MeshStandardMaterial({ color, emissive: 0x2a6b55, roughness: 0.4 })
    );
    barrel.rotation.x = Math.PI / 2;
    group.add(barrel);
    const needle = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.16, 5),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.6 })
    );
    needle.rotation.x = Math.PI / 2;
    needle.position.z = 0.24;
    group.add(needle);

    group.position.copy(origin);
    group.position.y = 1.1;
    group.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.mesh = group;
  }

  get position() {
    return this.mesh.position;
  }

  update(dt, player, facility) {
    if (!this.alive) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }

    this.mesh.position.addScaledVector(this.dir, this.speed * dt);
    this.mesh.rotation.z += dt * 12;

    // hit the player?
    const dx = this.mesh.position.x - player.position.x;
    const dz = this.mesh.position.z - player.position.z;
    if (player.alive && Math.hypot(dx, dz) < 0.7) {
      player.takeDamage(this.damage);
      this.alive = false;
      return;
    }

    // stopped by geometry
    if (!facility.isWalkable(this.mesh.position.x, this.mesh.position.z, 0.1)) {
      this.alive = false;
    }
  }
}
