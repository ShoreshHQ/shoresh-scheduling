import { LightningElement, api } from "lwc";
import { createMotion, smooth, W_HAND } from "c/shoreshMotion";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// New cards are dealt in from the right, one after another.
const DEAL_AFTER = 80;
const DEAL_FIRST = 220;
const DEAL_STEP = 140;
// The hand's room above its cards (the lift, the breath and the focus ring) and below them (the
// outer cards' drop): the mock-up's hand, its cards' height and 46 more, the cards 24 above its
// bottom. The hand always shows its cards whole; the table above takes what is left (Roots).
const ABOVE = 22;
const BELOW = 24;
const CALM_HEIGHT = 16;
const MIN_STEP = 24;
const KEYS_NEXT = new Set(["ArrowRight", "ArrowDown"]);
const KEYS_MOVE = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"]);

/**
 * Roots' hand (repo ADR 0020 choice 10; wiki decisions 64g, 64h, 65 and 65a; the approved
 * mock-up's hand): what needs a look in this camp, fanned along the bottom of the table. Each card
 * is a button that opens the exact thing (the page grows its screen out of the card). However
 * many there are, the hand keeps a clear margin at both ends: past what fits side by side the
 * cards close up and overlap, a lifted card coming to the front. New cards are dealt in from the
 * right; one no longer in the cards it is handed is played onto its meld (playTo), travelling and
 * shrinking onto that stack, which settles as it lands. A calm camp is an empty hand: a calm space,
 * and to a screen reader "Nothing needs a look". With reduced motion asked for, nothing moves.
 *
 * cards: from c/shoreshRootsLooks looksOf (Roots hands over a new list only when it may change).
 * playTo(meld): where that meld's front card is, in the window ({ x, y, w, r }), or null.
 * Fires: open { key }; landed { meld } (a played card reaching its stack); leftfocus { meld } (the
 * card with the cursor was played: the cursor goes to that meld).
 */
export default class ShoreshRootsHand extends LightningElement {
  @api playTo;

  /** What the template draws: the hand's cards, then any still being played away. */
  shown = [];
  motion = createMotion();
  hw = 220;
  hh = 150;
  live = [];
  leaving = new Map();
  dealt = new Set();
  toDeal = [];
  toPlay = [];
  everShown = false;
  mediaReduced;
  resizer;
  focusAt = -1;

  @api
  get cards() {
    return this.live;
  }
  set cards(value) {
    this.update(Array.isArray(value) ? value : []);
  }

  connectedCallback() {
    if (typeof window.matchMedia === "function") {
      this.mediaReduced = window.matchMedia(REDUCED_MOTION);
    }
    this.motion.track("height", (v) => {
      const hand = this.handEl;
      if (hand) {
        hand.style.height = `${v.h.toFixed(2)}px`;
      }
    });
  }

  disconnectedCallback() {
    this.resizer?.disconnect();
    this.resizer = undefined;
    // Stopping forgets everything followed: a hand put back on the page follows its cards anew.
    this.motion.stop();
    this.motion = createMotion();
    this.template.querySelectorAll("[data-hand]").forEach((b) => {
      b._followed = false;
    });
  }

  renderedCallback() {
    const hand = this.handEl;
    if (!hand) {
      return;
    }
    if (!this.resizer && typeof ResizeObserver === "function") {
      this.resizer = new ResizeObserver(() => this.layout());
      this.resizer.observe(hand);
    }
    this.layout();
    this.deal();
    this.play();
    if (this.focusAt >= 0) {
      const buttons = this.buttons();
      const target = buttons[Math.min(this.focusAt, buttons.length - 1)];
      this.focusAt = -1;
      target?.focus({ preventScroll: true });
    }
  }

  get reduced() {
    return !!this.mediaReduced?.matches;
  }

  get handEl() {
    return this.template.querySelector('[data-id="hand"]');
  }

  get calm() {
    return this.live.length === 0;
  }

  /** Said once the hand is empty (a live region: it is heard when the last card goes). */
  get calmWords() {
    return this.calm ? "Nothing needs a look" : "";
  }

  get alive() {
    return this.live.length > 0 && !this.reduced ? "true" : null;
  }

  // ---------- what is held ----------

  update(next) {
    const before = new Map(this.live.map((c) => [c.key, c]));
    const now = new Set(next.map((c) => c.key));
    const focused = this.focusedKey();
    let focusFrom = -1;
    this.live.forEach((card, i) => {
      if (!now.has(card.key) && !this.leaving.has(card.key)) {
        this.leaving.set(card.key, card);
        this.toPlay.push(card.key);
        if (card.key === focused) {
          focusFrom = i;
        }
      }
    });
    next.forEach((card) => {
      if (!before.has(card.key)) {
        this.leaving.delete(card.key);
        this.toDeal.push(card.key);
      }
    });
    this.live = next;
    this.shown = [
      ...next.map((card) => this.view(card, false)),
      ...[...this.leaving.values()].map((card) => this.view(card, true))
    ];
    if (focusFrom >= 0) {
      if (next.length) {
        this.focusAt = Math.min(focusFrom, next.length - 1);
      } else {
        const meld = this.leaving.get(focused)?.meld;
        Promise.resolve().then(() =>
          this.dispatchEvent(new CustomEvent("leftfocus", { detail: { meld } }))
        );
      }
    }
  }

  view(card, gone) {
    return {
      ...card,
      gone: gone ? "true" : null,
      leaving: gone,
      tabindex: gone ? "-1" : "0"
    };
  }

  buttons() {
    return [...this.template.querySelectorAll("[data-hand]")].filter(
      (b) => !b.hasAttribute("data-gone")
    );
  }

  button(key) {
    return this.template.querySelector(`[data-hand="${cssKey(key)}"]`);
  }

  focusedKey() {
    const active = this.template.activeElement;
    return active?.dataset?.hand || null;
  }

  // ---------- doing ----------

  handleClick(event) {
    const key = event.currentTarget.dataset.hand;
    if (this.leaving.has(key)) {
      return;
    }
    this.dispatchEvent(new CustomEvent("open", { detail: { key } }));
  }

  /** The arrows move between the hand's cards (round at the ends), as in a meld. */
  handleKeydown(event) {
    if (!KEYS_MOVE.has(event.key)) {
      return;
    }
    const buttons = this.buttons();
    const at = buttons.indexOf(this.template.activeElement);
    if (at < 0) {
      return;
    }
    const step = KEYS_NEXT.has(event.key) ? 1 : -1;
    buttons[(at + step + buttons.length) % buttons.length].focus({
      preventScroll: true
    });
    event.preventDefault();
  }

  // ---------- geometry (the mock-up's hand) ----------

  size() {
    const width = this.handEl?.clientWidth || 0;
    // The mock-up's card: a fifth of the frame the hand lies in (its host, the hand's margins
    // included), never under 196 (the narrowest whose picture keeps its 11 px words) nor over 232.
    const frame = this.template.host?.clientWidth || width;
    this.hw = Math.round(Math.max(196, Math.min(232, frame * 0.2)));
    // Tall enough that the picture's 11 px words are never drawn smaller.
    this.hh = Math.round(this.hw * 0.68);
    return width;
  }

  /** Where the i-th of n cards lies: x from the hand's middle, y down, r its tilt. */
  slot(i, n, width) {
    const room = width - 2 * Math.max(40, width * 0.05) - this.hw;
    const k = i - (n - 1) / 2;
    // However narrow the hand, each card keeps a strip a pointer can hit (WCAG 2.5.8).
    const step =
      n > 1 ? Math.max(MIN_STEP, Math.min(this.hw * 1.06, room / (n - 1))) : 0;
    const tilt = n > 3 ? (2.2 * 3) / n : 2.2;
    const drop = n > 3 ? (3 * 3) / n : 3;
    return { x: k * step, y: k * k * drop, r: k * tilt, s: 1, o: 1 };
  }

  layout() {
    const hand = this.handEl;
    if (!hand) {
      return;
    }
    const width = this.size();
    hand.style.setProperty("--hw", `${this.hw}px`);
    hand.style.setProperty("--hh", `${this.hh}px`);
    // The hand keeps its room while a card is still being played away: the card flies from the
    // hand's bottom, and the meld it goes to would move if the table grew under it mid-flight.
    const height =
      this.leaving.size || this.live.length
        ? this.hh + ABOVE + BELOW
        : CALM_HEIGHT;
    this.motion.to("height", { h: height }, { snap: this.reduced });
    this.live.forEach((card, i) => {
      const b = this.button(card.key);
      if (!b) {
        return;
      }
      b.style.zIndex = String(10 + i);
      this.follow(card.key, b);
      if (this.dealt.has(card.key)) {
        this.motion.to(
          `card:${card.key}`,
          this.slot(i, this.live.length, width),
          {
            snap: this.reduced
          }
        );
      }
    });
  }

  follow(key, b) {
    if (b._followed) {
      return;
    }
    b._followed = true;
    this.motion.track(`card:${key}`, (v) => this.apply(key, b, v), W_HAND);
  }

  apply(key, b, v) {
    b.style.transform = `translate(calc(-50% + ${v.x.toFixed(2)}px), ${v.y.toFixed(2)}px) rotate(${v.r.toFixed(3)}deg) scale(${(v.s ?? 1).toFixed(4)})`;
    let o = v.o ?? 1;
    const play = b._play;
    if (play) {
      // 1 in the hand, 0 on the stack: the card is taken in as it lands, and the stack settles.
      const left = Math.hypot(play.x - v.x, play.y - v.y) / play.dist;
      o = Math.min(o, smooth(0.02, 0.3, left));
      if (!play.landed && left < 0.16) {
        play.landed = true;
        this.dispatchEvent(
          new CustomEvent("landed", { detail: { meld: play.meld } })
        );
      }
    }
    b.style.opacity = o >= 0.999 ? "" : o.toFixed(3);
  }

  /** New cards come in from the right, one after another (at once with reduced motion). */
  deal() {
    if (!this.toDeal.length) {
      return;
    }
    const width = this.size();
    const first = !this.everShown;
    let fresh = 0;
    const keys = this.toDeal;
    this.toDeal = [];
    keys.forEach((key) => {
      const b = this.button(key);
      const i = this.live.findIndex((c) => c.key === key);
      if (!b || i < 0) {
        return;
      }
      this.follow(key, b);
      this.dealt.add(key);
      // Taken back into the hand while it was being played: it comes back from where it is.
      const back = !!b._play;
      b._play = null;
      const to = this.slot(i, this.live.length, width);
      if (back) {
        this.motion.to(`card:${key}`, to);
        return;
      }
      if (this.reduced) {
        this.motion.to(`card:${key}`, to, { snap: true });
        return;
      }
      this.motion.to(
        `card:${key}`,
        { x: width / 2 + this.hw, y: this.hh * 0.4, r: 14, s: 1, o: 0 },
        { snap: true }
      );
      this.motion.to(`card:${key}`, to, {
        delay: (first ? DEAL_FIRST : DEAL_AFTER) + fresh * DEAL_STEP
      });
      fresh++;
    });
    this.everShown = this.everShown || this.live.length > 0;
  }

  /**
   * Dealt with: the card is played onto the meld it belongs to. It lifts off the hand where it
   * is, travels and shrinks onto that meld's front card, and is taken in as it lands. With
   * reduced motion, or with nowhere to go, it simply leaves.
   */
  play() {
    if (!this.toPlay.length) {
      return;
    }
    const keys = this.toPlay;
    this.toPlay = [];
    const hand = this.handEl;
    keys.forEach((key) => {
      const card = this.leaving.get(key);
      const b = this.button(key);
      if (!card || !b) {
        this.gone(key);
        return;
      }
      const target =
        !this.reduced && typeof this.playTo === "function"
          ? this.playTo(card.meld)
          : null;
      if (!target || !hand) {
        this.gone(key);
        return;
      }
      this.follow(key, b);
      const box = hand.getBoundingClientRect();
      // The card's place is measured from the hand's middle, its centre hh / 2 above the bottom.
      const baseX = box.left + box.width / 2;
      const baseY = box.bottom - BELOW - this.hh / 2;
      const now = this.motion.now(`card:${key}`);
      const x = target.x - baseX;
      const y = target.y - baseY;
      b._play = {
        x,
        y,
        meld: card.meld,
        dist: Math.hypot(x - (now.x || 0), y - (now.y || 0)) || 1,
        landed: false
      };
      b.style.zIndex = "60";
      this.motion.to(
        `card:${key}`,
        {
          x,
          y,
          r: target.r || 0,
          s: (target.w / this.hw) * 0.96,
          o: 1
        },
        { done: () => this.gone(key) }
      );
    });
    this.layout();
  }

  gone(key) {
    if (!this.leaving.has(key)) {
      return;
    }
    this.leaving.delete(key);
    this.dealt.delete(key);
    this.shown = this.shown.filter((c) => c.key !== key);
  }

  // ---------- the journey to a screen and home (Roots asks) ----------

  @api
  hasCard(key) {
    return this.live.some((c) => c.key === key) && !!this.button(key);
  }

  @api
  focusCard(key) {
    const b = this.hasCard(key) ? this.button(key) : null;
    if (b) {
      b.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  /** A card's size at scale 1. */
  @api
  cardSize() {
    return { w: this.hw, h: this.hh };
  }

  /**
   * Where a card is in the window, as the sheet should be when it is that card: { x, y (its
   * centre), w, h, r, s, radius }, or null. going: where it is going rather than where it is.
   */
  @api
  cardPose(key, { going = false } = {}) {
    const hand = this.handEl;
    if (!hand || !this.hasCard(key)) {
      return null;
    }
    const box = hand.getBoundingClientRect();
    const at = going
      ? this.motion.target(`card:${key}`)
      : this.motion.now(`card:${key}`);
    const v = at.x != null ? at : { x: 0, y: 0, r: 0, s: 1 };
    const s = v.s ?? 1;
    // The cards sit on the hand's bottom, which stays put while its height glides.
    return {
      x: box.left + box.width / 2 + v.x,
      y: box.bottom - BELOW - this.hh / 2 + v.y,
      w: this.hw * s,
      h: this.hh * s,
      r: v.r || 0,
      s,
      radius: this.radius() * s
    };
  }

  @api
  cardVelocity(key) {
    const vel = this.motion.vel(`card:${key}`);
    const out = {};
    ["x", "y", "r"].forEach((n) => {
      if (vel[n]) {
        out[n] = vel[n];
      }
    });
    return out;
  }

  /** The card's face shows (on) or gives way to the sheet that wears it. */
  @api
  showFace(key, on) {
    const face = this.button(key)?.querySelector("[data-face]");
    if (face) {
      face.style.opacity = on ? "" : "0";
    }
  }

  radius() {
    const value = parseFloat(
      window
        .getComputedStyle?.(this.template.host)
        ?.getPropertyValue?.("--shoresh-radius-piece")
    );
    return Number.isFinite(value) && value > 0 ? value : 12;
  }
}

/** A card's key as a CSS attribute value. */
function cssKey(key) {
  return String(key).replace(/["\\]/g, "\\$&");
}
