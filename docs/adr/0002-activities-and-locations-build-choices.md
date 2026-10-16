# 0002: Activities and locations, build choices

Status: accepted (2026-10-16). Design source: wiki `projects/shoresh-scheduling-data-model`
("Activities and places"), `projects/shoresh-scheduling-sf` (slice 2, Greg's answers of
2026-10-16), and `decisions/0001` to `0008`.

## Choices

1. **Location types are a list each camp makes up** (Greg, 2026-10-16): `LocationType__c`, a
   detail of the season with a unique name per season (hidden key, like weeks). Locations point
   at a type with a lookup that clears when the type is deleted. Types only organize; they never
   affect scheduling. This replaces the data model's undefined `Kind__c`. For now the locations
   table is listed by type; a filter by type is not built yet (it may come with the camp map).
2. **Rain plan is a clear-on-delete lookup**, not restrict-delete: Salesforce does not allow
   restrict-delete on a lookup from an object to itself. The setup screens still refuse to delete
   an activity that is another's rain plan and say which; deleting it elsewhere clears the rain
   plan, and the outdoor activity then shows in Needs attention.
3. **An activity cannot be its own rain plan.** Salesforce refuses that before validation rules
   or triggers run, with a "Hierarchy Constraint Violation" message, so the activity table never
   offers a row's own activity, and the server refuses it in plain words before saving.
4. **Who can do it is saved as a whole list**, together with the "more rules", all or none
   (`ActivitiesController.saveActivityDetails`). An empty list means every group. The panel only
   changes the rule fields (same division only, early week, events only, notes).
5. **Deleting a season deletes its activities first.** Activities point at the season's
   locations, divisions, and groups through restrict-delete lookups, which would otherwise block
   the season's own delete (platform check (a)). Who-can-do-it rows go with their activities.
6. **Needs attention** gains two nudges (Greg, 2026-10-16): an outdoor activity with no rain
   plan, and an activity allowing more groups at once than its location fits. The smaller number
   is what the schedule builder will use; nothing is blocked.
7. **Defaults for a new activity** (length 1, 1 to 1 times a week, Low, indoors, one group at a
   time) are field defaults as well as screen defaults, so Salesforce's own new-record page
   matches. Import (a later piece) never relies on them.
8. **The camp map fields (`MapX__c`, `MapY__c`) are not added yet.** They come with the map
   piece; adding fields after release is allowed.
9. **"Location type" is a model term**, so camps can relabel it like any other.
10. **Choices that are hard to undo after release:** `Priority__c` values High and Low;
    `EarlyWeekByDay__c` values Monday to Friday; who-can-do-it records are auto-numbered (they
    have no name of their own); `Notes__c` are long text on locations and activities.
11. **A refused save names the row** ('"Art": Must be 1 or more, or tick No limit.'), since a
    table save can include many rows and validation rules cannot name the record themselves.
    Validation messages avoid quotation marks: Salesforce returns them as `&quot;`.
12. **Switching activities in the details panel with unsaved changes asks first** before
    discarding them.
