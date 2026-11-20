import previewPublish from "@salesforce/apex/ManualBuildController.previewPublish";
import publish from "@salesforce/apex/ManualBuildController.publish";
import unpublish from "@salesforce/apex/ManualBuildController.unpublish";

/**
 * Manual Build's side of c/shoreshBuildWeek: the week is ManualBuildController's draft, and an
 * update sends back the draft as it is now.
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
