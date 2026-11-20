import previewPublish from "@salesforce/apex/ManualBuildController.previewPublish";
import publish from "@salesforce/apex/ManualBuildController.publish";
import unpublish from "@salesforce/apex/ManualBuildController.unpublish";
import saveVersion from "@salesforce/apex/ManualBuildController.saveVersion";
import deleteVersion from "@salesforce/apex/ManualBuildController.deleteVersion";
import restoreVersion from "@salesforce/apex/ManualBuildController.restoreVersion";

/**
 * Manual Build's side of c/shoreshBuildWeek: the week is ManualBuildController's draft, and an
 * update or a Restore sends back the draft as it is now.
 */
export function manualWeekAdapter(host) {
  return {
    screen: host,
    scheduleId: () => {
      const draft = host.schedule;
      return draft && draft.schedule ? draft.schedule.id : null;
    },
    revision: () => (host.server ? host.server.revisions : null),
    origin: "Manual",
    weekKey: () => host.weekKey,
    busy: () => host.editBusy || host.versionsWorking || host.publishing,
    reading: () => host.reads > 0,
    previewPublish,
    publish,
    unpublish,
    saveVersion,
    deleteVersion,
    // A Restore sent: the last one's refusal is behind it.
    restoreVersion: async ({ scheduleId, versionId, seenRevisions }) => {
      host.restoreRefused = false;
      const draft = await restoreVersion({
        scheduleId,
        versionId,
        seenRevisions
      });
      return { refused: !!draft.changedSince, draft };
    },
    showRestored: (result, ticket, { id, said }) => {
      host.showRestored(result.draft, id, said);
      return true;
    },
    // Its line, with Reload: focus goes to Reload once drawn.
    refuseRestore: () => {
      host.restoreRefused = true;
      host.focusReloadAfterRender = true;
    },
    versionsOver: () => {},
    sayDone: (text) => host.say(text),
    showError: (error) => {
      host.error = error;
    },
    beginUpdate: () => {
      host.loadTicket += 1;
      return host.loadTicket;
    },
    isCurrent: (ticket) => ticket === host.loadTicket,
    showUpdated: (result) => {
      host.showUpdated(result.view);
      return true;
    },
    readAfterWork: () => {
      host.readAfterRun = true;
    },
    readIfAsked: () => host.readAfterSetup()
  };
}
