/**
 * "Chugim" with Archery and Drama, on Week 1's Manual Build: Monday's Period 1 for Group A and
 * B, Tuesday's Period 1 and Lunch for Group A. A saved version also has it on Wednesday.
 */
@IsTest
public class LinkedChoicesMenu {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  public Map<String, Id> ids;
  public Id setId;
  public Id dramaId;

  public LinkedChoicesMenu() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    ShoreshTestData.fullSeason(camp.Id);
    ids = ShoreshTestData.lastSeasonIds.clone();
    List<Activity__c> activities = new List<Activity__c>{
      ShoreshTestData.activity(ids.get('Season'), 'Archery', null),
      ShoreshTestData.activity(ids.get('Season'), 'Drama', null)
    };
    Database.insert(activities, AccessLevel.USER_MODE);
    ElectiveSet__c chugim = new ElectiveSet__c(
      Season__c = ids.get('Season'),
      Name = 'Chugim'
    );
    Database.insert(chugim, AccessLevel.USER_MODE);
    setId = chugim.Id;
    Offering__c drama = new Offering__c(
      ElectiveSet__c = setId,
      Activity__c = activities[1].Id,
      NoSeatLimit__c = true
    );
    Database.insert(drama, AccessLevel.USER_MODE);
    dramaId = drama.Id;
    Schedule__c manual = new Schedule__c(
      Program__c = ids.get('Main'),
      Week__c = ids.get('Week 1'),
      Name = 'Week 1',
      Status__c = 'Draft',
      Origin__c = 'Manual'
    );
    Database.insert(manual, AccessLevel.USER_MODE);
    Schedule__c kept = ShoreshTestData.savedVersion(
      ids.get('Main'),
      ids.get('Week 1'),
      'Week 1, kept'
    );
    ScheduleDaySaves.write(
      manual.Id,
      new List<ScheduleDaySaves.DaySave>{
        new ScheduleDaySaves.DaySave(
          MONDAY,
          grid(new List<String>{ '1,', '1,' }),
          null
        ),
        new ScheduleDaySaves.DaySave(
          MONDAY.addDays(1),
          grid(new List<String>{ '1,1', ',' }),
          null
        )
      }
    );
    ScheduleDaySaves.write(
      kept.Id,
      new List<ScheduleDaySaves.DaySave>{
        new ScheduleDaySaves.DaySave(
          MONDAY.addDays(2),
          grid(new List<String>{ '1,', '1,' }),
          null
        )
      }
    );
  }

  /** A day with Chugim where a row says '1' (Period 1, Lunch). */
  ScheduleGrid grid(List<String> rows) {
    ScheduleGrid result = new ScheduleGrid();
    result.blocks.add(
      new ScheduleGrid.Block(ids.get('Period 1'), 'Period 1')
        .at('09:00', '09:45')
    );
    result.blocks.add(
      new ScheduleGrid.Block(ids.get('Lunch'), 'Lunch').at('12:00', '12:45')
    );
    result.groups.add(new ScheduleGrid.GroupRef(ids.get('Group A'), 'Group A'));
    result.groups.add(new ScheduleGrid.GroupRef(ids.get('Group B'), 'Group B'));
    result.items.add(new ScheduleGrid.Item('E', setId, 'Chugim'));
    for (String row : rows) {
      result.rows.add(row.split(',', -1));
    }
    return result;
  }

  public LinkedChoiceSaves.Period period(String weekday, String block) {
    LinkedChoiceSaves.Period result = new LinkedChoiceSaves.Period();
    result.weekday = weekday;
    result.blockId = ids.get(block);
    return result;
  }

  /** Sends body to the action; answers [status, sentence], through its ask-first when it has one. */
  public static List<Object> sent(
    AgentWeeks.Action action,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentAskFirstTestCalls.answer(action);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  public Map<String, Object> at(Map<String, Object> more) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => [
        SELECT Name
        FROM Season__c
        WHERE Id = :ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Name,
      'elective_set' => 'Chugim'
    };
    body.putAll(more);
    return body;
  }

  public static List<Object> periods(String day, String blockName) {
    return new List<Object>{
      new Map<String, Object>{ 'day' => day, 'time' => blockName }
    };
  }

  /** A camper with a seat in Drama, in a run of Week 1: what makes the row in use. */
  public void seatTaken() {
    Season__c season = [
      SELECT Id
      FROM Season__c
      WHERE Id = :ids.get('Season')
      WITH SYSTEM_MODE
    ];
    Schedule__c schedule = ShoreshTestData.version(
      ids.get('Main'),
      ids.get('Week 1'),
      'Imported'
    );
    ElectiveRun__c run = new ElectiveRun__c(
      Season__c = season.Id,
      Name = 'Chugim · Week 1',
      ElectiveSet__c = setId,
      Week__c = ids.get('Week 1'),
      Schedule__c = schedule.Id
    );
    Database.insert(run, AccessLevel.USER_MODE);
    Camper__c camper = new Camper__c(
      Season__c = season.Id,
      Name = 'Synthetic Camper'
    );
    Database.insert(camper, AccessLevel.USER_MODE);
    Database.insert(
      new Assignment__c(
        ElectiveRun__c = run.Id,
        Camper__c = camper.Id,
        Group__c = ids.get('Group A'),
        TimeBlock__c = ids.get('Period 1'),
        Offering__c = dramaId,
        Date__c = Date.newInstance(2026, 6, 30)
      ),
      AccessLevel.USER_MODE
    );
  }
}
