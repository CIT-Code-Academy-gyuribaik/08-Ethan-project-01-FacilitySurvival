import * as THREE from 'three';

const MAX_HP = 100;
const MAX_HUNGER = 100;
const HUNGER_DRAIN_PER_SEC = 0.55; // ~180s to starve from full
const HP_REGEN_PER_SEC = 1.2; // only while hunger > 0
const STARVING_HP_DRAIN_PER_SEC = 2;
const MOVE_SPEED = 5;
const ATTACK_COOLDOWN = 0.5;
const ATTACK_WINDOW = 0.18; // how long the hit stays "live" after pressing attack
const ATTACK_RANGE = 2.3;
const INVULN_AFTER_HIT = 0.4; // brief i-frames so a pack can't stunlock you

// "이름 없음 / 특별한 능력 없음" per the design doc -- a plain human with hp,
// hunger, and an inventory. The one thing that grows is the level: kills give
// exp, levels give damage and max hp, which is the design doc's answer to
// "게임이 어려워지니 강해져야 한다".
export class Player {
  constructor(facility, spawnPos) {
    this.facility = facility;
    // Wired from outside: CombatSystem sets onAttack, main.js sets onLevelUp.
    // Deliberately NOT cleared by reset() -- restarting a run must not silently
    // unhook the player's own attack.
    this.onAttack = null;
    this.onLevelUp = null;
    this._buildMesh();
    this.reset(spawnPos);
  }

  reset(spawnPos) {
    this.maxHp = MAX_HP;
    this.hp = MAX_HP;
    this.maxHunger = MAX_HUNGER;
    this.hunger = MAX_HUNGER;
    this.inventory = []; // { id, name, count }
    this.alive = true;

    this.level = 1;
    this.exp = 0;
    this.expToNext = 30;

    this.attackCooldownTimer = 0;
    this.attackWindowTimer = 0;
    this.attackRange = ATTACK_RANGE;
    this.attackDamage = 15;
    this.invulnTimer = 0;

    this.facingAngle = 0;
    if (spawnPos) this.mesh.position.copy(spawnPos);
    this.mesh.rotation.y = 0;
  }

  _buildMesh() {
    const group = new THREE.Group();

    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), this.bodyMat);
    body.position.y = 0.95;
    body.castShadow = true;
    group.add(body);

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0b090, roughness: 0.9 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), skinMat);
    head.position.y = 1.65;
    head.castShadow = true;
    group.add(head);

    // forward indicator so facing reads clearly in third person
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.15, 6),
      new THREE.MeshStandardMaterial({ color: 0xc98a68 })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.65, 0.28);
    group.add(nose);

    // the improvised weapon -- a pipe. Swings when attacking.
    this.weapon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a8f95, roughness: 0.5, metalness: 0.5 })
    );
    this.weapon.position.set(0.42, 0.95, 0.25);
    this.weapon.rotation.set(Math.PI / 2.4, 0, 0.3);
    this.weapon.castShadow = true;
    group.add(this.weapon);

    this.mesh = group;
  }

  get position() {
    return this.mesh.position;
  }

  get isStarving() {
    return this.hunger <= 0;
  }

  // ---- inventory --------------------------------------------------------

  addItem(id, name, count = 1) {
    const existing = this.inventory.find((i) => i.id === id);
    if (existing) existing.count += count;
    else this.inventory.push({ id, name, count });
  }

  hasItem(id) {
    return this.inventory.some((i) => i.id === id);
  }

  countOf(id) {
    return this.inventory.find((i) => i.id === id)?.count ?? 0;
  }

  consumeItem(id, count = 1) {
    const item = this.inventory.find((i) => i.id === id);
    if (!item || item.count < count) return false;
    item.count -= count;
    if (item.count <= 0) this.inventory = this.inventory.filter((i) => i !== item);
    return true;
  }

  eat(id, restoreAmount) {
    if (!this.consumeItem(id, 1)) return false;
    this.hunger = Math.min(this.maxHunger, this.hunger + restoreAmount);
    return true;
  }

  // ---- growth -----------------------------------------------------------

  gainExp(amount) {
    this.exp += amount;
    while (this.exp >= this.expToNext) {
      this.exp -= this.expToNext;
      this._levelUp();
    }
  }

  _levelUp() {
    this.level += 1;
    this.maxHp += 10;
    this.hp = this.maxHp; // levelling heals -- a small reward for hunting
    this.attackDamage += 3;
    this.expToNext = Math.round(this.expToNext * 1.45);
    this.onLevelUp?.(this.level);
  }

  applyBoost(def) {
    if (def.attack) this.attackDamage += def.attack;
    if (def.maxHp) {
      this.maxHp += def.maxHp;
      this.hp = Math.min(this.maxHp, this.hp + def.maxHp);
    }
  }

  // ---- combat -----------------------------------------------------------

  takeDamage(amount, { ignoreInvuln = false } = {}) {
    if (!this.alive) return false;
    if (!ignoreInvuln && this.invulnTimer > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (!ignoreInvuln) this.invulnTimer = INVULN_AFTER_HIT;
    if (this.hp <= 0) this.alive = false;
    return true;
  }

  update(dt, input, camera) {
    if (!this.alive) return;

    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    // flash the body while invulnerable so hits are readable
    this.bodyMat.emissive.setHex(this.invulnTimer > 0 ? 0x552222 : 0x000000);

    // --- hunger / hp ticking ---
    this.hunger = Math.max(0, this.hunger - HUNGER_DRAIN_PER_SEC * dt);
    if (this.isStarving) {
      this.takeDamage(STARVING_HP_DRAIN_PER_SEC * dt, { ignoreInvuln: true });
    } else {
      this.hp = Math.min(this.maxHp, this.hp + HP_REGEN_PER_SEC * dt);
    }
    if (this.hp <= 0) {
      this.alive = false;
      return;
    }

    // --- movement, relative to camera yaw so WASD stays consistent ---
    const move = input.moveVector;
    if (move.x !== 0 || move.z !== 0) {
      const camYaw = Math.atan2(
        camera.position.x - this.mesh.position.x,
        camera.position.z - this.mesh.position.z
      );
      const forward = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw)).negate();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);

      const dir = new THREE.Vector3();
      dir.addScaledVector(forward, -move.z);
      dir.addScaledVector(right, move.x);
      if (dir.lengthSq() > 0) {
        dir.normalize();
        const resolved = this.facility.resolveMove(
          this.mesh.position.x,
          this.mesh.position.z,
          dir.x * MOVE_SPEED * dt,
          dir.z * MOVE_SPEED * dt
        );
        this.mesh.position.x = resolved.x;
        this.mesh.position.z = resolved.z;
        this.facingAngle = Math.atan2(dir.x, dir.z);
        this.mesh.rotation.y = this.facingAngle;
      }
    }

    // --- attack ---
    if (this.attackCooldownTimer > 0) this.attackCooldownTimer -= dt;
    if (input.attackPressed && this.attackCooldownTimer <= 0) {
      this.attackCooldownTimer = ATTACK_COOLDOWN;
      this.attackWindowTimer = ATTACK_WINDOW;
    }
    if (this.attackWindowTimer > 0) {
      this.attackWindowTimer -= dt;
      this.onAttack?.();
    }

    // swing animation driven off the cooldown timer
    const swing = Math.max(0, this.attackCooldownTimer / ATTACK_COOLDOWN);
    this.weapon.rotation.x = Math.PI / 2.4 - Math.sin(swing * Math.PI) * 1.5;
  }
}
