/**
 * Generated Schedule's side of c/shoreshBuildWeek: the week is loadWeek's answer (loaded), read
 * again whole after an update.
 */
export function generatedWeekAdapter(host) {
  return {
    screen: host,
    scheduleId: () => (host.loaded && host.loaded.scheduleId) || null,
    weekKey: () => host.loadedFor,
    busy: () => host.actionsDisabled,
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
