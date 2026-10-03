// 효과음: 기획서 6번 칸을 채운다. 실제 오디오 파일이 없으므로 (world/Textures.js
// 가 캔버스로 텍스처를 만드는 것과 같은 이유), Web Audio API 오실레이터/노이즈
// 만으로 짧은 효과음을 즉석 생성한다. 브라우저의 자동재생 정책 때문에
// AudioContext는 사용자 제스처(클릭/키 입력) 전에는 만들지 않거나 suspended
// 상태로 남으므로, 반드시 unlock()을 그 제스처 핸들러 안에서 호출해야 한다.
//
// 배경음악(BGM)은 한 번 넣었다가 사용자 요청으로 뺐었는데(기획서 6번 칸은 그동안
// 비어 있었다), 이번에 기획서의 BGM 표를 그대로 구현해 다시 넣었다 -- 아래
// "배경음(OST)" 섹션 참고.
//
// main.js만 이 모듈을 쓴다 -- 엔티티/시스템은 여전히 순수 게임 로직이고,
// 소리는 다른 연출(HUD 로그, 컷신)처럼 main.js가 엮는다.
export function createAudioSystem() {
  let ctx = null;
  let master = null;
  let sfxGain = null;
  let musicGain = null;
  let noiseBuf = null;
  let unlocked = false;
  let enabled = true;
  let musicState = null; // 원하는 상태. unlock() 전에 요청되면 ctx가 생긴 뒤 적용
  let musicBank = null;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null; // 오디오를 지원하지 않는 환경(또는 window 자체가 없는 헤드리스) -- 조용히 무음
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 1 : 0;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.85;
    sfxGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = 1;
    musicGain.connect(master);
    return ctx;
  }

  function getNoiseBuffer() {
    if (noiseBuf) return noiseBuf;
    const c = ensureCtx();
    if (!c) return null;
    const len = c.sampleRate; // 1초, 짧은 노이즈 버스트에는 매번 충분
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // 사용자 제스처(클릭/키 입력) 핸들러 안에서 호출할 것. AudioContext 생성 + resume.
  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    unlocked = true;
    if (musicState) _applyMusicState(musicState); // setMusicState() called before unlock -- start it now
  }

  function setEnabled(on) {
    enabled = on;
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(on ? 1 : 0, now + 0.15);
  }

  // ---------------------------------------------------------------- 효과음

  function playTone({ freq, type = 'sine', duration = 0.15, peak = 0.4, attack = 0.005, detune = 0, sweepTo = null, delay = 0 }) {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (detune) osc.detune.value = detune;
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  function playNoise({ duration = 0.15, peak = 0.4, filterType = 'bandpass', filterFreq = 800, q = 1, attack = 0.003, delay = 0 }) {
    const buf = getNoiseBuffer();
    if (!buf) return;
    const start = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = filterFreq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(sfxGain);
    src.start(start);
    src.stop(start + duration + 0.05);
  }

  const SFX = {
    hit() {
      playNoise({ duration: 0.09, peak: 0.5, filterFreq: 1500, q: 0.9 });
      playTone({ freq: 190, type: 'square', duration: 0.08, peak: 0.22, sweepTo: 85 });
    },
    hurt() {
      playTone({ freq: 220, type: 'sawtooth', duration: 0.22, peak: 0.32, sweepTo: 80 });
      playNoise({ duration: 0.15, peak: 0.28, filterFreq: 400, q: 1 });
    },
    enemyDeath() {
      playNoise({ duration: 0.4, peak: 0.28, filterFreq: 300, q: 0.6, filterType: 'lowpass' });
      playTone({ freq: 140, type: 'sine', duration: 0.4, peak: 0.22, sweepTo: 40 });
    },
    pickup() {
      playTone({ freq: 660, type: 'sine', duration: 0.09, peak: 0.28, sweepTo: 1100 });
      playTone({ freq: 990, type: 'sine', duration: 0.12, peak: 0.16, delay: 0.05 });
    },
    levelUp() {
      playTone({ freq: 330, type: 'sine', duration: 0.16, peak: 0.3 });
      playTone({ freq: 440, type: 'sine', duration: 0.16, peak: 0.32, delay: 0.09 });
      playTone({ freq: 660, type: 'sine', duration: 0.22, peak: 0.34, delay: 0.18 });
    },
    doorOpen() {
      playNoise({ duration: 0.9, peak: 0.24, filterType: 'lowpass', filterFreq: 220, q: 0.5 });
      playTone({ freq: 55, type: 'sawtooth', duration: 0.9, peak: 0.18, sweepTo: 95 });
    },
    doorLocked() {
      playTone({ freq: 180, type: 'square', duration: 0.1, peak: 0.28 });
      playTone({ freq: 140, type: 'square', duration: 0.12, peak: 0.26, delay: 0.12 });
    },
    bossAppear() {
      playTone({ freq: 52, type: 'sine', duration: 1.2, peak: 0.55 });
      playNoise({ duration: 1.0, peak: 0.35, filterFreq: 220, q: 0.4, filterType: 'lowpass' });
    },
    bossPhase() {
      playTone({ freq: 90, type: 'sawtooth', duration: 0.5, peak: 0.38, sweepTo: 220 });
      playNoise({ duration: 0.3, peak: 0.3, filterFreq: 900, q: 1 });
    },
    save() {
      playTone({ freq: 523.25, type: 'sine', duration: 0.18, peak: 0.24 });
      playTone({ freq: 659.25, type: 'sine', duration: 0.22, peak: 0.24, delay: 0.11 });
    },
    heal() {
      playTone({ freq: 440, type: 'sine', duration: 0.14, peak: 0.26 });
      playTone({ freq: 660, type: 'sine', duration: 0.18, peak: 0.28, delay: 0.07 });
      playNoise({ duration: 0.1, peak: 0.12, filterFreq: 1800, q: 1 });
    },
    equip() {
      playTone({ freq: 260, type: 'square', duration: 0.05, peak: 0.22 });
      playTone({ freq: 340, type: 'square', duration: 0.08, peak: 0.22, delay: 0.06 });
    },
    eat() {
      playNoise({ duration: 0.12, peak: 0.22, filterFreq: 550, q: 0.8 });
    },
    menuMove() {
      playTone({ freq: 520, type: 'square', duration: 0.03, peak: 0.1 });
    },
    menuConfirm() {
      playTone({ freq: 660, type: 'square', duration: 0.07, peak: 0.16, sweepTo: 880 });
    },
    override() {
      playNoise({ duration: 0.7, peak: 0.3, filterType: 'highpass', filterFreq: 2200, q: 0.6 }); // gas hiss
      playTone({ freq: 720, type: 'square', duration: 0.06, peak: 0.2 });
      playTone({ freq: 480, type: 'square', duration: 0.08, peak: 0.18, delay: 0.09 });
    },
  };

  function playSfx(name) {
    if (!ctx || !unlocked || !SFX[name]) return;
    SFX[name]();
  }

  // ---------------------------------------------------------------- 배경음(OST)
  //
  // 기획서 6번 BGM 표를 그대로 구현했다. 실제 phonk/jazz/electronic 샘플이
  // 없으니(다른 절차적 텍스처/효과음과 같은 이유) 장르는 흉내만 낸다 -- 오실레이터
  // 조합 + 필터 + 트레몰로(pulseHz) + 디스토션으로 "그 장르가 주는 느낌"의
  // 근사치를 낸다. 정확한 재현이 목표가 아니다.
  //   peace(the forest of peace) -- 열린 5도 + 필터 노이즈로 "그냥 자연음"
  //   breach(facility breach)    -- 스퀘어 파워코드 + 빠른 트레몰로 + 약한 디스토션으로 "팝/일렉트로닉"
  //   project0003                -- breach보다 낮고 무겁게, 더 강한 디스토션으로 보스급 일렉트로닉
  //   him                        -- 정적인 확장코드(장3도 포함)로 "재즈/클래식"의 신비로움
  //   dark(the forest of dark)   -- 반음 차이로 맥놀이(beating)를 만들어 "클래식/공포"
  //   failure                    -- 극저음 반음 맥놀이 + 아주 느린 펄스로 "깊고 무서움"
  //   selfhate                   -- 디스토션 걸린 저음 + 노이즈 하이햇 느낌 + 빠른 펄스로 "폰크"
  const MUSIC = {
    peace: { freqs: [130.8, 196], type: 'sine', filterFreq: 1000, vol: 0.1, noise: { freq: 2000, q: 0.5, vol: 0.05 } },
    breach: { freqs: [55, 110, 164.8], type: 'square', filterFreq: 1800, vol: 0.16, pulseHz: 4.3, distortion: 0.15 },
    project0003: { freqs: [41.2, 82.4, 98], type: 'sawtooth', filterFreq: 900, vol: 0.2, pulseHz: 3.3, distortion: 0.25 },
    him: { freqs: [110, 164.8, 220, 277.2], type: 'sine', filterFreq: 1300, vol: 0.1 },
    dark: { freqs: [36.7, 55, 58.3], type: 'sawtooth', filterFreq: 280, vol: 0.16 },
    failure: { freqs: [30.9, 32.7], type: 'sine', filterFreq: 200, vol: 0.2, pulseHz: 0.6 },
    selfhate: {
      freqs: [41.2, 61.7, 65.4], type: 'sawtooth', filterFreq: 350, vol: 0.2, pulseHz: 1.8, distortion: 0.4,
      noise: { freq: 3000, q: 3, vol: 0.03 },
    },
  };

  function makeDistortionCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    const k = amount * 100;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  function _buildMusicBank(preset) {
    const bankGain = ctx.createGain();
    bankGain.gain.value = 0;
    bankGain.connect(musicGain);

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = preset.filterFreq;
    filt.Q.value = 0.7;

    let tail = filt;
    if (preset.distortion) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(preset.distortion);
      shaper.oversample = '2x';
      filt.connect(shaper);
      tail = shaper;
    }
    tail.connect(bankGain);

    const oscs = preset.freqs.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = preset.type;
      osc.frequency.value = f;
      osc.detune.value = (i - (preset.freqs.length - 1) / 2) * 4;
      osc.connect(filt);
      osc.start();
      return osc;
    });

    let noiseSrc = null;
    if (preset.noise) {
      const buf = getNoiseBuffer();
      if (buf) {
        noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = buf;
        noiseSrc.loop = true;
        const nf = ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = preset.noise.freq;
        nf.Q.value = preset.noise.q;
        const ng = ctx.createGain();
        ng.gain.value = preset.noise.vol;
        noiseSrc.connect(nf);
        nf.connect(ng);
        ng.connect(bankGain);
        noiseSrc.start();
      }
    }

    let lfo = null;
    if (preset.pulseHz) {
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = preset.pulseHz;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = preset.vol * 0.35; // modulation depth, kept < vol so it never goes negative
      lfo.connect(lfoGain);
      lfoGain.connect(bankGain.gain);
      lfo.start();
    }

    return { oscs, gain: bankGain, noiseSrc, lfo };
  }

  function _stopMusicBank(bank, fade) {
    const now = ctx.currentTime;
    bank.gain.gain.cancelScheduledValues(now);
    bank.gain.gain.setValueAtTime(bank.gain.gain.value, now);
    bank.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
    const stopAt = now + fade + 0.2;
    for (const osc of bank.oscs) osc.stop(stopAt);
    if (bank.noiseSrc) bank.noiseSrc.stop(stopAt);
    if (bank.lfo) bank.lfo.stop(stopAt);
  }

  function _applyMusicState(name) {
    if (!ctx) return;
    const preset = MUSIC[name];
    if (!preset) return;
    const prev = musicBank;
    musicBank = _buildMusicBank(preset);
    const now = ctx.currentTime;
    musicBank.gain.gain.setValueAtTime(0, now);
    musicBank.gain.gain.linearRampToValueAtTime(preset.vol, now + 2.2);
    if (prev) _stopMusicBank(prev, 2.2);
  }

  // main.js가 상태 전환 지점(제목 화면, 새 게임, 2장 진입, 보스 조우, "???" 진입 등)
  // 마다 부른다. 같은 이름을 다시 불러도 무시한다(매 프레임 부르는 곳도 있어서).
  function setMusicState(name) {
    if (name === musicState) return;
    musicState = name;
    if (unlocked) _applyMusicState(name);
  }

  return { unlock, setEnabled, playSfx, setMusicState };
}
