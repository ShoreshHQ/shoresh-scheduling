/**
 * Does a camper's rank come from an actual ordering? Adapted from the desktop's
 * src/engine/rankKind.js (Scheduling-Project- 69dbd34, Apache-2.0).
 *
 * A choices sheet can say "1 Archery, 2 Drama" (an order) or list "Swim, Archery, Ceramics" in
 * one cell with no order (a tie among equals that still carries an integer rank). Only the first
 * is evidence of a second choice, so a seat is marked "not their top choice" only on positive
 * evidence (desktop owner ruling 2026-09-29: unordered choices are never shown as ranks). A
 * missing or unknown kind is not evidence.
 */
export const CELL_CHOICE = "cell-choice";
export const ORDERED_FALLBACK = "ordered-fallback";
export const UNORDERED_SET = "unordered-set";

export function hasOrderingEvidence(rankKind) {
  return rankKind === CELL_CHOICE || rankKind === ORDERED_FALLBACK;
}
