// LWC's development build lists what it renders, for hot reload (nothing here uses that, and a
// production build doesn't keep the list). It tidies each list through a FinalizationRegistry: as
// garbage collection clears components, one callback per entry walks the whole list backwards,
// splicing (@lwc/engine-dom, ModernWeakMultiMap). After test files that made tens of thousands of
// components, those callbacks took 28 s of a worker's CPU, run whenever the collector got to them,
// so a test in a later file hit Jest's 20 s limit: profiled on CI 2026-11-06. Tests only: components
// still work, the lists just aren't tidied, and each test file's lists go when the file ends. jsdom
// has its own realm and keeps the real one.
globalThis.FinalizationRegistry = class {
  register() {}
  unregister() {}
};
