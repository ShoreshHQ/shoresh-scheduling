# Desktop engine, vendored for the differential test

A copy of the Shoresh desktop app's schedule generator (`src/engine/buildSchedule.js` and the
files it imports), used only by `force-app/main/default/lwc/shoreshEngine/__tests__/desktopDifferential.test.js`
to compare this engine's outcomes with the desktop's on the same synthetic camps. It never ships
(`jest/` is outside `force-app`).

- Licence: `LICENSE` and `NOTICE` here, copied from the desktop repo.
- Source: ShoreshHQ desktop app, commit `69dbd34767ccb98fe9b0ca9f928d92b4263b53c1` (2026-10-13).
  Same owner as this repo; Apache License 2.0.
- One change: `import.meta.env?.DEV` (a Vite-only dev check) is replaced by `true`, since Jest
  runs CommonJS. The desktop's dev-only checks stay on, as in its own dev runs, so the
  differential's hand-written translation (`desktopInput()`) fails loudly when it hands the
  engine the wrong shape (an id list that isn't a list). Nothing else is edited; Prettier skips
  this folder to keep it as the source has it.
- To refresh: copy the same files from the desktop's `src/engine/` and `src/utils/timeBlockRange.js`,
  reapply the one change, and update the commit above.
