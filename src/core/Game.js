import * as THREE from 'three';

// Owns the renderer/scene/camera and the main loop. Everything else (player,
// enemies, world, HUD) is registered as an "updatable" with an update(dt) method.
export class Game {
  constructor(canvas) {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x243420, 0.03);

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.clock = new THREE.Clock();
    this.updatables = [];
    this.paused = false;

    window.addEventListener('resize', () => this._onResize());
    this._setupLights();
  }

  _setupLights() {
    // Ambient + hemisphere fill the darkness between lanterns, so this is the
    // cheapest global brightness knob -- intensities kept from the original
    // "map reads too dark to see" fix, just recolored for canopy-filtered
    // daylight instead of indoor fluorescents (sky-facing tint, mossy ground
    // bounce).
    const ambient = new THREE.AmbientLight(0x3a4a2e, 0.85);
    this.scene.add(ambient);
    this.hemi = new THREE.HemisphereLight(0xbfe0c0, 0x2a3a20, 0.55);
    this.scene.add(this.hemi);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  add(updatable, object3d) {
    if (object3d) this.scene.add(object3d);
    if (updatable && typeof updatable.update === 'function') {
      this.updatables.push(updatable);
    }
  }

  remove(updatable, object3d) {
    if (object3d) this.scene.remove(object3d);
    const i = this.updatables.indexOf(updatable);
    if (i !== -1) this.updatables.splice(i, 1);
  }

  start() {
    this.renderer.setAnimationLoop(() => this._tick());
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (!this.paused) {
      for (const u of this.updatables) u.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
