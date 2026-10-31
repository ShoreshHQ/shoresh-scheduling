/**
 * One batch coming in from another system (repo ADR 0024 choices 3 and 6; docs/protocol/api.md).
 * Each capability (IncomingCamper, IncomingCamperGroup, IncomingCamperElectiveChoice) is one piece
 * of logic, its plan; this runs it the same way whichever door the batch came through (a Flow
 * action or a web address: API-1.3):
 *
 * - API-4.4: the person or key must hold the capability's own permission set, and everything is
 *   read and written in user mode, so the set's object and field access is all it can reach.
 * - API-2.3: a batch is an import, saved and recorded as one (IncomingSave), so "Undo last
 *   import" on Roots takes it back.
 * - API-6.3: every record is reported back as saved, unchanged or a problem, in one sentence.
 * - API-2.2 and 4.1: a doubt or a disagreement is a question kept on the import for a person to
 *   see on Roots, never settled here.
 */
public with sharing class IncomingBatch {
  /** The person's own permission set, which reaches every capability (API-4.7). */
  private static final String SCHEDULER_SET = 'Shoresh_Scheduler';

  /** The most records one batch may carry. */
  public static final Integer MOST = 200;
  public static final String SAVED = 'saved';
  public static final String UNCHANGED = 'unchanged';
  public static final String PROBLEM = 'problem';
  /** What starts the key of every question a batch keeps (c/shoreshRoots shows them itself). */
  public static final String QUESTION_PREFIX = 'incoming|';

  public Season__c season { get; private set; }
  public CampLabels labels { get; private set; }
  public Capability capability { get; private set; }
  public List<IncomingResult> results { get; private set; }
  /** Rows to save, each with the record it is for and what to say once saved. */
  public List<Staged> staged { get; private set; }
  /** Questions for a person: [{ key, title }]. */
  public List<Map<String, String>> questions { get; private set; }
  /** The systems the batch came from, as they named themselves. */
  public Set<String> systems { get; private set; }

  /** What one capability does with its records. */
  public interface Capability {
    /** Its permission set's API name: "Send_Campers". */
    String permissionSet();
    /** Its permission set's label, for the refusal: "Send campers". */
    String permissionLabel();
    /** What Roots says the last import was: "Campers". */
    String what();
    /** The season a record names. */
    String seasonOf(Object record);
    /** The system a record says it comes from. */
    String systemOf(Object record);
    /**
     * Looks at every record still open (batch.open(i); a record the door could not read is null)
     * and says, through the batch, what to save, ask or refuse.
     */
    void plan(IncomingBatch batch, List<Object> records);
  }

  /** A whole batch that cannot be taken at all; nothing was saved. */
  public class RefusedException extends Exception {
  }

  /** The user does not hold the capability's permission set. */
  public class NoAccessException extends Exception {
  }

  /** One row to save for record index (new, or only the fields that change). */
  public class Staged {
    public Integer index;
    public SObject row;
    public String saved;
  }

  private IncomingBatch(Capability capability, Integer size) {
    this.capability = capability;
    results = new List<IncomingResult>();
    staged = new List<Staged>();
    questions = new List<Map<String, String>>();
    systems = new Set<String>();
    for (Integer i = 0; i < size; i++) {
      IncomingResult result = new IncomingResult();
      result.row = i + 1;
      results.add(result);
    }
  }

  /**
   * Runs one batch. unreadable: records the door could not read (by position), with why; they
   * are problems and the rest go ahead.
   */
  public static List<IncomingResult> run(
    Capability capability,
    List<Object> records,
    Map<Integer, String> unreadable
  ) {
    if (records.size() > MOST) {
      throw new RefusedException(
        'A batch can carry at most ' +
          MOST +
          ' records. Send these in smaller batches.'
      );
    }
    requireAccess(capability);
    IncomingBatch batch = new IncomingBatch(capability, records.size());
    for (Integer i : unreadable.keySet()) {
      batch.problem(i, unreadable.get(i));
    }
    batch.season = new IncomingSeason(batch).read(records);
    if (batch.season != null) {
      batch.labels = IncomingSeason.labelsOf(batch.season.Id);
      ImportUndo.lockSeason(batch.season.Id);
      capability.plan(batch, records);
      new IncomingSave(batch).run();
    }
    return batch.results;
  }

  /** API-4.4: the capability's own permission set, whoever is asking. */
  private static void requireAccess(Capability capability) {
    if (!holds(capability.permissionSet())) {
      throw new NoAccessException(
        'This user can\'t send ' +
          capability.what().toLowerCase() +
          '. A Salesforce admin can give it the "' +
          capability.permissionLabel() +
          '" permission set.'
      );
    }
  }

  /**
   * Whether the person asking holds this Shoresh permission set, or Shoresh Scheduler (a person
   * who can do it all on screen can do it through their AI, API-4.7), themselves or through a
   * group holding it: the platform's answer about this person (API-4.4; OutgoingDoors too).
   */
  public static Boolean holds(String setName) {
    Set<String> setNames = new Set<String>{ setName, SCHEDULER_SET };
    String namespace = ShoreshSchema.namespace();
    Set<Id> groups = new Set<Id>();
    for (PermissionSetGroupComponent part : [
      SELECT PermissionSetGroupId
      FROM PermissionSetGroupComponent
      WHERE
        PermissionSet.Name IN :setNames
        AND PermissionSet.NamespacePrefix = :namespace
      WITH SYSTEM_MODE
    ]) {
      groups.add(part.PermissionSetGroupId);
    }
    return ![
        SELECT Id
        FROM PermissionSetAssignment
        WHERE
          AssigneeId = :UserInfo.getUserId()
          AND ((PermissionSet.Name IN :setNames
          AND PermissionSet.NamespacePrefix = :namespace)
          OR PermissionSetGroupId IN :groups)
        WITH SYSTEM_MODE
        LIMIT 1
      ]
      .isEmpty();
  }

  // ---------------------------------------------------------------- what a capability says

  /** Whether record i is still to be decided (no problem found yet). */
  public Boolean open(Integer index) {
    return results[index].result == null;
  }

  public void problem(Integer index, String sentence) {
    say(index, PROBLEM, sentence);
  }

  public void unchanged(Integer index, String sentence) {
    say(index, UNCHANGED, sentence);
  }

  /** Records still open become this, with this sentence. */
  public void say(Integer index, String result, String sentence) {
    if (open(index)) {
      results[index].result = result;
      results[index].message = sentence;
    }
  }

  /** Record i saves this row; said with the sentence once saved. */
  public void save(Integer index, SObject row, String sentence) {
    Staged item = new Staged();
    item.index = index;
    item.row = row;
    item.saved = sentence;
    staged.add(item);
  }

  /**
   * A question for a person (API-2.2, 4.1): kept on the import and shown on Roots. key says what
   * it is about, so the same question is kept once.
   */
  public void ask(String key, String sentence) {
    String fullKey = (QUESTION_PREFIX + key).left(255);
    for (Map<String, String> question : questions) {
      if (question.get('key') == fullKey) {
        return;
      }
    }
    questions.add(
      new Map<String, String>{ 'key' => fullKey, 'title' => sentence.left(300) }
    );
  }

  /** Lower case, punctuation and spacing aside, as the import compares names. */
  public static String fold(String name) {
    return ChoicesImport.fold(name);
  }
}
