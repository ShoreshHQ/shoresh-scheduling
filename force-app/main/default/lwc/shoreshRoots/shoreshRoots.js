import { LightningElement, api } from "lwc";
import { campWorkbookSheets } from "c/shoreshLists";
import { downloadWorkbook, fileNameOf } from "c/shoreshDownload";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { reasonOf } from "c/shoreshErrors";
import { menuSections, screenLabels } from "c/shoreshScreens";
import { FIELD } from "c/shoreshSchema";
import getTable from "@salesforce/apex/RootsController.getTable";
import {
  MELD_REST,
  glimpseOf,
  nameWidth,
  pictureSize,
  readCamp,
  smallOf
} from "c/shoreshRootsFaces";
import { createMotion, smooth, W_MOVE } from "c/shoreshMotion";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const COARSE_POINTER = "(pointer: coarse)";
// Hover intent: a meld opens when the pointer rests on it, and closes a moment after it leaves.
const OPEN_AFTER = 170;
const CLOSE_AFTER = 300;
// The fan unfolds card after card.
const STAGGER = 38;
// At rest a meld lies slightly fanned: its front card, and the tops of the two behind it.
const REST_FAN = [
  [0, 0, 0],
  [-4, -1, -1.1],
  [3, -2, 0.9]
];
const GAP = 14;
const KEYS_NEXT = new Set(["ArrowRight", "ArrowDown"]);
const KEYS_MOVE = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"]);

/**
 * Roots, the home screen: the canasta table (wiki decisions 60 to 68, approved 2026-10-24; repo
 * ADR 0020). Three melds, one per menu section (Camp; Activities & Events; Schedules), lie on a calm
 * table over the living dot field, each slightly fanned. Resting the pointer on a meld (or tabbing
 * into it) fans it open while the others ease aside; every card's face is drawn from the camp's own
 * data. A card opens its real screen: the page grows the screen out of the card (travel, below),
 * and coming back to Roots shrinks it home to the same card, with the cursor on it. All motion is
 * one continuous, interruptible model (c/shoreshMotion); with reduced motion asked for, nothing
 * moves.
 *
 * Until the hand (slice R2), "Needs your attention" sits where the hand will go, along the bottom,
 * and the camp's workbook tools (Import last year, Download worksheet, a workbook import, Undo
 * last import) sit under it.
 *
 * Fires: navigate { screen, fromCard? }; imported; undoimport { importId, files }
 */
export default class ShoreshRoots extends LightningElement {
  downloading = false;
  /** The season setup from SeasonSetupController. */
  @api setup;
  @api terms;
  /** From shoreshSetupRules.setupProblems: [{ key, screen, name, why }]. */
  @api problems = [];

  /** What the table draws beyond the setup (RootsController.getTable), once read. */
  table = null;
  /** Each shrunk card's picture size (0: its full glimpse). Reactive: a card changes over once. */
  pics = {};
  /** The card a screen is growing out of or shrinking into (its face rides on the sheet). */
  travelKey = null;

  _active = false;
  readSeason = null;
  reading = 0;
  motion = createMotion();
  built = false;
  melded = [];
  cw = 260;
  ch = 186;
  hoverMeld = null;
  cancelIntent = null;
  mediaReduced;
  mediaCoarse;
  resizer;
  faceCache = new Map();
  faceCamp = null;
  campOf = null;

  /** True while Roots is the screen shown: it reads its table each time it is shown. */
  @api
  get active() {
    return this._active;
  }
  set active(value) {
    const was = this._active;
    this._active = !!value;
    if (this._active && !was) {
      this.readTable();
    }
  }

  connectedCallback() {
    if (typeof window.matchMedia === "function") {
      this.mediaReduced = window.matchMedia(REDUCED_MOTION);
      this.mediaCoarse = window.matchMedia(COARSE_POINTER);
    }
    window.addEventListener("resize", this.onWindowResize);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.onWindowResize);
    this.resizer?.disconnect();
    this.resizer = undefined;
    this.motion.stop();
    this.motion = createMotion();
    this.built = false;
  }

  renderedCallback() {
    // A season read before Roots was first shown, or another season chosen: read it again.
    const seasonId = this.setup?.season?.Id || null;
    if (this._active && seasonId !== this.readSeason) {
      this.readTable();
    }
    if (!this.built) {
      this.build();
    }
  }

  get reduced() {
    return !!this.mediaReduced?.matches;
  }

  get coarse() {
    return !!this.mediaCoarse?.matches;
  }

  /** The screen's heading takes the cursor (the page calls this when Roots opens). */
  @api
  focusHeading() {
    const heading = this.template.querySelector("[data-heading]");
    if (heading) {
      heading.focus();
    }
  }

  // ---------- the one request ----------

  async readTable() {
    const seasonId = this.setup?.season?.Id || null;
    this.readSeason = seasonId;
    if (!seasonId) {
      return;
    }
    const mine = ++this.reading;
    try {
      const table = await getTable({ seasonId });
      if (mine === this.reading) {
        this.table = table;
      }
    } catch (e) {
      // The table still draws everything the setup holds; the schedule cards show their
      // outlines, and the director is told why the rest is missing (never silently).
      if (mine === this.reading) {
        this.table = null;
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Roots could not read your schedules",
            message: reasonOf(e),
            variant: "error"
          })
        );
      }
    }
  }

  // ---------- what the template shows ----------

  /** The camp as the faces draw it, read again only when the setup or the table changes. */
  get camp() {
    if (
      this.campOf?.setup !== this.setup ||
      this.campOf?.table !== this.table
    ) {
      this.campOf = {
        setup: this.setup,
        table: this.table,
        camp: readCamp(this.setup, this.table)
      };
    }
    return this.campOf.camp;
  }

  get labels() {
    return screenLabels(this.terms);
  }

  /** The menu's three sections, in its order, each card in the camp's words. */
  get melds() {
    const camp = this.camp;
    if (camp !== this.faceCamp) {
      this.faceCamp = camp;
      this.faceCache = new Map();
    }
    const terms = this.terms;
    return menuSections(terms, true)
      .filter((section) => section.title)
      .map((section) => ({
        key: section.key,
        title: section.title,
        door: section.door ? section.door.key : null,
        cards: section.items
          .filter((item) => !item.disabled)
          .map((item) => {
            const f = this.pics[item.key] || 0;
            const small = smallOf(item.key, camp, terms);
            return {
              key: item.key,
              label: item.label,
              small,
              glimpse: this.faceOf(item.key, camp, f)
            };
          })
      }));
  }

  faceOf(key, camp, f) {
    const id = `${key}|${f}`;
    if (!this.faceCache.has(id)) {
      this.faceCache.set(id, glimpseOf(key, camp, f));
    }
    return this.faceCache.get(id);
  }

  /** The card a screen travels to or from, worn by the sheet. */
  get travelCard() {
    if (!this.travelKey) {
      return null;
    }
    for (const meld of this.melds) {
      const card = meld.cards.find((c) => c.key === this.travelKey);
      if (card) {
        return card;
      }
    }
    return null;
  }

  get travelPic() {
    return (this.pics[this.travelKey] || 0) > 0 ? "true" : null;
  }

  /** Alphabetical by name, as on the desktop: a stable order that makes no claim about priority. */
  get attention() {
    const labels = this.labels;
    return [...(this.problems || [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((problem) => ({
        ...problem,
        tag: labels[problem.screen],
        ariaLabel: `${problem.name}: ${problem.why}`
      }));
  }

  get hasAttention() {
    return (this.problems || []).length > 0;
  }

  /** Setup screens' rows, for whether the camp has any setup yet. */
  rowsFor(key) {
    const programs = (this.setup && this.setup.programs) || [];
    const divisions = programs.flatMap((entry) => entry.divisions || []);
    switch (key) {
      case "groups":
        return divisions.flatMap((d) => d.groups || []);
      case "divisions":
        return divisions;
      case "timeBlocks":
        return programs.flatMap((entry) => entry.timeBlocks || []);
      default:
        return [];
    }
  }

  /**
   * Whether the camp has any setup yet: divisions, groups or time blocks (desktop
   * campHasSetupData, the required areas). An empty camp sees "Import last year" as the first
   * thing to do (desktop SeedScreen.jsx); once it has data the import recedes to a quiet
   * "Re-import last year", still reachable (desktop navSections.js ADMIN_MENU_ITEMS).
   */
  get campHasData() {
    return ["divisions", "groups", "timeBlocks"].some(
      (key) => this.rowsFor(key).length > 0
    );
  }

  get campIsEmpty() {
    return !this.campHasData;
  }

  /** The season's last import that stands: "Last import: <files>, <when>". */
  get lastImport() {
    const last = this.setup && this.setup.lastImport;
    if (!last) {
      return null;
    }
    const when = new Date(last.CreatedDate).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
    return {
      id: last.Id,
      files: last[FIELD.Import.Files],
      line: `Last import: ${last[FIELD.Import.Files] || "a file"}, ${when}`
    };
  }

  // ---------- doing ----------

  /** A card: its real screen, grown out of the card (the page runs the travel). */
  handleCardClick(event) {
    const key = event.currentTarget.dataset.card;
    this.dispatchEvent(
      new CustomEvent("navigate", { detail: { screen: key, fromCard: key } })
    );
  }

  /** A door (the Schedules title) or an item that needs attention: that screen. */
  handleOpen(event) {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: event.currentTarget.dataset.screen }
      })
    );
  }

  handleUndoImport() {
    this.dispatchEvent(
      new CustomEvent("undoimport", {
        detail: { importId: this.lastImport.id, files: this.lastImport.files }
      })
    );
  }

  /** A camp workbook was imported or undone: the page reloads the season. */
  handleImported() {
    this.dispatchEvent(new CustomEvent("imported"));
  }

  /**
   * The whole camp in one workbook (slice 4c part C): a sheet per setup list, in the layout each
   * screen imports, plus location types, camp words, weeks, and the weeks each item runs in.
   */
  async handleDownloadWorkbook() {
    if (this.downloading) {
      return;
    }
    this.downloading = true;
    try {
      await downloadWorkbook(
        this,
        campWorkbookSheets(this.setup, this.terms),
        fileNameOf(`${this.setup.season.Name} - worksheet`)
      );
    } catch (e) {
      this.dispatchEvent(
        new ShowToastEvent({
          title: "The worksheet could not be downloaded",
          message: reasonOf(e),
          variant: "error"
        })
      );
    } finally {
      this.downloading = false;
    }
  }

  // ---------- the table: building it and its motion ----------

  get tableEl() {
    return this.template.querySelector('[data-id="table"]');
  }

  /** Finds the melds and cards on the page and starts following them (once they are drawn). */
  build() {
    const table = this.tableEl;
    if (!table) {
      return;
    }
    const roots = [...this.template.querySelectorAll("[data-meld]")];
    if (!roots.length) {
      return;
    }
    this.built = true;
    const sections = this.melds;
    this.melded = roots.map((root, mi) => {
      const section = sections.find((s) => s.key === root.dataset.meld);
      const label = root.querySelector("[data-label]");
      const spread = root.querySelector("[data-spread]");
      const cards = [...root.querySelectorAll("[data-card]")].map((b) => {
        const card = { key: b.dataset.card, b, pos: null, picF: null };
        this.motion.track(
          `card:${card.key}`,
          (v) => this.applyCard(card, v),
          W_MOVE
        );
        return card;
      });
      const meld = {
        key: root.dataset.meld,
        mi,
        root,
        label,
        spread,
        cards,
        rest: MELD_REST[root.dataset.meld] || [],
        restLabels: (section?.cards || [])
          .filter((c) => (MELD_REST[root.dataset.meld] || []).includes(c.key))
          .map((c) => c.label),
        open: false,
        cancelClose: null
      };
      this.motion.track(`label:${meld.key}`, (v) => {
        label.style.transform = `translate(${(v.x - (label._w || 0) / 2).toFixed(2)}px, ${(v.y - 12).toFixed(2)}px)`;
      });
      return meld;
    });
    if (typeof ResizeObserver === "function") {
      this.resizer = new ResizeObserver(() => this.layout());
      this.resizer.observe(table);
    }
    this.fit();
    this.layout();
  }

  /** Roots is as tall as the window leaves it (the table is the screen; nothing scrolls past it). */
  fit() {
    const root = this.template.querySelector('[data-id="roots"]');
    if (!root) {
      return;
    }
    const top = root.getBoundingClientRect().top + (window.scrollY || 0);
    if (!root.getClientRects().length) {
      return;
    }
    const room = (window.innerHeight || 0) - Math.max(0, top) - 12;
    root.style.minHeight = `${Math.max(520, Math.round(room))}px`;
  }

  onWindowResize = () => {
    this.fit();
    this.layout();
  };

  openMeldOf(card) {
    return this.melded.find((m) => m.cards.includes(card));
  }

  // Hover intent: a meld opens when the pointer rests on it; the table never has to stand still
  // first, since whatever is moving bends toward the new layout.
  handleMeldOver(event) {
    if (this.coarse) {
      return;
    }
    const meld = this.meldOf(event.currentTarget);
    if (!meld) {
      return;
    }
    this.hoverMeld = meld;
    if (this.cancelIntent) {
      this.cancelIntent();
    }
    if (meld.open) {
      if (meld.cancelClose) {
        meld.cancelClose();
      }
      return;
    }
    this.cancelIntent = this.motion.after(OPEN_AFTER, () => {
      if (this.hoverMeld === meld) {
        this.openMeld(meld, { again: true });
      }
    });
  }

  handleMeldOut(event) {
    const meld = this.meldOf(event.currentTarget);
    if (!meld || meld.root.contains(event.relatedTarget)) {
      return;
    }
    if (this.hoverMeld === meld) {
      this.hoverMeld = null;
    }
    if (meld.cancelClose) {
      meld.cancelClose();
    }
    meld.cancelClose = this.motion.after(CLOSE_AFTER, () => {
      if (this.hoverMeld !== meld && !meld.root.contains(this.focused())) {
        this.closeMeld(meld);
      }
    });
  }

  handleMeldFocusIn(event) {
    const meld = this.meldOf(event.currentTarget);
    if (meld) {
      // The cursor moved on from the card Escape left it on (Tab, say): that is moving it, so
      // the meld opens again and the card it lands on shows (WCAG 2.4.7, 2.4.11).
      this.openMeld(meld, {
        again: !!meld.held && event.target !== meld.held
      });
    }
  }

  handleMeldFocusOut(event) {
    const meld = this.meldOf(event.currentTarget);
    if (meld && !meld.root.contains(event.relatedTarget)) {
      meld.held = false;
      this.closeMeld(meld);
    }
  }

  /** Arrows move between a meld's cards; Escape closes it, the cursor on its front card. */
  handleMeldKeydown(event) {
    const meld = this.meldOf(event.currentTarget);
    if (!meld) {
      return;
    }
    if (event.key === "Escape" && meld.open) {
      const front =
        meld.cards.find((c) => c.key === meld.rest[0]) || meld.cards[0];
      // The cursor stays in the meld, on its front card, and the meld rests closed until the
      // cursor moves again (held: the card it was left on).
      meld.held = front?.b || null;
      meld.open = false;
      meld.root.removeAttribute("data-open");
      this.layout();
      front?.b.focus({ preventScroll: true });
      event.preventDefault();
      return;
    }
    if (!KEYS_MOVE.has(event.key)) {
      return;
    }
    const at = meld.cards.findIndex((c) => c.b === this.focused());
    if (at < 0) {
      return;
    }
    const step = KEYS_NEXT.has(event.key) ? 1 : -1;
    const next =
      meld.cards[(at + step + meld.cards.length) % meld.cards.length];
    this.openMeld(meld, { again: true });
    next.b.focus({ preventScroll: true });
    event.preventDefault();
  }

  focused() {
    return this.template.activeElement || null;
  }

  meldOf(root) {
    return this.melded.find((m) => m.root === root);
  }

  /** again: the pointer rested on it or an arrow moved the cursor (a meld Escape closed opens). */
  openMeld(meld, { again = false } = {}) {
    if (meld.cancelClose) {
      meld.cancelClose();
    }
    if (again) {
      meld.held = false;
    }
    if (meld.open || meld.held) {
      return;
    }
    this.melded.forEach((other) => {
      if (other === meld || !other.open) {
        return;
      }
      const holds = other.root.contains(this.focused());
      // The pointer resting on another meld wins over a cursor left in this one (after coming
      // home, say): the cursor lets go rather than stay on a card that steps aside.
      if (holds && again) {
        this.focused().blur();
      }
      if (!holds || again) {
        other.open = false;
        other.root.removeAttribute("data-open");
      }
    });
    meld.open = true;
    meld.root.setAttribute("data-open", "");
    this.layout(true);
  }

  closeMeld(meld) {
    // While a screen is grown over the table, the table holds still behind it.
    if (!meld.open || this.travelKey) {
      return;
    }
    meld.open = false;
    meld.root.removeAttribute("data-open");
    this.layout();
    if (this.hoverMeld && this.hoverMeld !== meld) {
      this.handleMeldOver({ currentTarget: this.hoverMeld.root });
    }
  }

  // ---------- geometry (the approved mock-up's layout) ----------

  /** Where every card and label goes for the melds as they are (one open, or all at rest). */
  layout(stagger = false) {
    const table = this.tableEl;
    if (!table || !this.melded.length) {
      return;
    }
    const Wt = table.clientWidth;
    const Ht = table.clientHeight;
    if (!Wt || !Ht) {
      return;
    }
    // Never smaller than 248: the glimpse's 11 px words stay 11 px on a front card.
    const cw = Math.round(Math.max(248, Math.min(300, Wt * 0.25)));
    const ch = Math.round(cw * 0.72);
    this.cw = cw;
    this.ch = ch;
    table.style.setProperty("--cw", `${cw}px`);
    table.style.setProperty("--ch", `${ch}px`);
    const open = this.melded.find((m) => m.open);
    const fan = Math.round(ch * 0.17);
    const restS = Math.min(
      1,
      (Wt / 3 - 20) / cw,
      (Ht - 70) / (ch + 2 * fan + 40)
    );
    // A stepped-aside meld is small, but never so small that its cards' names (11.5 px) are cut.
    const longest = Math.max(
      1,
      ...this.melded.flatMap((m) => m.restLabels.map((l) => nameWidth(l)))
    );
    const sideS = Math.max(restS * 0.46, (longest * 11.5 + 4) / (cw - 28));
    const sideW = cw * sideS + 36;
    let region = null;
    if (open) {
      // The closed melds step aside into one column on each side that has any (two, stacked, when
      // the open meld is at an end), so the open meld keeps the width its words need.
      const nL = open.mi ? 1 : 0;
      const nR = open.mi < this.melded.length - 1 ? 1 : 0;
      const x0 = 18 + nL * sideW;
      const x1 = Wt - 18 - nR * sideW;
      const n = open.cards.length;
      let best = null;
      for (let rows = 1; rows <= 3; rows++) {
        const cols = Math.ceil(n / rows);
        if (rows > 1 && cols * (rows - 1) >= n) {
          continue;
        }
        const vg = GAP + ((cols - 1) / 2) ** 2 * 2.5;
        const s = Math.min(
          1.04,
          (x1 - x0 - (cols - 1) * GAP) / (cols * cw),
          (Ht - 64 - (rows - 1) * vg) / (rows * ch)
        );
        if (!best || s > best.s + 0.02) {
          best = { s, cols, rows };
        }
      }
      region = { x0, x1, ...best, n };
    }
    this.melded.forEach((meld) => {
      meld.root.style.zIndex = meld.open ? "5" : "1";
      if (meld === open) {
        this.fanOpen(meld, region, Ht, stagger);
        return;
      }
      let cx;
      let cy;
      let s;
      if (!open) {
        cx = (Wt * (meld.mi + 0.5)) / this.melded.length;
        s = restS;
        cy = Ht * 0.5 + fan * s;
      } else {
        s = sideS;
        const leftSide = meld.mi < open.mi;
        const same = this.melded.filter(
          (x) => x !== open && x.mi < open.mi === leftSide
        );
        const k = same.indexOf(meld);
        cx = leftSide ? 18 + sideW * 0.5 : region.x1 + sideW * 0.5;
        cy =
          same.length === 1
            ? Ht * 0.5 + fan * s
            : Ht * (k ? 0.74 : 0.3) + fan * s;
      }
      this.rest(meld, cx, cy, s, fan);
    });
  }

  /** A meld's cards keep one stacking order, open or at rest, so nothing pops in front. */
  restOrder(meld) {
    const order = meld.rest
      .map((k) => meld.cards.findIndex((c) => c.key === k))
      .filter((i) => i >= 0);
    meld.cards.forEach((c, i) => {
      if (!order.includes(i)) {
        order.push(i);
      }
    });
    return order;
  }

  rest(meld, cx, cy, s, fan) {
    const lift = s < 0.6 ? 1.5 : 1; // room for a far meld's larger names
    this.restOrder(meld).forEach((ci, d) => {
      const card = meld.cards[ci];
      const [dx, dy, rot] = REST_FAN[Math.min(d, 2)];
      toggle(card.b, "data-gone", d > 2);
      toggle(card.b, "data-front", d === 0);
      this.put(
        card,
        cx + dx * s,
        cy + dy * fan * s * lift,
        rot,
        s,
        30 - d,
        0,
        d > 2 ? 0 : 1
      );
    });
    this.placeLabel(meld, cx, cy - (this.ch * s) / 2 - 2 * fan * s * lift - 22);
    meld.spread.style.cssText = "";
  }

  /** Open: every card of the meld, in gently arced rows. */
  fanOpen(meld, R, Ht, stagger) {
    const order = this.restOrder(meld);
    const { s, cols, n, rows } = R;
    const cwS = this.cw * s;
    const chS = this.ch * s;
    const vgap = GAP + ((cols - 1) / 2) ** 2 * 2.5;
    const spanW = cols * cwS + (cols - 1) * GAP;
    const spanH = rows * chS + (rows - 1) * vgap;
    const left = (R.x0 + R.x1) / 2 - spanW / 2;
    const top = Math.max(40, (Ht - spanH) / 2 + 12);
    meld.cards.forEach((card, i) => {
      const r = Math.floor(i / cols);
      const k = i % cols;
      const rowLen = r === rows - 1 ? n - r * cols : cols;
      const off = ((cols - rowLen) * (cwS + GAP)) / 2;
      const kk = k - (rowLen - 1) / 2;
      const x = left + off + k * (cwS + GAP) + cwS / 2;
      const y = top + r * (chS + vgap) + chS / 2 + kk * kk * 2.5;
      toggle(card.b, "data-gone", false);
      toggle(card.b, "data-front", false);
      this.put(
        card,
        x,
        y,
        kk * 0.9,
        s,
        30 - order.indexOf(i),
        stagger ? i * STAGGER : 0,
        1
      );
    });
    this.placeLabel(meld, left + spanW / 2, top - 30);
    Object.assign(meld.spread.style, {
      left: `${left - 26}px`,
      top: `${top - 44}px`,
      width: `${spanW + 52}px`,
      height: `${spanH + 70}px`
    });
  }

  put(card, x, y, r, s, z, delay, o) {
    card.pos = { x, y, s, r };
    card.b.style.zIndex = String(z);
    this.motion.to(
      `card:${card.key}`,
      { x, y, r, s, o },
      {
        delay,
        snap: this.reduced
      }
    );
  }

  applyCard(card, v) {
    const s = v.s;
    const { cw, ch } = this;
    card.b.style.transform = `translate(${(v.x - cw / 2).toFixed(2)}px, ${(v.y - ch / 2).toFixed(2)}px) rotate(${v.r.toFixed(3)}deg) scale(${s.toFixed(4)})`;
    card.b.style.opacity = v.o >= 0.999 ? "" : v.o.toFixed(3);
    // A shrunk card's name is set larger so it still reads at 11.5 px or more, and a glimpse whose
    // words would fall under 11 px becomes a picture only. The picture is drawn for the size the
    // card is going to, and changes over once, as the card's size passes the point where its words
    // stop (or start) reading.
    const nfs = s < 0.9 ? Math.max(13, 11.5 / s) : 13;
    card.b.style.setProperty("--nfs", `${nfs.toFixed(2)}px`);
    const goal = card.pos ? card.pos.s : s;
    const fT = pictureSize(goal, cw, ch);
    const fN = pictureSize(s, cw, ch);
    const settled = Math.abs(s - goal) < 1e-3;
    const crossed =
      card.picF != null && fN > 0 !== card.picF > 0 && fT > 0 === fN > 0;
    const f = card.picF == null || settled || crossed ? fT : card.picF;
    if (card.picF !== f) {
      card.picF = f;
      toggle(card.b, "data-pic", f > 0);
      if ((this.pics[card.key] || 0) !== f) {
        this.pics = { ...this.pics, [card.key]: f };
      }
    }
  }

  placeLabel(meld, x, y) {
    meld.label._w = meld.label.offsetWidth;
    this.motion.to(`label:${meld.key}`, { x, y }, { snap: this.reduced });
  }

  // ---------- travel: the page grows a screen out of a card, and back ----------

  meldCard(key) {
    for (const meld of this.melded) {
      const card = meld.cards.find((c) => c.key === key);
      if (card) {
        return { meld, card };
      }
    }
    return null;
  }

  /** Whether Roots has a card for that screen. */
  @api
  hasCard(key) {
    return !!this.meldCard(key);
  }

  /**
   * Where a card is now, in the window's coordinates, as the sheet should be when it is that card:
   * { x, y (its centre), w, h, r (degrees), s (its scale), radius }, or null.
   */
  @api
  cardPose(key, { going = false } = {}) {
    const found = this.meldCard(key);
    const table = this.tableEl;
    if (!found || !table) {
      return null;
    }
    const { card } = found;
    const box = table.getBoundingClientRect();
    // The table, measured unscaled (it recedes a little while a screen grows over it).
    const ox = box.left + box.width / 2 - table.offsetWidth / 2;
    const oy = box.top + box.height / 2 - table.offsetHeight / 2;
    const at = going
      ? this.motion.target(`card:${key}`)
      : this.motion.now(`card:${key}`);
    const v = at.s != null ? at : card.pos || { x: 0, y: 0, s: 1, r: 0 };
    return {
      x: ox + v.x,
      y: oy + v.y,
      w: this.cw * v.s,
      h: this.ch * v.s,
      r: v.r || 0,
      s: v.s,
      radius: this.radius() * v.s
    };
  }

  /** How fast the card is moving now, as the sheet's own values (it carries on from there). */
  @api
  cardVelocity(key) {
    const vel = this.motion.vel(`card:${key}`);
    const out = {};
    ["x", "y", "r"].forEach((n) => {
      if (vel[n]) {
        out[n] = vel[n];
      }
    });
    if (vel.s) {
      out.w = { v: vel.s.v * this.cw, lead: vel.s.lead * this.cw };
      out.h = { v: vel.s.v * this.ch, lead: vel.s.lead * this.ch };
    }
    return out;
  }

  /**
   * Coming home to a card: its meld opens (its neighbours make room as the sheet comes back), the
   * cursor goes to it, and its pose is where it is going. Null when Roots has no such card.
   */
  @api
  prepareHome(key) {
    const found = this.meldCard(key);
    if (!found) {
      return null;
    }
    this.fit();
    this.layout();
    found.card.b.focus({ preventScroll: true });
    this.openMeld(found.meld, { again: true });
    return this.cardPose(key, { going: true });
  }

  /** Puts the cursor on a card. */
  @api
  focusCard(key) {
    const found = this.meldCard(key);
    if (found) {
      found.card.b.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  radius() {
    const value = parseFloat(
      window
        .getComputedStyle?.(this.template.host)
        ?.getPropertyValue?.("--shoresh-radius-piece")
    );
    return Number.isFinite(value) && value > 0 ? value : 12;
  }

  /**
   * One frame of the travel (the page drives it): the sheet at { x, y, w, h, r } in the window's
   * coordinates, p from 0 (the card) to 1 (the screen). The sheet wears the card's face, which gives
   * way as it grows; the table recedes in the same breath.
   */
  @api
  travel(v, key) {
    if (this.travelKey !== key) {
      this.showFace(this.travelKey, true);
      this.travelKey = key;
    }
    this.showFace(key, false);
    const root = this.template.querySelector('[data-id="roots"]');
    const sheet = this.template.querySelector('[data-id="sheet"]');
    const body = this.template.querySelector('[data-id="body"]');
    if (!root || !sheet || !body) {
      return;
    }
    const box = root.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, v.p));
    const shade = this.template.querySelector('[data-id="sheet-shade"]');
    const place = {
      width: `${v.w.toFixed(2)}px`,
      height: `${v.h.toFixed(2)}px`,
      transform: `translate(${(v.x - v.w / 2 - box.left).toFixed(2)}px, ${(v.y - v.h / 2 - box.top).toFixed(2)}px) rotate(${v.r.toFixed(3)}deg)`,
      borderRadius: `${(v.radius != null ? v.radius : this.radius()).toFixed(2)}px`
    };
    [sheet, shade].forEach((el) => {
      if (el) {
        el.hidden = false;
        Object.assign(el.style, place);
      }
    });
    const shelf = sheet.querySelector('[data-id="sheet-shelf"]');
    const ghost = sheet.querySelector('[data-id="ghost"]');
    if (shelf) {
      shelf.style.opacity = smooth(0.04, 0.6, p).toFixed(3);
    }
    if (shade) {
      shade.style.opacity = (1 - smooth(0, 0.85, p)).toFixed(3);
    }
    if (ghost) {
      const k = v.w / this.cw;
      Object.assign(ghost.style, {
        width: `${this.cw}px`,
        height: `${this.ch}px`,
        transform: `scale(${k.toFixed(4)})`,
        opacity: (1 - smooth(0.03, 0.4, p)).toFixed(3)
      });
      ghost.style.setProperty(
        "--nfs",
        this.meldCard(key)?.card.b.style.getPropertyValue("--nfs") || "13px"
      );
    }
    const recede = smooth(0, 0.72, p);
    body.style.opacity = recede ? (1 - recede).toFixed(3) : "";
    body.style.transform = recede
      ? `scale(${(1 - 0.015 * recede).toFixed(4)})`
      : "";
  }

  /** The travel is over: the sheet goes, the card wears its own face again, the table returns. */
  @api
  endTravel() {
    this.showFace(this.travelKey, true);
    this.travelKey = null;
    const sheet = this.template.querySelector('[data-id="sheet"]');
    const shade = this.template.querySelector('[data-id="sheet-shade"]');
    const body = this.template.querySelector('[data-id="body"]');
    [sheet, shade].forEach((el) => {
      if (el) {
        el.hidden = true;
      }
    });
    if (body) {
      body.style.opacity = "";
      body.style.transform = "";
    }
  }

  showFace(key, on) {
    const found = key && this.meldCard(key);
    const face = found && found.card.b.querySelector('[data-id="face"]');
    if (face) {
      face.style.opacity = on ? "" : "0";
    }
  }
}

function toggle(element, attribute, on) {
  if (on) {
    element.setAttribute(attribute, "");
  } else {
    element.removeAttribute(attribute);
  }
}
