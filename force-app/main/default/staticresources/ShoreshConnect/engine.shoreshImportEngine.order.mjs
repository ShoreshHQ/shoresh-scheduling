/**
 * Text in the same order in every browser language (INGEST-5.12): by character code, never by the
 * browser's locale, as the week engine orders it (c/shoreshTerms compareText). An order here can
 * name a set, pick a spelling or decide what is read first, so it is part of what is saved.
 */
import { compareText } from "./engine.shoreshTerms.shoreshTerms.mjs";

export { compareText };

/** Names: capitals aside first ("arts" beside "Arts"), then by character code. */
export function compareNames(a, b) {
  return (
    compareText(String(a).toLowerCase(), String(b).toLowerCase()) ||
    compareText(a, b)
  );
}

/** Names with numbers in them, the numbers by value: "Bunk 2" before "Bunk 10". */
export function compareNumbered(a, b) {
  const parts = (s) =>
    String(s)
      .toLowerCase()
      .match(/\d+|\D+/g) || [];
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const byValue =
      /^\d/.test(x[i]) && /^\d/.test(y[i])
        ? Math.sign(Number(x[i]) - Number(y[i]))
        : 0;
    const c = byValue || compareText(x[i], y[i]);
    if (c) {
      return c;
    }
  }
  return x.length - y.length || compareText(a, b);
}
