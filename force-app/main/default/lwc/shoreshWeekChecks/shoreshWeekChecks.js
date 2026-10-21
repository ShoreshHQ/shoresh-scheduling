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
 * Fires showactivity { activityId } when an under or over row is chosen (the page shows that
 * activity), and locate (detail: the line, { key, kind, text, groupId, and for a cell dateValue
 * and blockId }) when a line to look at is (the page takes the director there).
 */
export default class ShoreshWeekChecks extends LightningElement {
  @api measure;
  _resetKey;

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
  /** "29 of 35 placed", then whether anything needs a look (the corner says it to the eye). */
  get counterName() {
    const said = `${this.m.placed} of ${this.m.total} placed`;
    return this.m.offTarget ? `${said}, needs a look` : said;
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
    return this.m.under.rows.map((row) => ({
      ...row,
      said: `${row.name}: ${row.placed} of ${row.goal}`
    }));
  }
  get showOver() {
    return this.m.hasLimits || this.m.over.count > 0;
  }
  get overCount() {
    return this.m.over.count;
  }
  get overRows() {
    return this.m.over.rows.map((row) => ({
      ...row,
      said: `${row.name}: ${row.placed} of ${row.goal}, over`
    }));
  }
  get lookRows() {
    return this.m.look;
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
