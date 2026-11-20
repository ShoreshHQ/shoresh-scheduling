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
    weekKey: () => host.weekKey,
    busy: () => host.editBusy || host.versionsWorking || host.publishing,
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
