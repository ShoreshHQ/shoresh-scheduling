// Each test starts with an empty session storage: the camp page keeps where a tab is there for a
// reload (c/shoreshPlace), which would otherwise open the next test's page where the last one was.
afterEach(() => {
  window.sessionStorage.clear();
});
