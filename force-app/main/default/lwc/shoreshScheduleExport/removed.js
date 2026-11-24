/**
 * What a schedule's file and printout say of something removed from the season since it was
 * placed, and of a day that can't be read: the same words on every sheet and page.
 */
export const REMOVED = "(removed)";
export const CANT_BE_SHOWN = "Can't be shown";

export function withRemoved(name, gone) {
  return gone ? `${name} ${REMOVED}` : name;
}
