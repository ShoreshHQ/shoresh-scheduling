// jsdom matches every stylesheet rule against an element through nwsapi, which keeps its compiled
// selectors in a cache of 1000. The setup page's components hold close to that many distinct
// selectors (LWC scopes each component's rules), so a few more rules made the cache drop entries
// on every element and an axe check over a setup screen went from under 1 s to over 5 s, past
// Jest's limit (seen in step 3b, 2026-10-21). This gives the page's document the same nwsapi,
// configured as jsdom configures it (jsdom/lib/jsdom/living/helpers/selectors.js), with room for
// 10000. Only the cache size differs: what matches is unchanged. Tests only.
const fs = require("fs");

const CACHE = 10000;
const source = fs
  .readFileSync(require.resolve("nwsapi"), "utf8")
  .replace(/CACHE_LIMIT = \d+/, `CACHE_LIMIT = ${CACHE}`);

if (!source.includes(`CACHE_LIMIT = ${CACHE}`)) {
  throw new Error(
    "jest/selector-cache.js: nwsapi no longer has CACHE_LIMIT; check this file."
  );
}

const loaded = { exports: {} };
new Function("module", "exports", source)(loaded, loaded.exports);
const nwsapi = loaded.exports;

// jsdom keeps the document's own object under a symbol named "impl".
const implSymbol = Object.getOwnPropertySymbols(document).find(
  (symbol) => symbol.description === "impl"
);
const impl = implSymbol && document[implSymbol];
if (impl) {
  const engine = nwsapi({ document, DOMException });
  engine.configure({
    LOGERRORS: false,
    VERBOSITY: false,
    IDS_DUPES: true,
    MIXEDCASE: true
  });
  impl._nwsapiDontThrow = engine;
}
