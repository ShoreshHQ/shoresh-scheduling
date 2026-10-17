/**
 * Import plans for tests, built the way the import screen builds them (c/shoreshImportEngine
 * planFor). Made-up camp only.
 */
@IsTest
public class ImportTestPlans {
  public static final List<String> WEEK = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
  };

  public static Map<String, Object> entry(List<Object> pairs) {
    Map<String, Object> result = new Map<String, Object>();
    for (Integer i = 0; i < pairs.size(); i += 2) {
      result.put((String) pairs[i], pairs[i + 1]);
    }
    return result;
  }

  public static Map<String, Object> emptyPlan(Id seasonId) {
    Map<String, Object> plan = new Map<String, Object>{
      'seasonId' => seasonId,
      'files' => 'maple-grove.xlsx'
    };
    for (
      String name : new List<String>{
        'programs',
        'timeBlocks',
        'divisions',
        'groups',
        'locations',
        'activities',
        'fixedActivities',
        'recurringActivities',
        'versions',
        'remember',
        'forget'
      }
    ) {
      plan.put(name, new List<Object>());
    }
    return plan;
  }

  public static void add(Map<String, Object> plan, String name, Object value) {
    ((List<Object>) plan.get(name)).add(value);
  }

  /** A new camp's week: Main, three blocks, Juniors (Bunks 1-2) and Seniors (Bunks 3-4). */
  public static Map<String, Object> newCamp(Id seasonId) {
    Map<String, Object> plan = emptyPlan(seasonId);
    add(
      plan,
      'programs',
      entry(
        new List<Object>{
          'key',
          'P0',
          'name',
          'Main',
          'days',
          WEEK,
          'sortOrder',
          1
        }
      )
    );
    List<List<String>> blocks = new List<List<String>>{
      new List<String>{ 'Period 1', '09:00', '09:45', 'Morning' },
      new List<String>{ 'Lunch', '12:00', '12:45', 'Afternoon' },
      new List<String>{ 'Period 2', '13:00', '13:45', 'Afternoon' }
    };
    for (Integer i = 0; i < blocks.size(); i++) {
      add(
        plan,
        'timeBlocks',
        entry(
          new List<Object>{
            'key',
            'B|P0|' + i,
            'programKey',
            'P0',
            'name',
            blocks[i][0],
            'start',
            blocks[i][1],
            'end',
            blocks[i][2],
            'partOfDay',
            blocks[i][3],
            'sortOrder',
            i + 1
          }
        )
      );
    }
    add(
      plan,
      'divisions',
      entry(
        new List<Object>{
          'key',
          'D|P0|Juniors',
          'programKey',
          'P0',
          'name',
          'Juniors',
          'sortOrder',
          1
        }
      )
    );
    add(
      plan,
      'divisions',
      entry(
        new List<Object>{
          'key',
          'D|P0|Seniors',
          'programKey',
          'P0',
          'name',
          'Seniors',
          'sortOrder',
          2
        }
      )
    );
    for (Integer i = 1; i <= 4; i++) {
      add(
        plan,
        'groups',
        entry(
          new List<Object>{
            'key',
            'G|Bunk ' + i,
            'divisionKey',
            i <= 2 ? 'D|P0|Juniors' : 'D|P0|Seniors',
            'name',
            'Bunk ' + i,
            'sortOrder',
            i
          }
        )
      );
    }
    add(
      plan,
      'locations',
      entry(
        new List<Object>{ 'key', 'L|Hall', 'name', 'Hall', 'groupsThatFit', 4 }
      )
    );
    add(
      plan,
      'activities',
      entry(
        new List<Object>{
          'key',
          'A|Swim',
          'name',
          'Swim',
          'length',
          1,
          'min',
          1,
          'max',
          2,
          'groupsAtOnce',
          2,
          'who',
          new List<Object>(),
          'sortOrder',
          1
        }
      )
    );
    add(
      plan,
      'activities',
      entry(
        new List<Object>{
          'key',
          'A|Boating',
          'name',
          'Boating',
          'length',
          1,
          'min',
          0,
          'max',
          1,
          'groupsAtOnce',
          1,
          'who',
          new List<Object>{ 'D|P0|Seniors' },
          'sortOrder',
          2
        }
      )
    );
    add(
      plan,
      'fixedActivities',
      entry(
        new List<Object>{
          'key',
          'F|P0|Lunch',
          'programKey',
          'P0',
          'name',
          'Lunch',
          'blockKey',
          'B|P0|1',
          'length',
          1,
          'locationKey',
          'L|Hall'
        }
      )
    );
    add(
      plan,
      'recurringActivities',
      entry(
        new List<Object>{
          'key',
          'R|P0|Library',
          'programKey',
          'P0',
          'name',
          'Library',
          'blockKey',
          'B|P0|2',
          'length',
          1,
          'days',
          new List<Object>{ 'Wednesday' },
          'who',
          new List<Object>{ 'D|P0|Juniors' }
        }
      )
    );
    return plan;
  }

  /** Monday of a week as last year's version: Swim, Lunch, and a Zoo trip not set up yet. */
  public static void addVersion(Map<String, Object> plan, Week__c week) {
    Map<String, Object> grid = new Map<String, Object>{
      'b' => new List<Object>{
        new List<Object>{ 'B|P0|0', 'Period 1', '09:00', '09:45' },
        new List<Object>{ 'B|P0|1', 'Lunch', '12:00', '12:45' },
        new List<Object>{ 'B|P0|2', 'Period 2', '13:00', '13:45' }
      },
      'g' => new List<Object>{
        new List<Object>{ 'G|Bunk 1', 'Bunk 1' },
        new List<Object>{ 'G|Bunk 2', 'Bunk 2' },
        new List<Object>{ 'G|Bunk 3', 'Bunk 3' },
        new List<Object>{ 'G|Bunk 4', 'Bunk 4' }
      },
      'i' => new List<Object>{
        new List<Object>{ 'A', 'A|Swim', 'Swim' },
        new List<Object>{ 'F', 'F|P0|Lunch', 'Lunch' },
        new List<Object>{ 'T', '', 'Zoo trip' }
      },
      'r' => new List<Object>{ '1,2,', '1,2,', ',2,3', ',2,3' }
    };
    add(
      plan,
      'versions',
      entry(
        new List<Object>{
          'programKey',
          'P0',
          'weekId',
          week.Id,
          'name',
          'Imported from maple-grove.xlsx',
          'days',
          new List<Object>{
            new Map<String, Object>{
              'date' => String.valueOf(week.StartDate__c),
              'grid' => grid
            }
          }
        }
      )
    );
  }
}
