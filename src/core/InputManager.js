// Tracks raw keyboard state and exposes it as a plain map any system can read.
// Normalizes WASD + arrow keys into one move vector, and exposes one-shot
// "just pressed" events for the action keys.
//
// Key map follows 기획서 11번 (이동 WASD/방향키, 행동 Space, 확인 Enter,
// 취소 Shift). F(먹기) and Escape(일시정지) are convenience additions -- the
// design doc's four keys couldn't cover eating and pausing separately.
export class InputManager {
  constructor() {
    this.keys = new Set();
    this._justPressed = new Set();

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this._justPressed.add(e.code);
      this.keys.add(e.code);
      // stop Space/arrows from scrolling the page under the canvas
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // True only on the single frame the key transitioned from up -> down.
  wasJustPressed(code) {
    return this._justPressed.has(code);
  }

  get moveVector() {
    let x = 0;
    let z = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) z -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) z += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    return { x, z };
  }

  get attackPressed() {
    return this.wasJustPressed('Space');
  }

  // 확인 / 상호작용 (줍기, 문 열기, 저장)
  get confirmPressed() {
    return this.wasJustPressed('Enter');
  }

  // 취소 / 뒤로가기
  get cancelPressed() {
    return this.wasJustPressed('ShiftLeft') || this.wasJustPressed('ShiftRight');
  }

  get eatPressed() {
    return this.wasJustPressed('KeyF');
  }

  get pausePressed() {
    return this.wasJustPressed('Escape');
  }

  // Call once per frame, after every system has read _justPressed.
  endFrame() {
    this._justPressed.clear();
  }
}
