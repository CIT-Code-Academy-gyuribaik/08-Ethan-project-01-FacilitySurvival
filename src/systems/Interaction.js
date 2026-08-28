// Proximity interaction: finds the nearest thing the player could act on, hands
// the HUD a prompt for it, and fires it on the confirm key.
//
// A target is any object shaped like:
//   { position: Vector3, interactRadius?: number,
//     promptText: string | null,   // null/undefined -> not offering anything right now
//     onInteract(player): void }
// Keeping the contract this loose means pickups, doors, the bed, and later NPC
// dialogue can all register without the system knowing what they are.
export class InteractionSystem {
  constructor(player) {
    this.player = player;
    this.targets = [];
    this.current = null;
  }

  add(target) {
    this.targets.push(target);
    return target;
  }

  remove(target) {
    const i = this.targets.indexOf(target);
    if (i !== -1) this.targets.splice(i, 1);
  }

  clear() {
    this.targets.length = 0;
    this.current = null;
  }

  // Returns the text the HUD should show, or null.
  get promptText() {
    return this.current?.promptText ?? null;
  }

  update(dt, input) {
    for (const t of this.targets) t.update?.(dt);

    let best = null;
    let bestDist = Infinity;
    for (const t of this.targets) {
      if (!t.promptText) continue;
      const r = t.interactRadius ?? 2.2;
      const d = t.position.distanceTo(this.player.position);
      if (d <= r && d < bestDist) {
        best = t;
        bestDist = d;
      }
    }
    this.current = best;

    if (best && input.confirmPressed) {
      best.onInteract(this.player);
      return best;
    }
    return null;
  }
}
