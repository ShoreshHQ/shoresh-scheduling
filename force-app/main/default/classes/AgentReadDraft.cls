/**
 * read: a program's Generated Schedule or Manual Build week as that screen has it now, its draft
 * (not the published week), as the person, through an agent or the command line
 * (docs/protocol/api.md API-1.123). Web address /v1/read_week_draft, GET
 * ?season=&week=&program=&schedule=. It answers exactly what the week's checks read
 * (AgentChecks, the screen's own reads), so the connector lays out the cells, locks, special days
 * and counter from the same week the screen opens, with the screens' own modules.
 */
@RestResource(urlMapping='/v1/read_week_draft')
global with sharing class AgentReadDraft {
  @HttpGet
  global static void get() {
    AgentChecks.respond('draft');
  }
}
