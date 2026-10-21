import { LightningElement, api } from "lwc";

/**
 * The week's counter on the rail (wiki decisions 38 and 41; ADR 0008 part 7), shared by Manual
 * Build and Generated Schedule: one item, "29 of 35 placed", with the needs-a-look corner when
 * anything is off target. It opens a dropdown in the Edit menu's look: a slim bar of what is
 * placed, how many cells are still needed, the activities under their weekly goal and those over
 * their weekly limit ("placed of goal"), and what else needs a look. It replaces the desktop's
 * counter cards (Filled, Overlapping, Still needed, Spread across the week).
 *
 * measure: c/shoreshEngine measureWeek's answer for the week shown. resetKey: change it when a
 * different week is shown fresh; the dropdown closes.
 *
 * Accept (wiki decisions 16 and 43; desktop FindingsRail "Accept"): hovering or focusing an
 * under or over row, or a line to look at, shows Accept, which tucks that line away for this
 * visit; it comes back when its numbers change or a week is shown fresh. A cell that breaks a
 * rule shared with other cells has nothing to accept (the desktop's OVERLAP), as on the desktop:
 * it goes when the clash is moved. Accept reaches the keyboard as the row after its line (Down),
 * says what it hid, and moves focus to the next line. The numbers stay the week's (the drawer
 * shows the same); the corner goes once every line is accepted, because each was looked at.
 *
 * Fires showactivity { activityId } when an under or over row is chosen (the page shows that
 * activity), locate (detail: the line, { key, kind, text, groupId, and for a cell dateValue
 * and blockId }) when a line to look at is (the page takes the director there), and accept
 * (detail: the row or line) when one is accepted.
 */
export default class ShoreshWeekChecks extends LightningElement {
  @api measure;
  _resetKey;
  // Lines accepted this visit (their keys carry their numbers, so a changed line comes back).
  accepted = [];
  // What Accept just said, for screen readers.
  acceptSaid = "";
  // After Accept: focus goes to the line now at this place in the list ({ index }).
  focusAfterRender = null;

  @api
  get resetKey() {
    return this._resetKey;
  }
  set resetKey(value) {
    if (value !== this._resetKey && this._resetKey !== undefined) {
      const pop = this.template.querySelector('[data-id="counter"]');
      if (pop) {
        pop.close();
      }
      this.accepted = [];
    }
    this._resetKey = value;
  }

  get m() {
    return (
      this.measure || {
        placed: 0,
        total: 0,
        stillNeeded: 0,
        hasGoals: false,
        hasLimits: false,
        under: { count: 0, rows: [] },
        over: { count: 0, rows: [] },
        look: [],
        offTarget: false
      }
    );
  }

  get placed() {
    return this.m.placed;
  }
  get placedWords() {
    return `of ${this.m.total} placed`;
  }
  get offTarget() {
    return this.m.offTarget;
  }
  /** The corner: something off target that hasn't been accepted this visit. */
  get showMark() {
    return (
      this.underRows.length > 0 ||
      this.overRows.length > 0 ||
      this.lookRows.length > 0
    );
  }
  /** "29 of 35 placed", then whether anything needs a look (the corner says it to the eye). */
  get counterName() {
    const said = `${this.m.placed} of ${this.m.total} placed`;
    return this.showMark ? `${said}, needs a look` : said;
  }
  get barStyle() {
    const share = this.m.total ? (100 * this.m.placed) / this.m.total : 0;
    return `width: ${share}%;`;
  }
  get stillNeeded() {
    return this.m.stillNeeded;
  }

  /** Under, with a 0 when the camp has goals and none is short (the desktop's grey 0). */
  get showUnder() {
    return this.m.hasGoals || this.m.under.count > 0;
  }
  get underCount() {
    return this.m.under.count;
  }
  get underRows() {
    return this.m.under.rows
      .map((row) => ({
        ...row,
        key: `under|${row.id}|${row.placed}|${row.goal}`,
        said: `${row.name}: ${row.placed} of ${row.goal}`,
        acceptLabel: `Accept: ${row.name}, ${row.placed} of ${row.goal}`
      }))
      .filter((row) => !this.accepted.includes(row.key));
  }
  get showOver() {
    return this.m.hasLimits || this.m.over.count > 0;
  }
  get overCount() {
    return this.m.over.count;
  }
  get overRows() {
    return this.m.over.rows
      .map((row) => ({
        ...row,
        key: `over|${row.id}|${row.placed}|${row.goal}`,
        said: `${row.name}: ${row.placed} of ${row.goal}, over`,
        acceptLabel: `Accept: ${row.name}, ${row.placed} of ${row.goal}, over`
      }))
      .filter((row) => !this.accepted.includes(row.key));
  }
  get lookRows() {
    return this.m.look
      .map((line) => ({
        ...line,
        // Desktop FindingsRail: an overlap has nothing to accept.
        acceptable: line.kind !== "overlapping",
        acceptLabel: `Accept: ${line.text}`
      }))
      .filter((line) => !this.accepted.includes(line.key));
  }

  /**
   * Accept: the line goes for this visit, it is said, and focus moves to the line now in its
   * place (the next one), else the one before, else the counter. The dropdown stays open.
   */
  handleAccept(event) {
    // The dropdown's own click handling would close it: Accept keeps it open.
    event.stopPropagation();
    const key = event.currentTarget.dataset.key;
    const all = [...this.underRows, ...this.overRows, ...this.lookRows];
    const index = all.findIndex((line) => line.key === key);
    if (index < 0) {
      return;
    }
    const line = all[index];
    this.accepted = [...this.accepted, key];
    this.acceptSaid = `Accepted for this visit: ${line.text || `${line.name}, ${line.placed} of ${line.goal}`}.`;
    this.focusAfterRender = { index };
    this.dispatchEvent(new CustomEvent("accept", { detail: line }));
  }

  renderedCallback() {
    const focus = this.focusAfterRender;
    if (!focus) {
      return;
    }
    this.focusAfterRender = null;
    const lines = [...this.template.querySelectorAll("[data-line]")];
    const target = lines[Math.min(focus.index, lines.length - 1)];
    if (target) {
      target.focus();
      return;
    }
    const pop = this.template.querySelector('[data-id="counter"]');
    if (pop) {
      pop.focus();
    }
  }

  handleActivity(event) {
    this.dispatchEvent(
      new CustomEvent("showactivity", {
        detail: { activityId: event.currentTarget.dataset.activity }
      })
    );
  }

  handleLocate(event) {
    const line = this.m.look.find(
      (l) => l.key === event.currentTarget.dataset.key
    );
    if (line) {
      this.dispatchEvent(new CustomEvent("locate", { detail: line }));
    }
  }
}
