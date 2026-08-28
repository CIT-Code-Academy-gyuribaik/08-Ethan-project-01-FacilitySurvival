// Cutscene-style dialogue. While a conversation is running the world is frozen
// by main.js -- the design doc's story beats (과학자 조우, 사령관 등장) land
// better as a beat you read than as text scrolling past while a wolf eats you.
export class DialogueSystem {
  constructor() {
    this.lines = []; // { speaker, text }
    this.index = 0;
    // Enter both opens and advances dialogue, so swallow the frame that opened
    // it -- otherwise the same keypress skips the first line instantly.
    this._blockFrames = 0;
    this.onFinish = null;
  }

  get active() {
    return this.index < this.lines.length;
  }

  get current() {
    return this.lines[this.index] ?? null;
  }

  say(lines, onFinish = null) {
    this.lines = lines;
    this.index = 0;
    this._blockFrames = 1;
    this.onFinish = onFinish;
  }

  advance() {
    if (!this.active) return;
    this.index += 1;
    if (!this.active) {
      const cb = this.onFinish;
      this.onFinish = null;
      cb?.();
    }
  }

  // Returns true while the conversation should keep holding the game.
  update(input) {
    if (!this.active) return false;
    if (this._blockFrames > 0) {
      this._blockFrames -= 1;
      return true;
    }
    if (input.confirmPressed) this.advance();
    return this.active;
  }

  clear() {
    this.lines = [];
    this.index = 0;
    this.onFinish = null;
  }
}

// Story beats, kept as data so the writing lives in one readable place.
// ngPlus variants exist because 기획서 8번's ??? ending only makes sense if the
// second run feels like the same facility seen by someone who already knows.
export const SCRIPT = {
  intro: [
    { speaker: '', text: '차가운 바닥. 형광등이 깜빡인다.' },
    { speaker: '', text: '어떻게 여기 들어왔는지 기억나지 않는다.' },
    { speaker: '', text: '문 밖에서 무언가 긁는 소리가 난다. 나가야 한다.' },
  ],
  introNgPlus: [
    { speaker: '', text: '차가운 바닥. 형광등이 깜빡인다.' },
    { speaker: '', text: '...전에도 이 천장을 봤다.' },
    { speaker: '', text: '이번엔 끝까지 보고 나가겠다. 시설이 숨긴 것까지.' },
  ],
  scientistFirst: [
    { speaker: '과학자', text: '실험체가 구역을 벗어났습니다. 회수 절차 개시.' },
    { speaker: '과학자', text: '저항하지 마세요. 당신은 아직 관측 대상입니다.' },
  ],
  commanderAppear: [
    { speaker: '사령관', text: '여기까지 온 개체는 네가 처음이다.' },
    { speaker: '사령관', text: '축하한다. 그건 곧, 네가 성공작이라는 뜻이지.' },
    { speaker: '', text: '갑주가 잠금을 푸는 소리가 복도를 울린다.' },
  ],
  commanderAppearNgPlus: [
    { speaker: '사령관', text: '또 왔군. 몇 번째인지는 세지 않겠다.' },
    { speaker: '사령관', text: '너는 탈출한 게 아니야. 회차를 돌았을 뿐이지.' },
    { speaker: '', text: '이번엔 그 말이 무슨 뜻인지 알 것 같다.' },
  ],
  commanderDefeated: [
    { speaker: '사령관', text: '...실험은, 성공이었다.' },
    { speaker: '', text: '갑주가 식으며 조용해진다. 출구의 잠금이 풀렸다.' },
  ],
  mutantWake: [
    { speaker: '', text: '배양액이 갈라진다. 안에 있던 것이 눈을 떴다.' },
  ],
};
