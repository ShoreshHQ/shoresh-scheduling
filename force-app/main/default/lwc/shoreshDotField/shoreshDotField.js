import { LightningElement, api } from "lwc";
import {
  DOT,
  GLOW_FALLBACK,
  REST_FALLBACK,
  FADE_STEPS,
  REACH,
  dotColour,
  layoutDots,
  rgb,
  settle,
  tableFade,
  warm
} from "./field";

// The design system's colours (c/shoreshTokens), read from the page.
const REST_TOKEN = "--shoresh-color-primary-500";
const GLOW_TOKEN = "--shoresh-color-highlight";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// A mouse or trackpad: something that can hover. Touch screens get the still field.
const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const MAX_DPR = 2;
const SIX_FRAMES = 0.1;

/**
 * The living dot field (wiki decision 49; ADR 0015 choice 13): a faint sage dot field behind
 * whatever is put inside it. Dots near the cursor glow and warm toward forest, then settle.
 * Purely decorative: the canvas is hidden from screen readers, takes no focus and no clicks,
 * and no dot is drawn under words or a control, so it never changes how anything reads.
 *
 * Still (drawn once, never animated) for reduced motion and for touch. Draws no frames while
 * the cursor is still, while it is off screen, or while the browser tab is hidden. Never put
 * it behind a schedule grid.
 */
export default class ShoreshDotField extends LightningElement {
  /**
   * Its content covers it with solid surfaces of their own (Roots' table, ADR 0020: cards, and
   * labels on the table's colour): dots fill the whole field, fainter in the middle, and the
   * field measures nothing, since nothing it holds shows words over the dots.
   */
  @api solid = false;

  live = false;

  canvas;
  ctx;
  dots = layoutDots(0, 0);
  heat = new Float32Array(0);
  width = 0;
  height = 0;
  rest = REST_FALLBACK;
  glow = GLOW_FALLBACK;
  visible = true;
  frame = 0;
  last = 0;
  pointer = null;
  stale = true;
  mediaReduced;
  mediaFine;
  resizer;
  watcher;

  /** A solid field fills the box it is given (Roots' table is as tall as its frame). */
  get fieldClass() {
    return this.solid ? "field field_solid" : "field";
  }

  /** "live" when the field follows the cursor, "still" when it is drawn once. */
  get motion() {
    return this.live ? "live" : "still";
  }

  connectedCallback() {
    // Without media queries there is no way to know whether motion is wanted: draw nothing.
    if (typeof window.matchMedia !== "function") return;
    this.mediaReduced = window.matchMedia(REDUCED_MOTION);
    this.mediaFine = window.matchMedia(FINE_POINTER);
    this.mediaReduced.addEventListener?.("change", this.onMediaChange);
    this.mediaFine.addEventListener?.("change", this.onMediaChange);
    this.live = this.wantsMotion();
    window.addEventListener("pointermove", this.onPointerMove, {
      passive: true
    });
    // Words that stay put while the page scrolls (a sticky list) move over the field.
    window.addEventListener("scroll", this.onScroll, {
      capture: true,
      passive: true
    });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  renderedCallback() {
    if (this.canvas || !this.mediaReduced) return;
    this.canvas = this.template.querySelector('[data-id="dots"]');
    this.ctx = this.canvas?.getContext("2d");
    if (!this.ctx) return;
    this.readColours();
    const box = this.template.querySelector('[data-id="field"]');
    if (typeof ResizeObserver === "function") {
      this.resizer = new ResizeObserver(this.onLayoutChange);
      this.resizer.observe(box);
    }
    if (typeof IntersectionObserver === "function") {
      this.watcher = new IntersectionObserver(this.onIntersect);
      this.watcher.observe(box);
    }
    this.redraw();
  }

  disconnectedCallback() {
    this.stop();
    this.mediaReduced?.removeEventListener?.("change", this.onMediaChange);
    this.mediaFine?.removeEventListener?.("change", this.onMediaChange);
    window.removeEventListener("pointermove", this.onPointerMove, {
      passive: true
    });
    window.removeEventListener("scroll", this.onScroll, {
      capture: true,
      passive: true
    });
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resizer?.disconnect();
    this.watcher?.disconnect();
    this.resizer = undefined;
    this.watcher = undefined;
    this.canvas = undefined;
    this.ctx = undefined;
  }

  wantsMotion() {
    return !this.mediaReduced.matches && this.mediaFine.matches;
  }

  readColours() {
    try {
      const style = window.getComputedStyle(this.template.host);
      this.rest = rgb(style.getPropertyValue(REST_TOKEN)) || REST_FALLBACK;
      this.glow = rgb(style.getPropertyValue(GLOW_TOKEN)) || GLOW_FALLBACK;
    } catch {
      // The fallbacks are the same colours.
    }
  }

  // ---------- events ----------

  onMediaChange = () => {
    this.live = this.wantsMotion();
    if (!this.live) {
      this.stop();
      this.heat.fill(0);
    }
    this.redraw();
  };

  onPointerMove = (event) => {
    if (!this.live || !this.ctx || !this.running()) return;
    if (event.pointerType && event.pointerType !== "mouse") return;
    const box = this.canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    if (x < -REACH || y < -REACH || x > box.width + REACH) return;
    if (y > box.height + REACH) return;
    this.pointer = [x, y];
    this.kick();
  };

  onScroll = () => {
    this.stale = true;
    if (this.ctx && this.running()) this.kick();
  };

  onLayoutChange = () => {
    this.stale = true;
    this.redraw();
  };

  onIntersect = (entries) => {
    const entry = entries[entries.length - 1];
    this.visible = !!entry?.isIntersecting;
    if (!this.visible) {
      this.stop();
    } else {
      this.stale = true;
      this.redraw();
    }
  };

  onVisibility = () => {
    if (document.hidden) this.stop();
    else this.redraw();
  };

  handleSlotChange() {
    this.stale = true;
    this.redraw();
  }

  // ---------- frames ----------

  /** On screen and in a tab that is shown. */
  running() {
    return this.visible && !document.hidden;
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pointer = null;
  }

  /** Asks for one frame, unless one is already coming or the field can't be seen. */
  kick() {
    if (this.frame || !this.running()) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  /** A frame: settle, warm near the cursor, draw, and ask for another only while any glow. */
  tick = (time) => {
    this.frame = 0;
    if (!this.ctx) return;
    this.layout();
    const dt = this.last ? Math.min(SIX_FRAMES, (time - this.last) / 1000) : 0;
    this.last = time;
    let warmNow = this.live && settle(this.heat, dt);
    if (this.live && this.pointer) {
      warmNow = warm(this.heat, this.dots, ...this.pointer) || warmNow;
    }
    this.pointer = null;
    this.draw();
    if (warmNow) this.kick();
    else this.last = 0;
  };

  /** Draws the field now (once), when nothing is moving; a running burst draws itself. */
  redraw() {
    if (!this.ctx || this.frame || !this.running()) return;
    this.layout();
    this.draw();
    if (this.live && this.heat.some((h) => h > 0)) this.kick();
  }

  /** Sizes the canvas and places the dots clear of the words, when anything has moved. */
  layout() {
    const box = this.canvas.getBoundingClientRect();
    const width = Math.round(box.width);
    const height = Math.round(box.height);
    if (!this.stale && width === this.width && height === this.height) return;
    this.stale = false;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (width !== this.width || height !== this.height) {
      this.canvas.width = Math.max(1, Math.round(width * dpr));
      this.canvas.height = Math.max(1, Math.round(height * dpr));
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = width;
    this.height = height;
    this.dots = this.solid
      ? layoutDots(width, height, [], tableFade)
      : layoutDots(width, height, this.clearOf(box));
    this.heat = new Float32Array(this.dots.count);
  }

  /** Where the words and controls inside the field are, in the field's own coordinates. */
  clearOf(box) {
    const slot = this.template.querySelector("slot");
    const rects = [];
    const add = (r) => {
      if (r && r.width > 0 && r.height > 0) {
        rects.push({
          left: r.left - box.left,
          top: r.top - box.top,
          right: r.right - box.left,
          bottom: r.bottom - box.top
        });
      }
    };
    const range = document.createRange?.();
    const visit = (node) => {
      if (node.nodeType === 3) {
        if (!node.textContent.trim()) return;
        if (range?.getBoundingClientRect) {
          range.selectNodeContents(node);
          add(range.getBoundingClientRect());
        } else {
          add(node.parentElement?.getBoundingClientRect());
        }
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      // Another component, a picture or a form control: keep clear of all of it.
      if (tag.includes("-") || /^(svg|img|input|select|textarea)$/.test(tag)) {
        add(node.getBoundingClientRect());
        return;
      }
      node.childNodes.forEach(visit);
    };
    const inside = slot?.assignedNodes ? slot.assignedNodes() : this.childNodes;
    Array.from(inside || []).forEach(visit);
    return rects;
  }

  /** Rest dots in a few fills (one per step of fade), warm dots one by one. */
  draw() {
    const { ctx, dots, heat, rest, glow } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    const restColour = `${rest[0]},${rest[1]},${rest[2]}`;
    for (let step = 1; step <= FADE_STEPS; step++) {
      const fade = step / FADE_STEPS;
      ctx.beginPath();
      let any = false;
      for (let k = 0; k < dots.count; k++) {
        if (heat[k] > 0) continue;
        if (Math.ceil(dots.fade[k] * FADE_STEPS) !== step) continue;
        ctx.moveTo(dots.x[k] + DOT.restRadius, dots.y[k]);
        ctx.arc(dots.x[k], dots.y[k], DOT.restRadius, 0, Math.PI * 2);
        any = true;
      }
      if (any) {
        ctx.fillStyle = `rgba(${restColour},${DOT.restAlpha * fade})`;
        ctx.fill();
      }
    }
    for (let k = 0; k < dots.count; k++) {
      const h = heat[k];
      if (h <= 0) continue;
      const [r, g, b] = dotColour(rest, glow, h);
      const alpha = DOT.restAlpha * dots.fade[k] + DOT.warmAlpha * h;
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.beginPath();
      ctx.arc(
        dots.x[k],
        dots.y[k],
        DOT.restRadius + DOT.warmRadius * h,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}
