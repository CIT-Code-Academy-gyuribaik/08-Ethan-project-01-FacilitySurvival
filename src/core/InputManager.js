// Tracks raw keyboard state and exposes it as a plain map any system can read.
// Normalizes WASD + arrow keys into one move vector, and exposes one-shot
// "just pressed" events for the action keys.
//
// Key map follows 기획서 11번 (이동 WASD/방향키, 행동 Space, 확인 Enter,
// 취소 Shift). F(먹기), Escape(일시정지), E(응급 키트 사용), L(손전등 on/off)
// are convenience additions -- the design doc's four keys couldn't cover
// eating, pausing, item use, and equipment separately.
//
// The game is first-person: the mouse turns the view (pointer-locked), and the
// left button is a second attack key alongside Space.
export class InputManager {
  constructor() {
    this.keys = new Set();
    this._justPressed = new Set();

    // accumulated pointer motion since the last consumeLook(), in raw pixels
    this._lookDX = 0;
    this._lookDY = 0;
    this.pointerLocked = false;

    // Rolling buffer of digit keys typed, most recent last -- e.g. "0209" for
    // a Konami-style cheat code. Not tied to any one code; main.js checks it
    // with consumeDigitSequence().
    this._digitBuffer = '';

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this._justPressed.add(e.code);
      this.keys.add(e.code);
      if (/^Digit[0-9]$/.test(e.code)) {
        this._digitBuffer = (this._digitBuffer + e.code.slice(5)).slice(-16);
      }
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

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement != null;
      if (!this.pointerLocked) {
        this._lookDX = 0;
        this._lookDY = 0;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this._lookDX += e.movementX;
      this._lookDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (this.pointerLocked && e.button === 0) this._justPressed.add('Mouse0');
    });
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // True only on the single frame the key transitioned from up -> down.
  wasJustPressed(code) {
    return this._justPressed.has(code);
  }

  // Pointer motion accumulated since the last call, then zeroed. main.js turns
  // this into player yaw/pitch; consuming it every frame keeps a big stutter
  // from banking up while a menu or a cutscene is open.
  consumeLook() {
    const look = { dx: this._lookDX, dy: this._lookDY };
    this._lookDX = 0;
    this._lookDY = 0;
    return look;
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
    return this.wasJustPressed('Space') || this.wasJustPressed('Mouse0');
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

  // 응급 키트 사용 (기획서 4키 밖의 추가 -- F/Escape와 같은 결)
  get usePressed() {
    return this.wasJustPressed('KeyE');
  }

  // 손전등 on/off (소지하고 있을 때만 의미가 있음)
  get flashlightPressed() {
    return this.wasJustPressed('KeyL');
  }

  get pausePressed() {
    return this.wasJustPressed('Escape');
  }

  // True once, the instant the typed digits end with `seq` (e.g. "0209").
  // Consumes the buffer on a match so it can't fire again on the next digit.
  consumeDigitSequence(seq) {
    if (!this._digitBuffer.endsWith(seq)) return false;
    this._digitBuffer = '';
    return true;
  }

  // Call once per frame, after every system has read _justPressed.
  endFrame() {
    this._justPressed.clear();
  }
}
