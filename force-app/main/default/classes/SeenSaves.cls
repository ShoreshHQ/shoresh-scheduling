/**
 * Nothing is overwritten unseen (ADR 0011 choice 5). Reading a thing gives a ticket: what a
 * row's fields held and who it covered when the person saw it, or the week's revision. Saving
 * hands the ticket back, and Seen holds the thing until the request ends (FOR UPDATE), compares,
 * and says what someone else changed since; the caller refuses in its screen's own words. Users:
 * setup rows (RowSaves), an activity's details (ActivityDetails, for the panel and
 * change_activity_rules) and Generated Schedule's locks (GeneratedLocks, for the screen and
 * lock_cells/unlock_cells). Compares with RowSeen's rules.
 */
public with sharing class SeenSaves {
  /**
   * Holds the row and compares each field the person changed (record) with what they saw in it
   * (seen), and who it covers with seenWho (null when they didn't change who). wantedWho is who
   * they chose: someone else having chosen the same is no question. A row someone else deleted
   * is refused in plain words.
   */
  public static RowSaves.Result row(
    SObject record,
    SObject seen,
    List<Id> seenWho,
    List<Id> wantedWho
  ) {
    Map<String, Schema.SObjectField> compared = RowSeen.comparedFields(
      record,
      seen
    );
    SObject now = RowSeen.lockedNow(record, compared.values(), seen);
    RowSaves.Result result = new RowSaves.Result();
    for (String name : compared.keySet()) {
      Schema.SObjectField field = compared.get(name);
      if (
        !RowSeen.stillSeenSaves(
          seen.get(field),
          now.get(field),
          record.get(field)
        )
      ) {
        result.changed.add(name);
        result.theirs = now;
      }
    }
    if (seenWho != null) {
      List<Id> who = RowSeen.whoNow(record);
      if (
        !RowSeen.sameIds(seenWho, who) &&
        (wantedWho == null || !RowSeen.sameIds(wantedWho, who))
      ) {
        result.theirWho = who;
        result.theirs = now;
      }
    }
    return result;
  }

  /**
   * Whether the week is still at the revision the person read (the ticket), its draft already
   * held (GeneratedDrafts.lockedToEdit). No ticket is never as seen.
   */
  public static Boolean week(List<ScheduleDays.DayGrid> days, String ticket) {
    return String.isNotBlank(ticket) &&
      GeneratedDrafts.revisionOf(days).equals(ticket);
  }
}
