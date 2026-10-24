import { createMotion, smooth, W_GROW } from "c/shoreshMotion";

/**
 * The card-to-screen travel (repo ADR 0020; the approved mock-up's go() and home()): one sheet does
 * the whole journey. It starts as the card (its place, size, tilt, corner and face), and its shape
 * and place flow into the frame while the face gives way to the real screen, which is at its true
 * size the whole way and shows through the growing sheet. Roots recedes in the same breath. Back
 * runs the same motion the other way and lands on the card's own spot; interrupted either way, it
 * turns round from wherever it is.
 *
 * Roots draws the sheet and the card's face (its travel(v, key)); the page's screen is clipped to
 * the sheet and fades in over it. The page owns both, so it hands this:
 *   roots(): the c-shoresh-roots element; screen(key): that screen's wrapper; body(): the frame's
 *   body (the sheet grows to fill it); done(dir): the journey settled ("out" at the screen, "home"
 *   on the card).
 */
export class RootsTravel {
  constructor(host, clock) {
    this.host = host;
    this.motion = clock ? createMotion(clock) : createMotion();
    this.state = null;
    this.motion.track("sheet", (v) => this.draw(v), W_GROW);
  }

  /** Whether a journey is under way. */
  get busy() {
    return !!this.state;
  }

  /** Where the sheet is going: the frame's body, the part of it in the window. */
  frame() {
    const box = this.host.body().getBoundingClientRect();
    const top = Math.max(box.top, 0);
    const bottom = Math.min(box.bottom, window.innerHeight || box.bottom);
    const h = Math.max(1, bottom - top);
    return {
      x: box.left + box.width / 2,
      y: top + h / 2,
      w: box.width,
      h,
      r: 0
    };
  }

  /** The frame's corner, as the design system has it (12 at 1440 wide). */
  pieceRadius() {
    const body = this.host.body();
    const value = body
      ? parseFloat(
          window
            .getComputedStyle(body)
            .getPropertyValue("--shoresh-radius-piece")
        )
      : NaN;
    return Number.isFinite(value) && value > 0 ? value : 12;
  }

  /** The screen grows out of the card (or, mid-journey, turns toward the screen again). */
  out(screen, card) {
    const roots = this.host.roots();
    const wrap = this.host.screen(screen);
    if (!roots || !wrap) {
      return false;
    }
    const inFlight = !!this.state && this.motion.busy("sheet");
    const pose = inFlight ? null : roots.cardPose(card);
    if (!inFlight && !pose) {
      return false;
    }
    // Begun first, so the very first frame is already the card and the screen is clipped to it.
    this.begin(screen, card, "out", wrap);
    if (pose) {
      this.motion.to(
        "sheet",
        { ...pose, rad: pose.radius, p: 0 },
        { snap: true, vel: roots.cardVelocity(card) }
      );
    }
    this.motion.to(
      "sheet",
      { ...this.frame(), rad: this.pieceRadius(), p: 1 },
      { done: () => this.settle() }
    );
    return true;
  }

  /** The screen shrinks home into its card, the cursor on it. */
  home(screen, card) {
    const roots = this.host.roots();
    const wrap = this.host.screen(screen);
    if (!roots || !wrap) {
      return false;
    }
    const inFlight = !!this.state && this.motion.busy("sheet");
    this.begin(screen, card, "home", wrap);
    const pose = roots.prepareHome(card);
    if (!pose) {
      this.finish();
      return false;
    }
    if (!inFlight) {
      this.motion.to(
        "sheet",
        { ...this.frame(), rad: this.pieceRadius(), p: 1 },
        { snap: true }
      );
    }
    this.motion.to(
      "sheet",
      { ...pose, rad: pose.radius, p: 0 },
      { done: () => this.settle() }
    );
    return true;
  }

  begin(screen, card, dir, wrap) {
    if (this.state && this.state.wrap !== wrap) {
      this.clear(this.state.wrap);
    }
    const body = this.host.body();
    const roots = this.host.roots();
    if (body && roots && !this.state) {
      // Roots lies behind the screen while it travels: the frame keeps at least its height.
      body.style.minHeight = `${roots.offsetHeight}px`;
    }
    this.state = { screen, card, dir, wrap, box: wrap.getBoundingClientRect() };
  }

  /** One frame: Roots draws the sheet, the screen shows through it, clipped to it. */
  draw(v) {
    const s = this.state;
    if (!s) {
      return;
    }
    const roots = this.host.roots();
    const p = Math.max(0, Math.min(1, v.p));
    if (roots) {
      roots.travel({ ...v, radius: v.rad }, s.card);
    }
    const b = s.box;
    const top = Math.max(0, v.y - v.h / 2 - b.top);
    const left = Math.max(0, v.x - v.w / 2 - b.left);
    const right = Math.max(0, b.right - (v.x + v.w / 2));
    const bottom = Math.max(0, b.bottom - (v.y + v.h / 2));
    s.wrap.style.clipPath = `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px round ${Math.max(0, v.rad).toFixed(1)}px)`;
    s.wrap.style.opacity = smooth(0.22, 0.8, p).toFixed(3);
  }

  settle() {
    const s = this.state;
    if (!s) {
      return;
    }
    this.finish();
    this.host.done(s.dir, s);
  }

  /** Ends the journey where it is: the screen as itself, Roots as itself. */
  finish() {
    const s = this.state;
    this.state = null;
    if (s) {
      this.clear(s.wrap);
    }
    const body = this.host.body();
    if (body) {
      body.style.minHeight = "";
    }
    const roots = this.host.roots();
    if (roots) {
      roots.endTravel();
    }
  }

  clear(wrap) {
    if (wrap) {
      wrap.style.clipPath = "";
      wrap.style.opacity = "";
    }
  }

  stop() {
    this.finish();
    this.motion.stop();
  }
}
