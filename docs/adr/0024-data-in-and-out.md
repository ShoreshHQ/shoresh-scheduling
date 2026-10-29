# 0024: Data in and out (the Shoresh API)

Status: proposed (2026-10-29). Product decision: Greg, 2026-10-29 (wiki `projects/shoresh-api.md`,
"Greg's answers"; wiki decision 0009, "Data moves in and out freely"). The rules are numbered in
[docs/protocol/api.md](../protocol/api.md) (API-n.m). Nothing is built yet.

## Why

Camps run other software and should be free to (decision 0009). Most camp software lets data out
but blocks data in, to push camps onto the rest of the vendor's products. Shoresh does neither: data
comes in and goes out equally, to Salesforce or any other system.

Greg's reason for the plain-English rule: SaaS made simple things sound complex; Shoresh
deliberately doesn't. Every name, field, message, key and permission says what it does (API-1.5).

## Choices

1. **What comes in:** `division`, `group`, `activity`, `camper`, `camper_group` (which bunk, which
   weeks), `camper_elective_choice`.
2. **What goes out:** `send_group_schedule_to_<system>`, `send_activity_schedule_to_<system>`,
   `send_elective_offerings_to_<system>` (so a form can collect choices) and
   `send_elective_seats_to_<system>` (on Finalize only). No per-camper schedule: campers are in
   bunks, and another system can translate. `<system>` is the name the camp gives its destination.
3. **Three doors, one logic.** Each of these is one piece of code reached by a Flow action (inside
   Salesforce), a web address with a key (outside systems), and a CSV file (half the market only
   has files). Web addresses are `/v1/<plain_name>`; Salesforce puts the package's namespace in front
   (`/services/apexrest/<namespace>/v1/camper_elective_choice`).
4. **Who owns what.** Camper name and bunk belong to the outside system and are not edited in
   Shoresh (until Shoresh does bunking). Schedules, offerings and seats belong to Shoresh. Each side
   sends only what it owns.
5. **Same camper, always.** Shoresh stores each camper's outside ID beside the name of the system it
   came from, and matches on that, never on name or bunk. A fixed misspelling or a bunk move updates
   the same camper; Shoresh's own IDs never change and outside systems never need them. With no
   outside ID, Shoresh matches the way the import does and asks when in doubt.
6. **An incoming batch is an import.** It updates only what an earlier import made and nobody
   changed, and can be undone. A person's change, hand placement or lock always wins; the incoming
   value is kept beside it and shown. Nothing is deleted from outside: withdrawn means hidden but
   kept. Sending the same batch twice does nothing the second time; an older update than the last
   one accepted is ignored and logged.
7. **Disagreements are flags.** When Shoresh and an outside system, or two outside systems,
   disagree, a person sees a flag to fix it. Shoresh never settles it.
8. **Keys.** Separate read and write keys, both now. Access is split finely: one permission set per
   capability and direction ("Read activity schedules", "Send elective choices"), which a camp
   combines however it likes. MCP and the command line get the same model later.
9. **Stays inside:** drafts, versions, conflicts, parent comments, family and medical details.
10. **Fixed at the first released package (cannot be undone):** the address shape `/v1/<plain_name>`
    and the camper outside-ID and source-system fields. Salesforce does not let a released package
    remove a public web address or a field.

## How an outside system gets a key (Salesforce facts checked 2026-10-29)

The camp creates a Salesforce Integration user (API only, no person signs in as it), gives it the
Shoresh permission sets it should have, and creates an External Client App that signs in as that user
with the "client credentials" flow (a client ID and secret, which is the key). Whatever the user's
permission sets allow is all the key can do.

| Fact                                                                                                                                                      | Checked                                                                    | Source                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A managed package's REST address carries its namespace: `/services/apexrest/<ns>/<url>`                                                                   | yes (official doc, via search excerpt)                                     | https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_annotation_rest_resource.htm                                                                                |
| External Client Apps support the client credentials flow with a "Run As" user, whose permissions decide access                                            | yes                                                                        | https://developer.salesforce.com/docs/industries/loyalty/guide/authorization.html, https://developer.salesforce.com/blogs/2023/03/using-the-client-credentials-flow-for-easier-api-authentication |
| External Client Apps can be shipped only in second-generation managed packages; new Connected Apps are being restricted                                   | partly (Trailhead; restriction dates from third-party blogs only)          | https://trailhead.salesforce.com/content/learn/modules/external-client-app-basics/package-and-distribute-external-client-apps                                                                     |
| API access is included in Enterprise, Unlimited, Performance and Developer; Professional needs a paid add-on                                              | yes                                                                        | https://developer.salesforce.com/docs/platform/api-rest/guide/intro-rest-compatible-editions.html                                                                                                 |
| Integration user licence comes with the "Salesforce API Integration" permission set licence; a permission set with no licence can be assigned to any user | partly (vendor guides, not a Salesforce page)                              | https://help.salesforce.com/s/articleView?id=sf.integration_user.htm (not fetched)                                                                                                                |
| A Shoresh package permission set can be assigned to an Integration user                                                                                   | **not confirmed**: must be tried in the test org before release            | none found                                                                                                                                                                                        |
| Up to 25 External ID (or unique) fields per object by default; upsert by External ID inserts on no match, updates on one, errors on several               | yes (limit); upsert behaviour from Apex docs not re-fetched                | https://help.salesforce.com/apex/HTViewSolution?id=000005081                                                                                                                                      |
| Callouts should use Named Credentials / External Credentials (Salesforce handles sign-in; legacy Named Credentials are deprecated)                        | yes                                                                        | https://developer.salesforce.com/docs/platform/named-credentials/guide/get-started.html                                                                                                           |
| Security review requires no stored secrets and Named Credentials for callouts                                                                             | **not confirmed** from the official checklist (only third-party summaries) | https://developer.salesforce.com/page/Security                                                                                                                                                    |

Docs pages on developer.salesforce.com refused direct fetching; "yes" above means the official page's
text was confirmed through search excerpts.

## Not decided here

How a camp names and saves a destination; whether a send is a notice plus a link to fetch, or the
whole schedule; retries. These come with the build.
