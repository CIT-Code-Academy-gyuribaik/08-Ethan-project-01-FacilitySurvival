// Plain-DOM overlay: status bars, inventory, objective, message log, the
// interaction prompt, the boss bar, and the full-screen overlays (intro, pause
// menu, death, endings). Kept free of Three.js so it can be restyled on its own.
export class HUD {
  constructor(root) {
    this.root = root;
    this._messages = [];
    this._buildDom();
  }

  _buildDom() {
    this.root.innerHTML = `
      <div id="hud">
        <div class="stat-row">
          <span id="level-badge" class="level-badge">Lv.1</span>
          <div class="exp-track"><div id="exp-fill" class="exp-fill"></div></div>
        </div>
        <div class="bar-group">
          <div class="bar-label">HP</div>
          <div class="bar-track"><div id="hp-fill" class="bar-fill hp"></div></div>
          <div id="hp-text" class="bar-text"></div>
        </div>
        <div class="bar-group">
          <div class="bar-label">허기</div>
          <div class="bar-track"><div id="hunger-fill" class="bar-fill hunger"></div></div>
          <div id="hunger-text" class="bar-text"></div>
        </div>
        <div id="equip-row" class="equip-row hidden"></div>
        <div id="inventory" class="inventory"></div>
        <div id="message-log" class="message-log"></div>
      </div>

      <div id="objective" class="objective"></div>

      <div id="boss-bar" class="boss-bar hidden">
        <div id="boss-name" class="boss-name"></div>
        <div class="boss-track"><div id="boss-fill" class="boss-fill"></div></div>
      </div>

      <div id="crosshair" class="crosshair hidden"></div>

      <div id="prompt" class="prompt hidden"></div>

      <div id="dialogue" class="dialogue hidden">
        <div id="dialogue-speaker" class="dialogue-speaker"></div>
        <div id="dialogue-text" class="dialogue-text"></div>
        <div class="dialogue-next">Enter ▾</div>
      </div>

      <div id="hint-bar" class="hint-bar">
        이동 WASD · 시점 마우스 · 공격 클릭/Space · 상호작용 Enter · 먹기 F · 응급키트 E · 손전등 L · 메뉴 Esc
      </div>

      <div id="overlay" class="overlay hidden">
        <div id="overlay-title" class="overlay-title"></div>
        <div id="overlay-subtitle" class="overlay-subtitle"></div>
        <div id="overlay-menu" class="overlay-menu hidden"></div>
        <div id="overlay-hint" class="overlay-hint"></div>
      </div>
    `;
    const q = (sel) => this.root.querySelector(sel);
    this.levelBadge = q('#level-badge');
    this.expFill = q('#exp-fill');
    this.hpFill = q('#hp-fill');
    this.hpText = q('#hp-text');
    this.hungerFill = q('#hunger-fill');
    this.hungerText = q('#hunger-text');
    this.equipRowEl = q('#equip-row');
    this.inventoryEl = q('#inventory');
    this.messageLogEl = q('#message-log');
    this.objectiveEl = q('#objective');
    this.bossBarEl = q('#boss-bar');
    this.bossNameEl = q('#boss-name');
    this.bossFillEl = q('#boss-fill');
    this.crosshairEl = q('#crosshair');
    this.promptEl = q('#prompt');
    this._hudVisible = false;
    this.dialogueEl = q('#dialogue');
    this.dialogueSpeakerEl = q('#dialogue-speaker');
    this.dialogueTextEl = q('#dialogue-text');
    this.hintBarEl = q('#hint-bar');
    this.overlayEl = q('#overlay');
    this.overlayTitleEl = q('#overlay-title');
    this.overlaySubtitleEl = q('#overlay-subtitle');
    this.overlayMenuEl = q('#overlay-menu');
    this.overlayHintEl = q('#overlay-hint');
  }

  log(text) {
    this._messages.push({ text, t: 4.5 });
    if (this._messages.length > 5) this._messages.shift();
  }

  setObjective(text) {
    // called every frame while the secret-ending counter is live, so don't
    // touch the DOM unless it actually changed
    const next = text ? `목표: ${text}` : '';
    if (this.objectiveEl.textContent !== next) this.objectiveEl.textContent = next;
  }

  setPrompt(text, { bare = false } = {}) {
    if (text) {
      this.promptEl.textContent = bare ? text : `[Enter] ${text}`;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }
  }

  showDialogue(speaker, text) {
    this.dialogueEl.classList.remove('hidden');
    this.dialogueSpeakerEl.textContent = speaker || '';
    this.dialogueSpeakerEl.classList.toggle('hidden', !speaker);
    this.dialogueTextEl.textContent = text;
    this.setPrompt(null);
    this._syncCrosshair();
  }

  hideDialogue() {
    this.dialogueEl.classList.add('hidden');
    this._syncCrosshair();
  }

  // The reticle only belongs on screen during actual play -- not over a cutscene,
  // a menu, or an ending card.
  _syncCrosshair() {
    const show =
      this._hudVisible &&
      this.dialogueEl.classList.contains('hidden') &&
      this.overlayEl.classList.contains('hidden');
    this.crosshairEl.classList.toggle('hidden', !show);
  }

  showBoss(name) {
    if (this.bossNameEl.textContent !== name) this.bossNameEl.textContent = name;
    this.bossBarEl.classList.remove('hidden');
  }

  updateBoss(hp, maxHp) {
    this.bossFillEl.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
  }

  hideBoss() {
    this.bossBarEl.classList.add('hidden');
  }

  setHudVisible(visible) {
    this._hudVisible = visible;
    this.root.querySelector('#hud').classList.toggle('hidden', !visible);
    this.objectiveEl.classList.toggle('hidden', !visible);
    this.hintBarEl.classList.toggle('hidden', !visible);
    this._syncCrosshair();
  }

  showOverlay(title, subtitle = '', hint = '', { tone = '' } = {}) {
    this.hideDialogue();
    this.overlayEl.classList.remove('hidden');
    this._syncCrosshair();
    this.overlayEl.className = `overlay ${tone}`;
    this.overlayTitleEl.textContent = title;
    this.overlaySubtitleEl.innerHTML = subtitle;
    this.overlayHintEl.textContent = hint;
    this.overlayMenuEl.classList.add('hidden');
    this.setPrompt(null);
  }

  // Renders a keyboard-driven menu. Selection state lives in main.js; this just draws it.
  showMenu(title, items, selectedIndex, hint = '↑↓ 선택 · Enter 확인 · Shift 닫기') {
    this.overlayEl.classList.remove('hidden');
    this._syncCrosshair();
    this.overlayEl.className = 'overlay menu-mode';
    this.overlayTitleEl.textContent = title;
    this.overlaySubtitleEl.textContent = '';
    this.overlayMenuEl.classList.remove('hidden');
    this.overlayMenuEl.innerHTML = items
      .map(
        (item, i) =>
          `<div class="menu-item${i === selectedIndex ? ' selected' : ''}${
            item.disabled ? ' disabled' : ''
          }">${i === selectedIndex ? '▸ ' : '  '}${item.label}</div>`
      )
      .join('');
    this.overlayHintEl.textContent = hint;
    this.setPrompt(null);
  }

  hideOverlay() {
    this.overlayEl.classList.add('hidden');
    this.overlayMenuEl.classList.add('hidden');
    this._syncCrosshair();
  }

  update(dt, player) {
    const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
    const hungerPct = Math.max(0, (player.hunger / player.maxHunger) * 100);
    this.hpFill.style.width = `${hpPct}%`;
    this.hungerFill.style.width = `${hungerPct}%`;
    this.hpFill.classList.toggle('low', hpPct < 25);
    this.hungerFill.classList.toggle('low', hungerPct < 25);
    this.hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
    this.hungerText.textContent = `${Math.ceil(player.hunger)}`;

    this.levelBadge.textContent = `Lv.${player.level}`;
    this.expFill.style.width = `${Math.min(100, (player.exp / player.expToNext) * 100)}%`;

    const equipped = [];
    if (player.armorMul < 1) equipped.push('방탄조끼');
    if (player.hasFlashlight) equipped.push(`손전등(${player.flashlightOn ? '켜짐' : '꺼짐'})`);
    this.equipRowEl.classList.toggle('hidden', equipped.length === 0);
    this.equipRowEl.textContent = equipped.length ? `장착: ${equipped.join(' · ')}` : '';

    this.inventoryEl.innerHTML =
      player.inventory
        .map(
          (i) =>
            `<div class="item-slot"><span class="item-name">${i.name}</span><span class="item-count">x${i.count}</span></div>`
        )
        .join('') || '<div class="item-slot empty">비어 있음</div>';

    for (const m of this._messages) m.t -= dt;
    this._messages = this._messages.filter((m) => m.t > 0);
    this.messageLogEl.innerHTML = this._messages
      .map((m) => `<div class="log-line" style="opacity:${Math.min(1, m.t)}">${m.text}</div>`)
      .join('');
  }
}
