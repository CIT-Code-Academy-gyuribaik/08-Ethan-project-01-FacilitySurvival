import * as THREE from 'three';
import { Creature } from './Creature.js';
import { metalTexture } from '../world/Textures.js';

const AGGRO_RADIUS = 13;
const ATTACK_RADIUS = 1.9; // staff reach -- longer than a wolf's bite
const ATTACK_COOLDOWN = 1.4;
const SWING_TELL = 0.5; // longer wind-up than the wolf's -- this is meant to be a fair fight, not a gank
const ENRAGE_AT = 0.5;
const ENRAGE_COOLDOWN_MUL = 0.72;

// "문지기" -- 두 번째 기획서(4번)의 "commander"(로브를 입은 사람, 미니보스).
// 최종 보스 project 0003("head commander")과는 다른 캐릭터다. 실험실에서
// 출입 카드를 지키고 서 있다가, 쓰러뜨리면 카드를 떨군다 -- 카드가 더는
// 바닥에 그냥 놓여 있지 않고, 처음으로 시설 밖으로 나가려면 반드시 한 번은
// 이겨야 하는 관문이 됐다.
export class Gatekeeper extends Creature {
  constructor(facility, position) {
    super(facility, position, { hp: 180, speed: 3, wanderArea: 'lab', expValue: 40 });
    this.hostile = true;
    this.isMiniBoss = true;
    this.hitRadius = 0.75;
    this.name = '문지기';
    this.lootId = 'keycard';
    this.lootName = '출입 카드';
    this.damage = 14;
    this.enraged = false;
    this._attackCooldown = 0.8; // 등장하자마자 얻어맞지는 않게 약간의 유예
    this._tellTimer = 0;
    this._buildMesh();
  }

  _buildMesh() {
    this.mesh.scale.setScalar(1.15); // 늑대보다 한눈에 크게 -- 보스라는 실루엣

    this.material = new THREE.MeshStandardMaterial({ color: 0x3a1f28, roughness: 0.85 });
    // 아래로 갈수록 넓어지는 로브 -- 사람이 아니라 그림자가 서 있는 것처럼
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 1.3, 10), this.material);
    robe.position.y = 0.85;
    robe.castShadow = true;
    this.mesh.add(robe);

    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.4, 4, 8), this.material);
    chest.position.y = 1.55;
    chest.castShadow = true;
    this.mesh.add(chest);

    // 후드 -- 앞을 살짝 가리게 잘라내서 안이 비어 보이게. 얼굴은 그냥 어두운 원판.
    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.75),
      this.material
    );
    hood.position.y = 1.95;
    hood.rotation.x = 0.15;
    this.mesh.add(hood);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 12),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 })
    );
    face.position.set(0, 1.9, 0.24);
    this.mesh.add(face);

    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0x660000 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), this.eyeMat);
      eye.position.set(sx * 0.07, 1.92, 0.32);
      this.mesh.add(eye);
    }

    // 허리춤의 열쇠 꾸러미 -- 뭘 지키고 있는지 몸으로 말해주는 디테일
    const trimMat = new THREE.MeshStandardMaterial({
      map: metalTexture(), color: 0xb8a45c, roughness: 0.4, metalness: 0.7,
    });
    for (let i = 0; i < 3; i++) {
      const key = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 10), trimMat);
      key.position.set(0.28, 1.05 - i * 0.09, 0.22);
      key.rotation.y = Math.PI / 2;
      this.mesh.add(key);
    }

    // 지팡이 -- 예비동작에서 머리 부분이 붉게 달아오른다
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6, metalness: 0.3 })
    );
    staff.position.set(0.42, 1.05, 0.1);
    staff.rotation.z = 0.15;
    this.mesh.add(staff);
    this.staffHeadMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x660000 });
    const staffHead = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), this.staffHeadMat);
    staffHead.position.set(0.42, 1.7, 0.1);
    this.mesh.add(staffHead);
  }

  _enrage() {
    this.enraged = true;
    this.eyeMat.emissive.setHex(0xff2222);
    this.onEnrage?.(this);
  }

  update(dt, player) {
    if (!this.alive) return;
    if (!this.enraged && this.hp <= this.maxHp * ENRAGE_AT) this._enrage();

    this._attackCooldown = Math.max(0, this._attackCooldown - dt);
    const dist = this.mesh.position.distanceTo(player.position);

    if (this._tellTimer > 0) {
      // wind-up: stand still, staff head flares -- your cue to step out of range
      this._tellTimer -= dt;
      this.staffHeadMat.emissive.setHex(0xff3333);
      if (this._tellTimer <= 0) {
        this.staffHeadMat.emissive.setHex(0x660000);
        if (this.mesh.position.distanceTo(player.position) <= ATTACK_RADIUS) {
          player.takeDamage(this.enraged ? this.damage * 1.15 : this.damage);
        }
      }
    } else if (dist <= AGGRO_RADIUS && player.alive) {
      this.state = 'chase';
      if (dist > ATTACK_RADIUS) {
        this._moveToward(player.position, dt, this.enraged ? 1.15 : 1);
      } else if (this._attackCooldown <= 0) {
        this._attackCooldown = ATTACK_COOLDOWN * (this.enraged ? ENRAGE_COOLDOWN_MUL : 1);
        this._tellTimer = SWING_TELL;
      }
    } else {
      this.state = 'guard';
      this._wander(dt);
    }

    this._applyHitFlash(dt, this.material);
  }
}
