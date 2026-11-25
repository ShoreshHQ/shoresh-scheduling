/**
 * The week editor's saving (ADR 0008 §21): every edit, Undo and Redo is made on screen at once
 * (optimistic) and queued; the queue sends one at a time through the host's saveRuns, so each
 * names what the one before it left. A run names the locks the director saw (locksBefore) and,
 * for an Undo or Redo, the locks to leave (locksAfter: lockTargetOf). When the server's week
 * changed under an edit, the question "keep theirs or use yours" is asked from one plan
 * (conflicts.js); an edit with nothing of anyone's to replace is sent again (at most MAX_RESENDS
 * times), and one over a cell locked since is dropped and said.
 *
 * SaveQueue(Base) adds this to the editor. Its state stays on the editor, where the screen
 * watches it: queue and saving (setters that tell the host), server (the week as last saved),
 * lockBase, stepLocks, lockChosenAt, stepRain, history and conflict. What it asks of the editor:
 * saveRuns, schedule/draft, the words (say, sayOnce, announce, reportError, slotName,
 * dayGroupName, nameOf, itemFor, whyRowsNow/whyNews), replanTool for a day or week tool,
 * refuseLocked, focusAfterQuestion, undoAdded and refuseWhileRestoring.
 */
import { failed, refusal } from "c/shoreshErrors";
import { applyRun, isSetTime, slotKey } from "./slotEdits";
import { intentOf, plan, withSeen } from "./conflicts";
import {
  alreadySkipped,
  foldRun,
  locksAfterSave,
  newlyLocked,
  noteRows,
  unlockedSince,
  withLocks
} from "./locks";

// How often an edit is sent again, with nothing new to ask, before it is given up.
export const MAX_RESENDS = 2;

/** The locks with the edits still waiting made on top, or null when no locks were passed. */
export function locksWithWaiting(lockBase, queue) {
  if (!lockBase) {
    return null;
  }
  return queue.reduce(
    (state, waiting) =>
      waiting.edit.runs.reduce(
        (now, run) => foldRun(now, run, waiting.locksTarget),
        state
      ),
    lockBase
  );
}

/**
 * The locks an Undo or Redo of a step leaves (Greg, 2026-10-18: Undo keeps a Lock the director
 * chose). A cell's lock changes only if the step itself changed it and no Lock-menu choice
 * covered the cell since the step: then it is the step's, from before it (Undo) or after it
 * (Redo). Every other cell keeps the lock it has now (`seen`), whoever set it. record: the
 * step's { before, after } locks; chosenAt: each cell's newest step when a Lock choice covered
 * it. Null for an edit, or a step with no locks kept with it.
 */
export function lockTargetOf(record, stepId, kind, seen, chosenAt) {
  if (!record || kind === "edit") {
    return null;
  }
  const target = new Set(seen);
  const stepLeft = kind === "undo" ? record.before : record.after;
  const chosenSince = (key) => chosenAt.get(key) >= stepId;
  [...record.before, ...record.after]
    .filter((key) => record.before.has(key) !== record.after.has(key))
    .filter((key) => !chosenSince(key))
    .forEach((key) => {
      if (stepLeft.has(key)) {
        target.add(key);
      } else {
        target.delete(key);
      }
    });
  return target;
}

export const SaveQueue = (Base) =>
  class extends Base {
    /** The locks with the edits still waiting made on top, or null when no locks were passed. */
    get liveLocks() {
      return locksWithWaiting(this.lockBase, this.queue);
    }

    /**
     * A new change ({ day, group, first, before, after } runs): saved, and one Undo step. False
     * when it was refused (edits wait while the host restores or publishes): nothing was made.
     */
    commit(runs, label, key, rain = null, added = null) {
      if (this.refuseWhileRestoring()) {
        return false;
      }
      const serverRuns = this.toServerRuns(runs);
      this.stepSeq += 1;
      const step = { id: this.stepSeq, runs: serverRuns, label, added };
      this.history.record(step);
      this.historyVersion += 1;
      this.recordLocks(step.id, serverRuns);
      if (rain) {
        // A rainy day's marks go with its step: its Undo puts back the ones from before.
        this.stepRain.set(step.id, rain);
      }
      this.send(serverRuns, label, key, step.id, runs[0]);
      return true;
    }

    /**
     * The locks before and after a step, kept with it (when locks were passed): what an Undo or a
     * Redo of it leaves (lockTarget).
     */
    recordLocks(stepId, serverRuns) {
      const before = this.liveLocks;
      if (!before) {
        return;
      }
      this.stepLocks.set(stepId, {
        before,
        after: serverRuns.reduce((now, run) => foldRun(now, run), before)
      });
      const kept = new Set(
        [...this.history.undos, ...this.history.redos].map((step) => step.id)
      );
      [...this.stepLocks.keys()]
        .filter((id) => !kept.has(id))
        .forEach((id) => this.stepLocks.delete(id));
    }

    /** A step made differently (Use yours, a tool worked out again): its locks after follow. */
    refreshLocks(stepId, serverRuns) {
      const record = this.stepLocks.get(stepId);
      if (record) {
        this.stepLocks.set(stepId, {
          before: record.before,
          after: serverRuns.reduce(
            (now, run) => foldRun(now, run),
            record.before
          )
        });
      }
    }

    /** The locks an Undo or Redo of a step leaves (lockTargetOf); null for an edit. */
    lockTarget(stepId, kind, seen) {
      return lockTargetOf(
        this.stepLocks.get(stepId),
        stepId,
        kind,
        seen,
        this.lockChosenAt
      );
    }

    /**
     * The "Rain plan full" marks an edit, Undo or Redo of a rainy day leaves on its day (the marks
     * after it, or for its Undo the ones before), as the server takes them; null for any other step.
     */
    rainFor(stepId, kind) {
      const record = this.stepRain.get(stepId);
      if (!record) {
        return null;
      }
      return [
        {
          day: record.date,
          cells: kind === "undo" ? record.before : record.after
        }
      ];
    }

    /** Where an edit starts, for the "saving" shade: from its own run, or found from the server's. */
    slotKeyOf(firstRun, serverRun) {
      if (!firstRun && !serverRun) {
        // A rainy day with only "Rain plan full" marks changes no cell.
        return null;
      }
      if (firstRun) {
        return slotKey({
          day: firstRun.day,
          group: firstRun.group,
          block: firstRun.first
        });
      }
      const weekDays = this.schedule ? this.schedule.days : [];
      const dayIndex = weekDays.findIndex((d) => d.dateValue === serverRun.day);
      const day = weekDays[dayIndex];
      if (!day) {
        return null;
      }
      return slotKey({
        day: dayIndex,
        group: day.groups.findIndex((grp) => grp.id === serverRun.groupId),
        block: day.blocks.findIndex((b) => b.id === serverRun.firstBlockId)
      });
    }

    /** Shows runs on the grid at once and queues them for the server. */
    send(serverRuns, label, key, stepId, firstRun, kind = "edit", baseLabel) {
      // What the director chose and saw, by time block (conflicts.js): what a question compares.
      const intent = intentOf(
        this.schedule.days,
        serverRuns,
        (at) => this.slotName({ day: at.dayIndex, group: at.g }, at.block),
        (at) => this.dayGroupName({ day: at.dayIndex, group: at.g })
      );
      if (intent.missing) {
        // An Undo or Redo of a change whose day, bunk, or time block has since gone: it can't be
        // made, so it is said, and the step leaves Undo and Redo.
        this.history.forget(stepId);
        this.historyVersion += 1;
        this.say(
          `Can't ${kind === "redo" ? "redo" : "undo"} ${baseLabel || label}: the ${this.t.sIn("Week")} has changed.`
        );
        return;
      }
      this.notice = null;
      this.toolNotice = null;
      this.unrepeated = null;
      // A reload already on its way is older than this edit: its answer must not replace it. The
      // week is no longer the version just restored, and a refused Restore is behind it.
      this.edited();
      const rain = this.rainFor(stepId, kind);
      const edit = rain ? { runs: serverRuns, rain } : { runs: serverRuns };
      // The Why list's rows before the edit, to say what it changed there.
      const before = this.whyRowsNow();
      const entry = {
        edit,
        key,
        label,
        stepId,
        kind,
        baseLabel: baseLabel || label,
        // The activity its step added (LOCK-5.5), kept with the save: an Undo's save takes it off
        // even when the step has left Undo and Redo meanwhile (theirs used, a new change made).
        added: (this.history.find(stepId) || {}).added || null,
        // The locks the director saw when they made this (the screen's, with the edits waiting
        // before it made): what the run names as locksBefore whenever it is sent, so a lock that
        // arrives while it waits is never covered unseen.
        seen: this.liveLocks,
        // What the director chose and saw, by time block (conflicts.js): what a question compares.
        intent,
        slotKey: this.slotKeyOf(firstRun, serverRuns[0])
      };
      const locksTarget = this.lockTarget(stepId, kind, entry.seen);
      if (locksTarget) {
        entry.locksTarget = locksTarget;
      }
      this.queue = [...this.queue, entry];
      this.applyLocally(edit);
      // A Why list row the edit brought or took away, said with its save (a sighted director
      // sees the list change).
      entry.news = this.whyNews(before, this.whyRowsNow(), this.checked);
      this.pulseKeys = [];
      this.saveNext();
    }

    /** The draft with an edit made, as the grid shows it until the server answers. */
    applyLocally(edit) {
      const schedule = this.schedule;
      const rainMarks = new Map((edit.rain || []).map((r) => [r.day, r.cells]));
      const daysNow = schedule.days.map((day) => {
        let result = rainMarks.has(day.dateValue)
          ? { ...day, rain: rainMarks.get(day.dateValue) }
          : day;
        edit.runs
          .filter((run) => run.day === day.dateValue)
          .forEach((run) => {
            const g = result.groups.findIndex((grp) => grp.id === run.groupId);
            const first = result.blocks.findIndex(
              (block) => block.id === run.firstBlockId
            );
            if (g >= 0 && first >= 0) {
              result = applyRun(
                result,
                g,
                { first, after: run.after },
                (item) => this.itemFor(item)
              );
            }
          });
        return result;
      });
      this.draft = { ...this.draft, schedule: { ...schedule, days: daysNow } };
    }

    /**
     * Whether saved runs (as the server takes them) touched a fixed or recurring activity or a cell
     * where the group isn't at camp: such a hand edit can differ from setup, so the host reads
     * "Update to match setup" again for its reminder in the Why list.
     */
    remindsOf(runs) {
      const away = new Set();
      ((this.draft && this.draft.away) || []).forEach((row) =>
        row.blockIds.forEach((blockId) => away.add(`${row.groupId}|${blockId}`))
      );
      return (runs || []).some(
        (run) =>
          [...(run.before || []), ...(run.after || [])].some(isSetTime) ||
          (run.blockIds || []).some((blockId) =>
            away.has(`${run.groupId}|${blockId}`)
          )
      );
    }

    /** Sends queued edits one at a time, so each names what the one before it left. */
    async saveNext() {
      // While "keep theirs or use yours" is open, the rest wait for the answer.
      if (this.saving || this.conflict || !this.queue.length) {
        return;
      }
      this.saving = true;
      const [entry] = this.queue;
      try {
        const sent = withLocks(entry);
        const result = await this.saveRuns([sent]);
        if (result.status === "refused") {
          // The host's reason, as it would read from a server refusal.
          throw refusal(result.message);
        }
        this.queue = this.queue.slice(1);
        this.server = result.schedule;
        this.lockBase = locksAfterSave(this.lockBase, entry, result);
        this.showServerAndWaiting();
        // The host shows the week the server sent (never a patched copy).
        this.dispatchEvent(
          new CustomEvent("saved", {
            detail: {
              schedule: result.schedule,
              conflicts: result.conflicts,
              label: entry.label,
              kind: entry.kind,
              remind: this.remindsOf(entry.edit.runs)
            }
          })
        );
        if (result.conflicts.length) {
          // A cell this edit touches that someone locked meanwhile is never sent again over their
          // lock: it is said, and the edit is dropped.
          const locked = newlyLocked(this.lockBase, sent.runs);
          if (locked && entry.tool && !alreadySkipped(entry, locked)) {
            // A tool does what it can: the locked cells are left out and the rest is made.
            this.replanTool(entry);
          } else if (locked) {
            this.refuseNewlyLocked(entry, locked);
          } else {
            this.askAboutConflict(entry);
          }
        } else {
          this.reportError(null);
          // A note that came with this change (Redo wasn't made.) is added to the line. Anything
          // already there (an earlier change that couldn't be made) stays until the director's
          // next change, and is said again with the first save after it, which would otherwise
          // talk over it.
          const fresh =
            entry.note && !(this.notice || "").includes(entry.note)
              ? entry.note
              : null;
          if (fresh) {
            this.notice = this.notice ? `${this.notice} ${fresh}` : fresh;
          }
          const said = [this.unrepeated, fresh].filter(Boolean).join(" ");
          this.unrepeated = null;
          this.announce(
            [entry.label, entry.extra, entry.news, said]
              .filter(Boolean)
              .join(". ")
          );
          if (entry.kind === "undo") {
            this.undoAdded(entry);
          }
        }
      } catch (e) {
        const dropped = this.queue.length - 1;
        this.reportError(
          failed(`Your change wasn't saved: ${entry.label}.`, e) +
            (dropped > 0
              ? ` ${dropped} more ${dropped === 1 ? "change" : "changes"} after it ${dropped === 1 ? "wasn't" : "weren't"} saved either.`
              : "")
        );
        this.queue = [];
        // What is saved is no longer known here: undoing could only guess.
        this.startHistoryOver();
        // The host reads the week again.
        this.dispatchEvent(new CustomEvent("reload"));
      } finally {
        this.saving = false;
      }
      this.saveNext();
    }

    /** Someone locked a cell this edit touches: the edit is dropped and the lock is named. */
    refuseNewlyLocked(entry, { run, block }) {
      this.abandon(entry);
      const at = this.locate(run);
      const index = at
        ? at.day.blocks.findIndex((b) => b.id === run.blockIds[block])
        : -1;
      if (index < 0) {
        this.askAboutConflict(entry);
        return;
      }
      this.refuseLocked({ day: at.dayIndex, group: at.g, block: index });
    }

    /** The draft on screen: the server's week with the edits still waiting made on top. */
    showServerAndWaiting() {
      this.draft = { ...this.draft, schedule: this.server };
      this.queue.forEach((waiting) => this.applyLocally(waiting.edit));
    }

    /** Where a run is in the server's week: { dayIndex, day, g, first }, or null. */
    locate(run) {
      const dayIndex = this.server.days.findIndex(
        (d) => d.dateValue === run.day
      );
      const day = this.server.days[dayIndex];
      const g = day
        ? day.groups.findIndex((grp) => grp.id === run.groupId)
        : -1;
      const first = day
        ? day.blocks.findIndex((block) => block.id === run.firstBlockId)
        : -1;
      return g < 0 || first < 0 ? null : { dayIndex, day, g, first };
    }

    askAboutConflict(entry) {
      const made = plan(this.server.days, entry.intent);
      if (entry.tool && (made.gone || made.changed || made.fixed)) {
        // A day or week tool isn't dropped for one cell: it is worked out again around it.
        this.replanTool(entry);
        return;
      }
      if (made.gone || made.changed || made.fixed) {
        // Nothing of this edit was saved: it leaves Undo, and a waiting Undo or Redo of it goes.
        this.abandon(entry);
        let why;
        if (made.gone) {
          why = `${made.gone.name || this.weekName} isn't in the ${this.t.sIn("Week")} any more`;
        } else if (made.changed) {
          why = `${made.changed.rowName} has changed`;
        } else {
          const day = this.server.days.find(
            (d) => d.dateValue === made.fixed.day
          );
          why = `${this.nameOf(made.slot, day)} stays where it is set up`;
        }
        // An Undo or Redo has left both lists: nothing to try again.
        this.say(
          entry.kind === "edit"
            ? `${why}.${made.changed ? " Try again." : ""}`
            : `Can't ${entry.kind === "redo" ? "redo" : "undo"} ${entry.baseLabel}: ${why}.`
        );
        return;
      }
      if (!made.runs.length) {
        this.sayOnce(
          entry.note ? `Already done. ${entry.note}` : "Already done."
        );
        return;
      }
      if (!made.rows.length) {
        const unlocked = unlockedSince(this.lockBase, entry);
        if (unlocked.size) {
          // Someone only took a lock off a cell this edit touches: nothing of theirs is covered,
          // so it is sent again, as it was, naming those cells unlocked as they are now. Each time
          // takes at least one lock out of what it names, so this ends.
          const seen = new Set(
            [...entry.seen].filter((key) => !unlocked.has(key))
          );
          // An Undo or Redo works out the locks it leaves again, by the same rule.
          const locksTarget =
            this.lockTarget(entry.stepId, entry.kind, seen) ||
            entry.locksTarget;
          this.queue = [{ ...entry, seen, locksTarget }, ...this.queue];
          this.showServerAndWaiting();
          this.saveNext();
          return;
        }
        if ((entry.resent || 0) >= MAX_RESENDS) {
          // Sent again and refused again with nothing new to ask: not a loop without end.
          this.abandon(entry);
          this.say(
            `Your change wasn't saved: ${entry.label}. The ${this.t.sIn("Week")} kept changing while it was saved. Try again.`
          );
          return;
        }
        // Nothing of anyone else's would be replaced: no question, it is just made.
        this.useYours(entry, made);
        return;
      }
      const rows = made.rows.map((row) => {
        const day = this.server.days[row.dayIndex];
        return {
          key: `${row.dayIndex}|${row.g}|${row.block}`,
          where: this.slotName({ day: row.dayIndex, group: row.g }, row.block),
          theirs: this.nameOf(row.theirs, day),
          yours: this.nameOf(row.yours, day)
        };
      });
      // What the question shows and what Use yours sends are one plan (conflicts.js).
      this.conflict = { entry, rows, made };
      this.announce(
        rows.length === 1
          ? `${rows[0].where} changed since you opened it.`
          : `${rows.length} cells changed since you opened it.`
      );
    }

    /** An edit that didn't save: out of Undo and Redo, with any waiting Undo or Redo of it. */
    abandon(entry) {
      this.history.forget(entry.stepId);
      this.historyVersion += 1;
      this.queue = this.queue.filter((w) => w.stepId !== entry.stepId);
      this.showServerAndWaiting();
    }

    handleKeepTheirs() {
      if (this.conflict.entry.tool) {
        // Their cells stay; the rest of the tool is made (coordinator, 2026-10-17).
        const entry = this.conflict.entry;
        this.notice = null;
        this.unrepeated = null;
        this.replanTool(entry);
        return;
      }
      const { key, stepId } = this.conflict.entry;
      this.notice = null;
      this.unrepeated = null;
      const firstRun = this.conflict.made.runs[0];
      this.conflict = null;
      // Their change stands, so this step never happened: nothing to undo or redo, and an Undo or
      // Redo of it still waiting is dropped too.
      this.history.forget(stepId);
      this.historyVersion += 1;
      this.queue = this.queue.filter((waiting) => waiting.stepId !== stepId);
      this.showServerAndWaiting();
      this.focusAfterQuestion({ key }, firstRun);
      this.saveNext();
    }

    /** Use yours: exactly the plan the question showed (conflicts.js), nothing else. */
    handleUseYours() {
      const { entry, made } = this.conflict;
      this.notice = null;
      this.unrepeated = null;
      this.conflict = null;
      this.useYours(entry, made);
    }

    /**
     * Sends a plan for an edit, first, before the edits that waited. Its intent now counts what the
     * question showed as seen, for a second question.
     */
    useYours(entry, made) {
      const runs = made.runs;
      noteRows(this.server.days, runs);
      // A waiting Undo or Redo of this step was worked out from what the director saw, not from
      // what is saved now: it is dropped, and a dropped Redo is said.
      const dropped = this.queue.filter((w) => w.stepId === entry.stepId);
      this.queue = this.queue.filter((w) => w.stepId !== entry.stepId);
      if (entry.kind === "undo") {
        // An Undo made over theirs is done: nothing to redo.
        this.history.forget(entry.stepId);
      } else {
        // A change (or a Redo of one) is, from now, what was really saved: Undo takes back this.
        // It keeps its place in Undo; if it had none left (a later change cleared Redo after it
        // was undone), it goes on top, so it can always be taken back.
        const step = {
          id: entry.stepId,
          runs,
          label: entry.baseLabel,
          added: entry.added
        };
        if (dropped.some((w) => w.kind === "undo")) {
          this.history.unundo(entry.stepId);
        }
        if (!this.history.replace(entry.stepId, step)) {
          this.history.ensure(step);
        }
        this.refreshLocks(entry.stepId, runs);
      }
      this.historyVersion += 1;
      // A note from an earlier question (a second question about the same edit) is kept.
      // A Redo or Undo is sent with the locks of its step's record, which was just made again.
      const locksTarget =
        this.lockTarget(entry.stepId, entry.kind, entry.seen) ||
        entry.locksTarget;
      const note = dropped.some((w) => w.kind === "redo")
        ? "Redo wasn't made."
        : entry.note || null;
      this.queue = [
        {
          ...entry,
          locksTarget,
          note,
          // Sent again after each answer that was still a conflict (askAboutConflict stops it).
          resent: (entry.resent || 0) + 1,
          intent: withSeen(entry.intent, made.rows),
          // A rainy day's marks go with it, as they were.
          edit: { ...entry.edit, runs }
        },
        ...this.queue
      ];
      this.showServerAndWaiting();
      this.focusAfterQuestion(entry, runs[0]);
      this.saveNext();
    }
  };
