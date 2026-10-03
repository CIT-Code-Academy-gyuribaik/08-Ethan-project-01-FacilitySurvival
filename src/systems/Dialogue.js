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
    { speaker: '', text: '차가운 바닥. 머리 위 나뭇잎 사이로 랜턴 불빛이 흔들린다.' },
    { speaker: '', text: '어떻게 여기 들어왔는지 기억나지 않는다.' },
    { speaker: '', text: '문 밖에서 무언가 긁는 소리가 난다. 나가야 한다.' },
  ],
  introNgPlus: [
    { speaker: '', text: '차가운 바닥. 머리 위 나뭇잎 사이로 랜턴 불빛이 흔들린다.' },
    { speaker: '', text: '...전에도 이 캐노피를 봤다.' },
    { speaker: '', text: '이번엔 끝까지 보고 나가겠다. 시설이 숨긴 것까지.' },
  ],
  // 문을 넘어 2장으로 들어가는 순간의 반전(기획서: "not in a forest" -- 플레이어는
  // 숲인 줄 알았지만 사실은 시설이었다). 1장 내내 숲으로 보이던 것들이 여기서
  // 뒤집힌다 -- Facility.js도 이 지점(아레나+corr3)부터 시각 자체를 콘크리트/
  // 형광등으로 바꾼다(_buildRoom/_buildCorridor의 chapter===2 분기 참고).
  forestReveal: [
    { speaker: '', text: '발 밑에서 나뭇잎 부서지는 소리가, 어느새 타일 밟는 소리로 바뀌어 있었다.' },
    { speaker: '', text: '고개를 들었다. 캐노피는 없다. 콘크리트 천장과 형광등.' },
    { speaker: '', text: '숲은... 처음부터 없었다.' },
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
    { speaker: 'project 0003', text: '...실험은, 성공이었다.' },
    { speaker: '', text: '갑주가 식으며 조용해진다. 출구의 잠금이 풀렸다.' },
  ],
  mutantWake: [
    { speaker: '', text: '배양액이 갈라진다. 실패작이 눈을 떴다.' },
  ],

  // --- 진 엔딩 루트 (기획서 7번 마지막장 / 8번 true ending) ---

  // 문서 3장을 다 모은 채로 사령관을 처치하고 출구 앞에 섰을 때
  intelGateReady: [
    { speaker: '', text: '문서의 마지막 장. 출구 좌표 대신 다른 좌표가 적혀 있다.' },
    { speaker: '', text: '"관측실 하부. 원본 보관고."' },
    { speaker: '', text: '밖으로 나가는 대신, 아래로 내려가는 길이 있다.' },
  ],

  // "???" 구역에 도착
  sanctumArrival: [
    { speaker: '', text: '랜턴이 없다. 공기가 무겁다.' },
    { speaker: '', text: '방 한가운데, 빛을 삼킨 형체가 서 있다.' },
  ],

  // 그(he) -- 시설의 설계자. 싸우지 않고 말만 한다 (기획서 4번).
  heMeeting: [
    { speaker: '그', text: '여기까지 온 건 네가 처음이다. 문서를 전부 읽은 것도.' },
    { speaker: '그', text: '이 시설은 감옥이 아니야. 사람을 골라내는 체(篩)다.' },
    { speaker: '그', text: '늑대도, 사슴도, 사령관도 전부 한 사람에게서 떠낸 조각이지.' },
    { speaker: '그', text: '원본. 0001. ...너다.' },
    { speaker: '그', text: '네가 여기 몇 번째로 깨어났는지 아나? 나는 세는 걸 그만뒀다.' },
    { speaker: '그', text: '마지막 조각이 아직 남아 있다. 그걸 회수하면, 실험은 끝이다.' },
    { speaker: '', text: '그가 물러서자, 뒤에 있던 것이 걸어 나온다. 내 얼굴을 하고.' },
  ],

  doppelAppear: [
    { speaker: '너', text: '......' },
    { speaker: '너', text: '너도 저 문으로 나갈 수 있다고 생각했구나.' },
  ],

  doppelEnrage: [
    { speaker: '너', text: '이만큼 했는데도 모르겠어? 이긴 쪽이 다음 원본이야.' },
  ],

  doppelDefeated: [
    { speaker: '너', text: '...아. 이번엔, 네가.' },
    { speaker: '그', text: '회수 완료. 실험 종료.' },
    { speaker: '그', text: '축하한다. 네가 시설을 통과한 유일한 사람이다.' },
    { speaker: '그', text: '문은 처음부터 잠겨 있지 않았어. 나가라.' },
  ],
};
