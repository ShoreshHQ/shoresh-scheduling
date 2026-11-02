/**
 * Nothing is overwritten unseen (ADR 0011 choice 5). Reading a thing gives a ticket: what a
 * row's fields held and who it covered when the person saw it, or the week's revision. Saving
 * hands the ticket back, and SeenSaves holds the thing until the request ends (FOR UPDATE), compares,
 * and says what someone else changed since; the caller refuses in its screen's own words. Users:
 * setup rows (RowSaves), an activity's details (ActivityDetails, for the panel and
 * change_activity_rules), Generated Schedule's locks and the AI's cell changes (GeneratedLocks,
 * AgentSchedules.holdAsSeen), a special plan (SpecialPlans), an elective run's seats
 * (AgentElectives), and the stamps an import, Clear electives and Update to match read
 * (AgentImports, AgentClearElectives, AgentUpdateToMatch). Compares with RowSeen's rules.
 */
public with sharing class SeenSaves {
  /** A row's ticket: what its changed fields held when the person saw it, and who it covered. */
  public class Ticket {
    /** The changed fields as seen (null for a new row). */
    @AuraEnabled
    public SObject seen { get; set; }
    /** Who it covered (null when the person didn't change who). */
    @AuraEnabled
    public List<Id> seenWho { get; set; }
  }

  /** A ticket from what was seen (the screens send theirs as one). */
  public static Ticket ticket(SObject seen, List<Id> seenWho) {
    Ticket result = new Ticket();
    result.seen = seen;
    result.seenWho = seenWho;
    return result;
  }

  /**
   * A row as read, each field named: a field read empty is still seen (Salesforce leaves fields
   * a query found empty out of a row's populated fields).
   */
  public static SObject asRead(SObject row, List<Schema.SObjectField> fields) {
    SObject result = row.getSObjectType().newSObject(row.Id);
    for (Schema.SObjectField field : fields) {
      result.put(field, row.get(field));
    }
    return result;
  }

  /**
   * Holds the row and compares each field the person changed (record) with its ticket.
   * wantedWho is who they chose: someone else having chosen the same is no question. A row
   * someone else deleted is refused in plain words.
   */
  public static RowSaves.Result row(
    SObject record,
    Ticket ticket,
    List<Id> wantedWho
  ) {
    SObject seen = ticket == null ? null : ticket.seen;
    List<Id> seenWho = ticket == null ? null : ticket.seenWho;
    Map<String, Schema.SObjectField> compared = RowSeen.comparedFields(
      record,
      seen
    );
    SObject now = RowSeen.lockedNow(record, compared.values(), seen);
    RowSaves.Result result = new RowSaves.Result();
    for (String name : compared.keySet()) {
      Schema.SObjectField field = compared.get(name);
      if (
        !RowSeen.stillAsSeen(seen.get(field), now.get(field), record.get(field))
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
    return stamp(GeneratedDrafts.revisionOf(days), ticket);
  }

  /**
   * Whether a thing, already held, still has the stamp the person read (the ticket), exactly:
   * no ticket is never as seen.
   */
  public static Boolean stamp(String now, String ticket) {
    return String.isNotBlank(ticket) && ticket.equals(now);
  }

  /**
   * Whether a thing, already held, is still at the revision the person read (the ticket); null
   * is never saved, so a ticket of null is as seen only while it still hasn't been.
   */
  public static Boolean revision(Decimal now, Decimal ticket) {
    return now == ticket;
  }
}
