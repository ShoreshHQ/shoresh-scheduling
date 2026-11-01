/**
 * read_electives_to_clear: what the Elective seats screen's end-of-season Clear shows before it
 * clears, through an agent or the command line (docs/protocol/api.md API-1.71). Web address
 * /v1/electives_to_clear, GET ?season=. It is the screen's own picture
 * (ElectiveSeatsController.clearPicture): each week's campers, choices, seats and runs, what is
 * still being worked on, and what stays for next summer, with the picture as read (seen, its
 * stamp).
 */
@RestResource(urlMapping='/v1/electives_to_clear')
global with sharing class AgentElectivesToClear {
  @HttpGet
  global static void get() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      AgentWeeks.requireScheduler();
      Season__c season = OutgoingRows.seasonCalled(
        RestContext.request.params.get('season')
      );
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => said(ElectiveSeatsController.clearPicture(season.Id))
          }
        )
      );
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => ours ? e.getMessage() : ScreenErrors.loadingWords(e)
          }
        )
      );
    }
  }

  /** The picture, in lines. */
  public static String said(ElectiveClear.Picture picture) {
    List<String> lines = new List<String>{
      picture.seasonName +
      ': ' +
      picture.campers +
      ' campers in all. seen: ' +
      picture.stamp
    };
    for (ElectiveClear.WeekCounts week : picture.weeks) {
      lines.add(
        '- ' +
          week.name +
          ': ' +
          week.campers +
          ' campers (' +
          week.campersOnlyHere +
          ' only this week), ' +
          week.choices +
          ' choices, ' +
          week.seats +
          ' seats, ' +
          week.runs +
          ' runs (' +
          week.finals +
          ' final)' +
          (week.working.isEmpty()
            ? ''
            : '; still being worked on: ' + String.join(week.working, ', '))
      );
    }
    lines.add(
      'Stays for next summer: elective sets ' +
        String.join(picture.sets, ', ') +
        '; offerings ' +
        String.join(picture.offerings, ', ') +
        (picture.linked.isEmpty()
          ? ''
          : '; linked choices ' + String.join(picture.linked, ', ')) +
        '.'
    );
    return String.join(lines, '\n');
  }
}
