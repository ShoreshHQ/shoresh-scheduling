// How many seeded camps the engine's heaviest tests build. CI's default run (jest.config.js) takes
// the smaller, fixed sample, so the job stays a few minutes; `npm run test:engine:full`
// (jest.full.config.js) sets SHORESH_JEST_FULL and builds every one. Same seeds, same assertions,
// either way: the small sample is the first `ci` of the full list. Here, outside force-app,
// because LWC code may not read process.env (and doesn't need to: Jest's globals carry the flag).
function sampled(full, ci) {
  return globalThis.SHORESH_JEST_FULL ? full : ci;
}

module.exports = { sampled };
