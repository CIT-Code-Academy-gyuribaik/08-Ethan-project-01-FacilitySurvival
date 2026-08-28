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
        <div id="inventory" class="inventory"></div>
        <div id="message-log" class="message-log"></div>
      </div>

      <div id="objective" class="objective"></div>

      <div id="boss-bar" class="boss-bar hidden">
        <div id="boss-name" class="boss-name"></div>
        <div class="boss-track"><div id="boss-fill" class="boss-fill"></div></div>
      </div>

      <div id="prompt" class="prompt hidden"></div>

      <div id="hint-bar" class="hint-bar">
        이동 WASD · 공격 Space · 상호작용 Enter · 먹기 F · 메뉴 Shift
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
    this.inventoryEl = q('#inventory');
    this.messageLogEl = q('#message-log');
    this.objectiveEl = q('#objective');
    this.bossBarEl = q('#boss-bar');
    this.bossNameEl = q('#boss-name');
    this.bossFillEl = q('#boss-fill');
    this.promptEl = q('#prompt');
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
    this.objectiveEl.textContent = text ? `목표: ${text}` : '';
  }

  setPrompt(text) {
    if (text) {
      this.promptEl.textContent = `[Enter] ${text}`;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }
  }

  showBoss(name) {
    this.bossNameEl.textContent = name;
    this.bossBarEl.classList.remove('hidden');
  }

  updateBoss(hp, maxHp) {
    this.bossFillEl.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
  }

  hideBoss() {
    this.bossBarEl.classList.add('hidden');
  }

  setHudVisible(visible) {
    this.root.querySelector('#hud').classList.toggle('hidden', !visible);
    this.objectiveEl.classList.toggle('hidden', !visible);
    this.hintBarEl.classList.toggle('hidden', !visible);
  }

  showOverlay(title, subtitle = '', hint = '', { tone = '' } = {}) {
    this.overlayEl.classList.remove('hidden');
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
