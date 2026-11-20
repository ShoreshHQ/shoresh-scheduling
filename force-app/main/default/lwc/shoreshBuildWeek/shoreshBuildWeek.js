/**
 * The week on a build screen (Generated Schedule, Manual Build): what acts on "the week as this
 * screen last read it", written once for both. Now: what setup changed since the week was made,
 * and "Update to match setup" (ADR 0008 part 6, SetupMatch).
 *
 * Each screen passes an adapter (its weekAdapter.js):
 * - screen: the component. Read: weekName, t, error, weekEditor, setupPreview, setupAsk,
 *   setupWorking. Set: setupPreview, setupAsk, setupWorking, focusOn. Called: say(text),
 *   loadVersions(), tellSchedulesChanged().
 * - scheduleId(): the week's schedule, or null when it has none yet.
 * - weekKey(): which week is shown, so an answer for a week no longer shown is dropped.
 * - busy(): Update to match setup waits ("One moment").
 * - sayDone(text): said after an action that changed the week.
 * - showError(error): the screen's error line (null clears it).
 * - beginUpdate(): a read on its way must not replace the updated week; returns a ticket, and
 *   isCurrent(ticket) says whether the week is still the one updated.
 * - showUpdated(result, ticket): shows the week as the update left it; false when it can't now.
 * - readAfterWork(): the week is read again once this is over; readIfAsked(): now, if asked.
 */
import getSetupChanges from "@salesforce/apex/SetupMatchController.getSetupChanges";
import updateToMatchSetupOnServer from "@salesforce/apex/SetupMatchController.updateToMatchSetup";
import { failed } from "c/shoreshErrors";

/** Why "Update to match setup" was refused, with nothing changed (SetupMatch.cls). */
export const CHANGED_SINCE = "changedSince";
export const SETUP_CHANGED = "setupChanged";

/** SetupMatch.Preview with every list there. */
function previewOf(preview) {
  return {
    changes: (preview && preview.changes) || [],
    dots: (preview && preview.dots) || [],
    revisions: (preview && preview.revisions) || "",
    closedActivityIds: (preview && preview.closedActivityIds) || [],
    awayGroupIds: (preview && preview.awayGroupIds) || [],
    problem: (preview && preview.problem) || null
  };
}

export class BuildWeek {
  constructor(adapter) {
    this.adapter = adapter;
    this.setupTicket = 0;
    // The newest read of the setup changes (a promise), or null.
    this.setupRead = null;
    // The "couldn't check against setup" message while it is shown, so a later read that works
    // clears it and nothing else.
    this.setupError = null;
    // Counts each time the list's words are to be read out, even the same words again.
    this.setupSaid = 0;
  }

  /**
   * Reads what setup changed since the week was made (its own request, so opening the week costs
   * no more). An answer older than the latest ask, or for a week no longer shown, is dropped.
   * Returns the preview, or null.
   */
  loadSetupChanges() {
    const read = this.readSetupChanges();
    // The newest read, for one that finds it was overtaken (openSetupMatch).
    this.setupRead = read;
    return read;
  }

  async readSetupChanges() {
    const { screen } = this.adapter;
    this.setupTicket += 1;
    const ticket = this.setupTicket;
    const scheduleId = this.adapter.scheduleId();
    if (!scheduleId) {
      screen.setupPreview = null;
      return null;
    }
    try {
      const preview = previewOf(await getSetupChanges({ scheduleId }));
      if (ticket !== this.setupTicket) {
        return null;
      }
      screen.setupPreview = preview;
      // Checked now: a "couldn't check" from an earlier read goes (any other error stays).
      if (screen.error && screen.error === this.setupError) {
        this.adapter.showError(null);
      }
      this.setupError = null;
      return preview;
    } catch (e) {
      // Said, never hidden: the dots and the box stay as last read rather than vanishing, which
      // would make the week look as if it matched setup.
      if (ticket === this.setupTicket) {
        this.setupError = failed(
          `Shoresh couldn't check ${screen.weekName} against setup.`,
          e
        );
        this.adapter.showError(this.setupError);
      }
      return null;
    }
  }

  /** Another week is shown: the last one's setup changes go, and a read still on its way is dropped. */
  forgetSetup() {
    const { screen } = this.adapter;
    screen.setupPreview = null;
    screen.setupAsk = null;
    this.setupError = null;
    this.setupTicket += 1;
  }

  /**
   * "Update to match setup": what it would change is read fresh and shown first; nothing changes
   * until the director chooses a change, or all of them.
   */
  async openSetupMatch() {
    const { screen } = this.adapter;
    if (this.adapter.busy()) {
      screen.say("One moment: an edit is still saving.");
      return;
    }
    const week = this.adapter.weekKey();
    screen.setupWorking = true;
    try {
      const preview = await this.newestSetupChanges(
        this.loadSetupChanges(),
        week
      );
      if (week !== this.adapter.weekKey() || !preview) {
        return;
      }
      if (preview.problem) {
        // Can't be compared now: said, never "matches" (the box says the same).
        screen.say(preview.problem);
      } else if (preview.changes.length) {
        // A new opening of the list: its first update that takes a placement keeps a version.
        screen.setupAsk = { notice: null, kept: false, updated: false };
      } else {
        screen.say(`${screen.weekName} matches setup.`);
      }
    } finally {
      screen.setupWorking = false;
      // For the week still shown only: focus is not moved for a week no longer there.
      if (week === this.adapter.weekKey()) {
        this.afterSetup();
      }
    }
  }

  /**
   * A read's answer, or, when a newer read overtook it (the week read again on coming back to the
   * window), that read's: the one shown. So a click waits for it rather than doing nothing.
   */
  async newestSetupChanges(read, week) {
    const preview = await read;
    if (
      !preview &&
      week === this.adapter.weekKey() &&
      this.setupRead !== read
    ) {
      return this.newestSetupChanges(this.setupRead, week);
    }
    return preview;
  }

  closeSetupMatch() {
    this.adapter.screen.setupAsk = null;
    this.afterSetup();
  }

  /** The list is closed: focus back to the menu's Update, and a read asked for meanwhile is done. */
  afterSetup() {
    const { screen } = this.adapter;
    if (!screen.setupAsk) {
      screen.focusOn = "update-to-match";
      this.adapter.readIfAsked();
    }
  }

  /** The list, open again with words to read out (read out even when the same as last time). */
  setupAskWith(notice, announcement, kept, updated = false) {
    this.setupSaid += 1;
    return { notice, announcement, kept, updated, said: this.setupSaid };
  }

  /**
   * Makes the chosen changes (keys), on the week as the list showed it, then shows the week as it
   * is now. Refused, with nothing changed, when someone saved the week since (it is read again)
   * or setup changed again (the list shows what it would change now). After one change the list
   * stays open with what is left.
   */
  async updateToMatchSetup(keys) {
    const { adapter } = this;
    const { screen } = adapter;
    const preview = screen.setupPreview;
    if (!preview || !keys.length || screen.setupWorking || !screen.setupAsk) {
      return;
    }
    let kept = screen.setupAsk.kept;
    // A read already on its way read the week before this update: its answer must not replace
    // the updated week. A change of week while it runs drops this answer.
    const ticket = adapter.beginUpdate();
    screen.setupWorking = true;
    adapter.showError(null);
    try {
      const result = await updateToMatchSetupOnServer({
        scheduleId: adapter.scheduleId(),
        ask: { keys, seenRevisions: preview.revisions, versionKept: !!kept }
      });
      if (!adapter.isCurrent(ticket)) {
        return;
      }
      const { refused } = result;
      if (refused === CHANGED_SINCE) {
        screen.setupAsk = null;
        screen.weekEditor.setNotice(
          `Someone else changed this ${screen.t.sIn("Week")} since, so nothing was updated.`
        );
        adapter.readAfterWork();
        return;
      }
      if (refused === SETUP_CHANGED) {
        const fresh = await this.loadSetupChanges();
        const again =
          "Something changed while you looked, so nothing was updated.";
        // The list shows what it would change now, in place.
        screen.setupAsk =
          fresh && fresh.changes.length
            ? this.setupAskWith(again, null, kept, screen.setupAsk.updated)
            : null;
        if (fresh && !screen.setupAsk) {
          // Nothing left to change (or it can't be compared now): the list closes, and says why.
          screen.say(
            `${again} ${fresh.problem || `${screen.weekName} matches setup now.`}`
          );
        }
        return;
      }
      kept = kept || !!result.kept;
      if (result.kept) {
        // Versions lists the week as it was, kept just now, here and elsewhere (WEEK-6.7).
        screen.loadVersions();
        screen.tellSchedulesChanged();
      }
      const done =
        keys.length === 1
          ? "Updated to match setup."
          : `Made ${keys.length} changes to match setup.`;
      if (!(await adapter.showUpdated(result, ticket))) {
        // Updated, but the week can't be shown just now: said, and read again once this is over.
        screen.setupAsk = null;
        adapter.sayDone(done);
        return;
      }
      const fresh = await this.loadSetupChanges();
      const all = keys.length === preview.changes.length;
      // While the list stays open it says so itself: a screen reader in the dialog hears only
      // the dialog.
      screen.setupAsk =
        !all && fresh && fresh.changes.length
          ? this.setupAskWith(null, done, kept, true)
          : null;
      if (!screen.setupAsk) {
        adapter.sayDone(done);
      }
    } catch (e) {
      screen.setupAsk = null;
      adapter.showError(failed(`${screen.weekName} was not updated.`, e));
    } finally {
      screen.setupWorking = false;
      if (adapter.isCurrent(ticket)) {
        this.afterSetup();
      }
    }
  }
}
