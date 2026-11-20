import previewPublish from "@salesforce/apex/GeneratedScheduleController.previewPublish";
import publish from "@salesforce/apex/GeneratedScheduleController.publish";
import unpublish from "@salesforce/apex/GeneratedScheduleController.unpublish";
import saveVersion from "@salesforce/apex/GeneratedScheduleController.saveVersion";
import deleteVersion from "@salesforce/apex/GeneratedScheduleController.deleteVersion";
import restoreVersion from "@salesforce/apex/GeneratedScheduleController.restoreVersion";
import restoreVersionAsNew from "@salesforce/apex/GeneratedScheduleController.restoreVersionAsNew";
import undoBuild from "@salesforce/apex/GeneratedUndoController.undoBuild";

/**
 * Generated Schedule's side of c/shoreshBuildWeek: the week is loadWeek's answer (loaded), read
 * again whole after an update or a Restore (the server sends back only whether it was done).
 */
export function generatedWeekAdapter(host) {
  return {
    screen: host,
    scheduleId: () => (host.loaded && host.loaded.scheduleId) || null,
    revision: () => (host.loaded ? host.loaded.revision : null),
    origin: "Generated",
    weekKey: () => host.loadedFor,
    busy: () => host.actionsDisabled,
    reading: () => host.reading,
    previewPublish,
    publish,
    unpublish,
    saveVersion,
    deleteVersion,
    // A week not generated yet: the version becomes its Generated Schedule (decision 9). Undo
    // keeps the week first as "Before Undo", Restore as "Before Restore" (word walk W6).
    restoreVersion: async ({ scheduleId, versionId, seenRevisions, undo }) => {
      const done = scheduleId
        ? await (undo ? undoBuild : restoreVersion)({
            scheduleId,
            versionId,
            seenRevisions
          })
        : await restoreVersionAsNew({
            programId: host.programId,
            weekId: host.weekId,
            versionId
          });
      return { refused: !done };
    },
    showRestored: (result, ticket, restored) =>
      host.showRestoredWeek(ticket, restored),
    // Held as a save someone else's got in the way of is (Reload reads the week), on the quiet
    // line Manual Build shows for it, not the alert box.
    refuseRestore: (text) => {
      host.conflict = { message: text, quiet: true };
      host.focusAfterRender = { selector: '[data-id="reload"]' };
    },
    // Set as the hold ends, so the render that enables its button focuses it.
    versionsOver: () => {
      if (host.focusAfterVersions) {
        host.focusAfterRender = { selector: host.focusAfterVersions };
        host.focusAfterVersions = null;
      }
    },
    sayDone: (text) => host.sayDone(text),
    // Not a read's error: the next read of the week leaves it.
    showError: (error) => {
      host.error = error;
      host.errorFromRead = false;
    },
    beginUpdate: () => {
      host.loadTicket += 1;
      host.weekTicket += 1;
      host.reading = false;
      host.loading = false;
      return host.loadTicket;
    },
    isCurrent: (ticket) => ticket === host.loadTicket,
    showUpdated: (result, ticket) => host.showUpdated(ticket),
    readAfterWork: () => {
      host.readAfterRun = true;
    },
    readIfAsked: () => host.readAfterSetup()
  };
}
