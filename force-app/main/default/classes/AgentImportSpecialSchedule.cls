/**
 * import_special_schedule: a special day's or event's own schedule from a file, as Import on its
 * page does, through an agent or the command line (docs/protocol/api.md API-1.85). Web address
 * /v1/import_special_schedule, POST {season, special, kind, seen, file_name, blocks, columns,
 * no_times, places, page_count, replace_edited}. The connector reads the file with the page's own
 * module (c/shoreshSpecialSchedule fromFile.js: pagesOf, planFromPage) into blocks and columns;
 * this is the page's own save (SpecialScheduleController.importPlan) at the revision read (seen),
 * compared with the item locked: saved since is refused (409), and a schedule with entries is
 * refused as on the page. Time blocks or stations the person changed are not replaced unless
 * replace_edited is true; without it the answer is the page's question, with nothing saved.
 */
@RestResource(urlMapping='/v1/import_special_schedule')
global with sharing class AgentImportSpecialSchedule implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'special',
    'kind',
    'seen',
    'file_name',
    'blocks',
    'columns',
    'no_times',
    'places',
    'page_count',
    'replace_edited'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentImportSpecialSchedule());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentSpecials.Found found = AgentSpecials.find(body);
    String seen = AgentFields.text(body, 'seen');
    if (seen != AgentSpecials.NEVER_SAVED && !seen.isNumeric()) {
      throw new ShoreshException(
        'Nothing was imported. Send seen as read_special_schedule said it.'
      );
    }
    SpecialScheduleImport.Imported imported = importedOf(body);
    SpecialScheduleImport.Outcome outcome;
    try {
      outcome = SpecialScheduleController.importPlan(
        found.owner.itemId,
        seen == AgentSpecials.NEVER_SAVED ? null : Integer.valueOf(seen),
        imported
      );
    } catch (Exception e) {
      String words = ScreenErrors.words(e);
      if (words.startsWith('Someone else changed')) {
        throw new AgentWeeks.ConflictException(
          'Changed by someone else since you read it. Nothing was imported. Read it again with read_special_schedule.'
        );
      }
      throw new ShoreshException('Nothing was imported. ' + words);
    }
    return new Words(found, body).of(outcome);
  }

  /** The blocks and columns the page's module read from the file. */
  private static SpecialScheduleImport.Imported importedOf(
    Map<String, Object> body
  ) {
    SpecialScheduleImport.Imported imported;
    try {
      imported = (SpecialScheduleImport.Imported) JSON.deserialize(
        JSON.serialize(
          new Map<String, Object>{
            'blocks' => body.get('blocks'),
            'columns' => body.get('columns')
          }
        ),
        SpecialScheduleImport.Imported.class
      );
    } catch (Exception e) {
      imported = null;
    }
    if (
      imported == null ||
      imported.blocks == null ||
      imported.columns == null
    ) {
      throw new ShoreshException(
        'Nothing was imported: the file could not be read. Read it again.'
      );
    }
    imported.replaceEdited = body.get('replace_edited') == true;
    return imported;
  }

  /** What the page says about an import, and the question it asks first. */
  private class Words {
    final AgentSpecials.Found found;
    final Map<String, Object> body;
    final String fileName;

    Words(AgentSpecials.Found found, Map<String, Object> body) {
      this.found = found;
      this.body = body;
      this.fileName = AgentFields.text(body, 'file_name');
    }

    String of(SpecialScheduleImport.Outcome outcome) {
      if (outcome.asks == true) {
        return 'Nothing was imported yet. The page asks: Replace ' +
          frameWords() +
          ' in ' +
          found.owner.name +
          '? ' +
          String.join(frameSaid(outcome.frame, ''), ' ') +
          ' This can\'t be undone. Ask the person; to go ahead, send the same file with replace_edited: true.';
      }
      List<String> lines = new List<String>{
        'Imported ' +
        fileName +
        ': ' +
        outcome.placed +
        (outcome.placed == 1 ? ' cell' : ' cells') +
        ' filled.'
      };
      if (!outcome.replaced.isEmpty()) {
        lines.add(
          'Replaced by the file, brought in when ' +
            found.owner.name +
            ' started: ' +
            String.join(outcome.replaced, ', ') +
            '.'
        );
      }
      lines.addAll(frameSaid(outcome.frame, ' by the file'));
      if (!outcome.added.isEmpty()) {
        lines.add(
          'Added to ' +
            found.labels.pluralInSentence('Activity') +
            ': ' +
            String.join(outcome.added, ', ') +
            '.'
        );
      }
      if (!outcome.notGroups.isEmpty()) {
        lines.add(
          'Left out, not a ' +
            found.labels.singularInSentence('Group') +
            ' here: ' +
            String.join(outcome.notGroups, ', ') +
            '.'
        );
      }
      lines.addAll(extras());
      lines.add(
        'seen is now ' +
          (outcome.plan == null ||
            outcome.plan.revision == null
            ? AgentSpecials.NEVER_SAVED
            : String.valueOf(outcome.plan.revision)) +
          '. There is no undo here: to take it back, clear it with change_special_schedule_frame.'
      );
      return String.join(lines, ' ');
    }

    /** What the file had that was not kept, as the page counts it. */
    List<String> extras() {
      List<String> lines = new List<String>();
      List<String> noTimes = new List<String>();
      if (body.get('no_times') instanceof List<Object>) {
        for (Object label : (List<Object>) body.get('no_times')) {
          noTimes.add(String.valueOf(label));
        }
      }
      if (!noTimes.isEmpty()) {
        lines.add('Left out, no times: ' + String.join(noTimes, ', ') + '.');
      }
      Integer places = numberOf(body.get('places'));
      if (places > 0) {
        lines.add(
          'Places written in ' +
            places +
            (places == 1 ? ' cell were' : ' cells were') +
            ' not kept.'
        );
      }
      if (numberOf(body.get('page_count')) > 1) {
        lines.add('Only the first schedule in the file was read.');
      }
      return lines;
    }

    String frameWords() {
      String blocks = 'the ' + found.labels.pluralInSentence('TimeBlock');
      return found.owner.isEvent() ? blocks + ' and stations' : blocks;
    }

    List<String> frameSaid(
      SpecialImportFrame.FrameChanges frame,
      String after
    ) {
      List<String> lines = new List<String>();
      if (frame == null) {
        return lines;
      }
      String blocks = found.labels.plural('TimeBlock');
      List<String> renamed = new List<String>();
      for (SpecialImportFrame.BlockRename r : frame.renamed) {
        renamed.add(r.was + ' to ' + r.now);
      }
      add(lines, blocks + ' renamed' + after, renamed);
      add(lines, blocks + ' removed' + after, frame.removed);
      add(lines, blocks + ' added' + after, frame.added);
      add(lines, 'Stations removed' + after, frame.stationsRemoved);
      add(lines, 'Stations added' + after, frame.stationsAdded);
      return lines;
    }

    void add(List<String> lines, String what, List<String> names) {
      if (names != null && !names.isEmpty()) {
        lines.add(what + ': ' + String.join(names, ', ') + '.');
      }
    }
  }

  private static Integer numberOf(Object value) {
    return value instanceof Integer ? (Integer) value : 0;
  }
}
