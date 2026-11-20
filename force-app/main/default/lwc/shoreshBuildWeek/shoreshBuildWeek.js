/**
 * The week on a build screen (Generated Schedule, Manual Build): what acts on "the week as this
 * screen last read it", written once for both. Now: what setup changed since the week was made,
 * "Update to match setup" (ADR 0008 part 6, SetupMatch), and Publish and Unpublish (ADR 0008
 * part 5; ADR 0010 "Publish").
 *
 * Each screen passes an adapter (its weekAdapter.js):
 * - screen: the component. Read: weekName, t, error, weekEditor, setupPreview, setupAsk,
 *   setupWorking, publishDisabled, editBusy, checked, measure, publishState, publishAsk,
 *   unpublishAsk. Set: setupPreview, setupAsk, setupWorking, focusOn, publishing, publishState,
 *   publishAsk, unpublishAsk. Called: say(text), load(true), loadVersions(),
 *   tellSchedulesChanged().
 * - scheduleId(): the week's schedule, or null when it has none yet.
 * - revision(): the week's revisions as this screen last read them.
 * - origin: which screen ("Generated", "Manual"), for the publish question.
 * - weekKey(): which week is shown, so an answer for a week no longer shown is dropped.
 * - busy(): Update to match setup waits ("One moment").
 * - reading(): a read of the week is on its way.
 * - previewPublish(args), publish(args), unpublish(args): the screen's controller's.
 * - sayDone(text): said after an action that changed the week.
 * - showError(error): the screen's error line (null clears it).
 * - beginUpdate(): a read on its way must not replace the week as this work leaves it (an
 *   update, a publish); returns a ticket, and isCurrent(ticket) says whether the week is still
 *   the one updated.
 * - showUpdated(result, ticket): shows the week as the update left it; false when it can't now.
 * - readAfterWork(): the week is read again once this is over; readIfAsked(): now, if asked.
 */
import getSetupChanges from "@salesforce/apex/SetupMatchController.getSetupChanges";
import updateToMatchSetupOnServer from "@salesforce/apex/SetupMatchController.updateToMatchSetup";
import { failed } from "c/shoreshErrors";
import { publishQuestion } from "c/shoreshPublish";

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

  // ---------- Publish and Unpublish ----------

  /**
   * Publish and Unpublish wait while anything is under way (publishDisabled: the question is
   * worked out from the week shown, so it waits for the week as it is). Said when an edit is
   * still saving.
   */
  publishWaits() {
    const { screen } = this.adapter;
    if (!screen.publishDisabled) {
      return false;
    }
    if (screen.editBusy) {
      screen.say("One moment: an edit is still saving.");
    }
    return true;
  }

  /**
   * Publish: the server's preview says what would change; with the week's checks (the Open
   * cells and their reasons, the dots) that decides whether to ask first (c/shoreshPublish). A
   * week already published as it is needs nothing.
   */
  async publish() {
    const { adapter } = this;
    const { screen } = adapter;
    const scheduleId = adapter.scheduleId();
    if (this.publishWaits() || !scheduleId) {
      return;
    }
    // The answer is for this week; one for a week no longer shown is dropped.
    const week = adapter.weekKey();
    screen.publishing = true;
    adapter.showError(null);
    try {
      const preview = await adapter.previewPublish({ scheduleId });
      if (week !== adapter.weekKey()) {
        return;
      }
      // Someone else saved the week since this screen read it: what would be published isn't
      // what is shown. Nothing is published; the week is read again for the director to see.
      if (preview.revisions !== adapter.revision()) {
        this.refusePublish(this.draftChangedText);
        return;
      }
      const question = publishQuestion({
        preview,
        checked: screen.checked,
        counts: null,
        measure: screen.measure,
        weekName: screen.weekName,
        t: screen.t,
        origin: adapter.origin
      });
      if (question.kind === "same") {
        screen.publishState = { ...preview.published, changedSince: false };
        screen.say(`${screen.weekName} is already published as it is.`);
      } else if (question.kind === "now") {
        await this.publishNow({ preview, week, scheduleId });
      } else {
        screen.publishAsk = { ...question, preview, week, scheduleId };
      }
    } catch (e) {
      this.publishFailed(week, "published", e);
    } finally {
      if (!screen.publishAsk) {
        this.publishDone(week, "publish");
      }
    }
  }

  async answerPublish(yes) {
    const { screen } = this.adapter;
    const ask = screen.publishAsk;
    screen.publishAsk = null;
    try {
      if (yes) {
        // The server refuses it if the week changed since the preview.
        await this.publishNow(ask);
      }
    } catch (e) {
      this.publishFailed(ask.week, "published", e);
    } finally {
      this.publishDone(ask.week, "publish");
    }
  }

  /**
   * Publishes the week the preview showed; a week or publish changed since is refused. The
   * answer is always shown, unless another week is shown by then.
   */
  async publishNow({ preview, week, scheduleId }) {
    const { adapter } = this;
    const { screen } = adapter;
    this.dropRead();
    const result = await adapter.publish({
      scheduleId,
      seenRevisions: preview.revisions,
      seenPublishedId: preview.published ? preview.published.id : null
    });
    if (week !== adapter.weekKey()) {
      // Published, though another week is shown now: the other screens still show it (WEEK-6.7).
      if (
        !result.draftChanged &&
        !result.publishedChanged &&
        !result.unchanged
      ) {
        screen.tellSchedulesChanged(true, week);
      }
      return;
    }
    if (result.draftChanged || result.publishedChanged) {
      this.refusePublish(
        result.draftChanged
          ? this.draftChangedText
          : `Someone else published this ${screen.t.sIn("Week")} since, so nothing was replaced.`
      );
      return;
    }
    screen.publishState = { ...result.published, changedSince: false };
    if (result.unchanged) {
      screen.say(`${screen.weekName} is already published as it is.`);
      return;
    }
    adapter.sayDone(`Published ${screen.weekName}.`);
    // A published schedule it replaced is a version now: Versions lists it before Publish is back.
    await screen.loadVersions();
    // The week's published schedule, on every screen (WEEK-6.7).
    screen.tellSchedulesChanged(true);
  }

  /**
   * Unpublish (Greg, 2026-10-18): asks first, Cancel focused. The week then has no published
   * schedule; the one it had is kept as a version marked Published, as one replaced is.
   */
  askUnpublish() {
    const { adapter } = this;
    const { screen } = adapter;
    if (!screen.publishState || this.publishWaits()) {
      return;
    }
    screen.publishing = true;
    adapter.showError(null);
    screen.unpublishAsk = {
      heading: `Unpublish ${screen.weekName}?`,
      lines: [`Nothing will be published for this ${screen.t.sIn("Week")}.`],
      publishedId: screen.publishState.id,
      week: adapter.weekKey(),
      scheduleId: adapter.scheduleId()
    };
  }

  async answerUnpublish(yes) {
    const { screen } = this.adapter;
    const ask = screen.unpublishAsk;
    screen.unpublishAsk = null;
    try {
      if (yes) {
        await this.unpublishNow(ask);
      }
    } catch (e) {
      this.publishFailed(ask.week, "unpublished", e);
    } finally {
      // Back to Unpublish, or to Publish once the week has nothing published.
      this.publishDone(ask.week, "unpublish");
    }
  }

  /** Refused when the week was published or unpublished since the screen showed it. */
  async unpublishNow(ask) {
    const { adapter } = this;
    const { screen } = adapter;
    this.dropRead();
    const result = await adapter.unpublish({
      scheduleId: ask.scheduleId,
      seenPublishedId: ask.publishedId
    });
    if (ask.week !== adapter.weekKey()) {
      // Unpublished, though another week is shown now: the other screens still show it.
      if (!result.publishedChanged) {
        screen.tellSchedulesChanged(true, ask.week);
      }
      return;
    }
    if (result.publishedChanged) {
      this.refusePublish(
        `Someone else published or unpublished this ${screen.t.sIn("Week")} since, so nothing was unpublished.`
      );
      return;
    }
    screen.publishState = null;
    adapter.sayDone(`Unpublished ${screen.weekName}.`);
    // The copy is a version now, marked Published: Versions lists it before Unpublish is back.
    await screen.loadVersions();
    // No published schedule for the week now, on every screen (WEEK-6.7).
    screen.tellSchedulesChanged(true);
  }

  /**
   * A read already on its way read the week before this publish or unpublish: its answer must
   * not show the old publish state again. It is dropped, and the week is read again once this is
   * over, so what the read was for (a failed save, other people's changes) is still shown.
   */
  dropRead() {
    if (this.adapter.reading()) {
      this.adapter.beginUpdate();
      this.adapter.readAfterWork();
    }
  }

  /** Said on the error line, for the week still shown only. */
  publishFailed(week, what, e) {
    const { adapter } = this;
    if (week === adapter.weekKey()) {
      adapter.showError(
        failed(`${adapter.screen.weekName} was not ${what}.`, e)
      );
    }
  }

  /**
   * A publish or unpublish is over: builds, edits and the pickers go on, focus goes back to its
   * button (WCAG 2.4.3), and a read asked for meanwhile (the season read again, a read dropped)
   * is done now. An answer for a week no longer shown leaves the week shown as it is: showing it
   * let go of the publish (forgetPublish), and a publish asked from it since is still on its way.
   */
  publishDone(week, button) {
    const { adapter } = this;
    if (week !== adapter.weekKey()) {
      return;
    }
    adapter.screen.publishing = false;
    adapter.screen.focusOn = button;
    adapter.readIfAsked();
  }

  /**
   * Another week is shown (or none): a publish question open for the last one goes (nothing was
   * sent), and a publish on its way for it holds this one no longer.
   */
  forgetPublish() {
    const { screen } = this.adapter;
    screen.publishing = false;
    screen.publishAsk = null;
    screen.unpublishAsk = null;
  }

  get draftChangedText() {
    return `Someone else changed this ${this.adapter.screen.t.sIn("Week")} since, so nothing was published.`;
  }

  /** Nothing was published: the quiet line says why, and the week is read again for the director. */
  refusePublish(text) {
    const { screen } = this.adapter;
    screen.say(text);
    screen.load(true);
  }
}
