import { LightningElement, api } from "lwc";
import readAccepted from "@salesforce/apex/WeekAccepts.accepted";
import keepAccepted from "@salesforce/apex/WeekAccepts.accept";

/**
 * The week's counter on the rail (wiki decisions 38 and 41; ADR 0008 part 7), shared by Manual
 * Build and Generated Schedule: one item, "29 of 35 placed", with the needs-a-look corner when
 * anything is off target. It opens a dropdown in the Edit menu's look: a slim bar of what is
 * placed, how many cells are still needed, the activities under their weekly goal and those over
 * their weekly limit ("placed of goal"), and what else needs a look. It replaces the desktop's
 * counter cards (Filled, Overlapping, Still needed, Spread across the week).
 *
 * It is the week's Why list (wiki engine care plan Q18; desktop FindingsRail "Still to place",
 * a list under the counter): nothing from the engine or the rule checks is on the grid, so every
 * explanation is a row here, in groups: Open (each Open cell and why, when the page knows), under,
 * over, to look at (overlapping cells, early-week goals, rules bent, hand-edit reminders, setup
 * changed, rain plan full), then notes with no cell (a blank setting taken as 1, the imported week).
 * A row naming a cell takes the director there without changing it.
 *
 * measure: c/shoreshEngine measureWeek's answer for the week shown. scheduleId: the week's draft,
 * where accepts are kept (none yet: they last this visit only). resetKey: change it when a week is
 * shown fresh or rebuilt; the dropdown closes and the week's accepts are read again.
 *
 * Accept (wiki decisions 16 and 43; desktop FindingsRail "Accept"): hovering or focusing an
 * under or over row, or a line to look at, shows Accept, which tucks that line away and keeps it
 * with the week (Apex WeekAccepts, Greg 2026-10-30), so it stays away for anyone who opens the week
 * later; it comes back when it gets worse (an under or over row further off, an early-week goal
 * missing more: CORE-6.8) and stays away when it is the same or better. A Generated build clears
 * the week's accepts (the desktop's Rebuild). A line with no size (an Open cell, a note, a rule
 * bent) stays away until the line itself changes. A cell that breaks a
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
  _scheduleId;
  // Lines accepted, as kept with the week: { key, same, size }. A line is the same one when its
  // same matches, and stays away while its size is no bigger than the size accepted (CORE-6.8).
  accepted = [];
  // Which read of the week's accepts is the latest (an older answer is dropped).
  readTicket = 0;
  // Accepts still on their way to the server ({ scheduleId, line }): a read meanwhile keeps them.
  saving = [];
  // What Accept just said, for screen readers.
  acceptSaid = "";
  // An Accept that couldn't be kept with the week, shown at the top of the dropdown (red text,
  // as a field error) until the next Accept or the week is read again.
  acceptProblem = "";
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
      this.readAgain();
    }
    this._resetKey = value;
  }

  @api
  get scheduleId() {
    return this._scheduleId;
  }
  set scheduleId(value) {
    if (value !== this._scheduleId) {
      // The week's first save made its draft: what was accepted before is kept with it now.
      const before = this._scheduleId ? [] : this.accepted;
      this._scheduleId = value;
      this.readAgain(before);
      before.forEach((a) => this.keep(a, a.said));
    }
  }

  /** The week's accepts as kept with it: none shown from another week meanwhile. */
  async readAgain(carried = []) {
    const ticket = ++this.readTicket;
    this.acceptProblem = "";
    const scheduleId = this._scheduleId;
    this.accepted = [
      ...carried,
      ...this.saving
        .filter((s) => s.scheduleId === scheduleId)
        .map((s) => s.line)
    ];
    if (!scheduleId) {
      return;
    }
    let lines;
    try {
      lines = JSON.parse((await readAccepted({ scheduleId })) || "[]");
    } catch {
      // Not read: every line shows, as nothing was accepted (nothing is hidden by mistake).
      return;
    }
    if (ticket !== this.readTicket) {
      return;
    }
    const kept = lines.map((line) => ({
      key: line.k,
      same: line.s === null ? undefined : line.s,
      size: line.n === null ? undefined : line.n
    }));
    // Accepts made while it was read stay.
    this.accepted = [...kept, ...this.accepted];
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
        open: [],
        notes: [],
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
      this.openRows.length > 0 ||
      this.underRows.length > 0 ||
      this.overRows.length > 0 ||
      this.lookRows.length > 0 ||
      this.noteRows.length > 0
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
  /** Priorities met (CORE-6.4): "High priority 9 of 10 minimums met", then Low. Counts only. */
  get priorityRows() {
    return (this.m.priorities || []).map((row) => ({
      ...row,
      key: `priority-${row.priority}`,
      label: row.priority === "high" ? "High priority" : "Low priority"
    }));
  }
  /** Spread across the week (CORE-6.4): sessions on a day of their own, of repeated sessions. */
  get spread() {
    const spread = this.m.spread;
    return spread && spread.sessions > 0 ? spread : null;
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
        same: `under|${row.id}`,
        size: row.goal - row.placed,
        said: `${row.name}: ${row.placed} of ${row.goal}`,
        acceptLabel: `Accept: ${row.name}, ${row.placed} of ${row.goal}`
      }))
      .filter((row) => !this.tucked(row));
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
        same: `over|${row.id}`,
        size: row.placed - row.goal,
        said: `${row.name}: ${row.placed} of ${row.goal}, over`,
        acceptLabel: `Accept: ${row.name}, ${row.placed} of ${row.goal}, over`
      }))
      .filter((row) => !this.tucked(row));
  }
  /** Open cells and why (Generated: the engine's words). An Open cell can be accepted. */
  get openRows() {
    return (this.m.open || [])
      .map((line) => ({ ...line, acceptLabel: `Accept: ${line.text}` }))
      .filter((line) => !this.tucked(line));
  }
  /** Lines with no cell to go to. */
  get noteRows() {
    return (this.m.notes || [])
      .map((line) => ({ ...line, acceptLabel: `Accept: ${line.text}` }))
      .filter((line) => !this.tucked(line));
  }
  get lookRows() {
    return this.m.look
      .map((line) => ({
        ...line,
        // Desktop FindingsRail: an overlap has nothing to accept.
        acceptable: line.kind !== "overlapping",
        acceptLabel: `Accept: ${line.text}`
      }))
      .filter((line) => !this.tucked(line));
  }

  /** Accepted this visit and no worse since: the same line, its size no bigger (CORE-6.8). */
  tucked(line) {
    return this.accepted.some((a) => {
      if (a.same === undefined || a.size === undefined) {
        return a.key === line.key;
      }
      return a.same === line.same && line.size <= a.size;
    });
  }

  /**
   * Accept: the line goes for this visit, it is said, and focus moves to the line now in its
   * place (the next one), else the one before, else the counter. The dropdown stays open.
   */
  handleAccept(event) {
    // The dropdown's own click handling would close it: Accept keeps it open.
    event.stopPropagation();
    const key = event.currentTarget.dataset.key;
    const all = [
      ...this.openRows,
      ...this.underRows,
      ...this.overRows,
      ...this.lookRows,
      ...this.noteRows
    ];
    const index = all.findIndex((line) => line.key === key);
    if (index < 0) {
      return;
    }
    const line = all[index];
    const said = line.text || `${line.name}, ${line.placed} of ${line.goal}`;
    const accepted = { key, same: line.same, size: line.size, said };
    this.accepted = [...this.accepted, accepted];
    this.acceptSaid = `Accepted: ${said}.`;
    this.acceptProblem = "";
    this.focusAfterRender = { index };
    this.dispatchEvent(new CustomEvent("accept", { detail: line }));
    this.keep(accepted, said);
  }

  /** Keeps the accept with the week; if it can't be, says it lasts only until the week is left. */
  async keep(line, said) {
    const scheduleId = this._scheduleId;
    if (!scheduleId) {
      return;
    }
    const entry = { scheduleId, line };
    this.saving = [...this.saving, entry];
    try {
      await keepAccepted({
        scheduleId,
        line: JSON.stringify({
          k: line.key,
          s: line.same === undefined ? null : line.same,
          n: line.size === undefined ? null : line.size
        })
      });
    } catch {
      // Shown in the dropdown, where role="alert" also says it: the live line stays quiet.
      this.acceptSaid = "";
      this.acceptProblem = `Couldn't keep this Accept with the week: ${said}.`;
    } finally {
      this.saving = this.saving.filter((e) => e !== entry);
    }
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
    const line = [...this.m.look, ...(this.m.open || [])].find(
      (l) => l.key === event.currentTarget.dataset.key
    );
    if (line) {
      this.dispatchEvent(new CustomEvent("locate", { detail: line }));
    }
  }
}
