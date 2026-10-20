const { scan, scanSources } = require("../apex-aura-inputs");

const found = (files) =>
  Object.entries(scanSources(files)).flatMap(([rel, hits]) =>
    hits.map((h) => `${rel} ${h.name} @${h.line}`)
  );

// SetupMatch.Ask as it was on 2026-10-20: plain fields, so every update arrived with no
// revisions and was refused as "Someone else changed this week since".
const CONTROLLER = {
  rel: "SetupMatchController.cls",
  source: `public with sharing class SetupMatchController {
    @AuraEnabled
    public static SetupMatch.Updated updateToMatchSetup(Id scheduleId, SetupMatch.Ask ask) {
      return SetupMatch.make(scheduleId, ask);
    }
  }`
};
const askWith = (members) => ({
  rel: "SetupMatch.cls",
  source: `public with sharing class SetupMatch {
    public class Ask {
${members}
    }
    // Only sent back to the screen: plain fields serialize.
    public class Updated {
      @AuraEnabled
      public String refused;
    }
  }`
});

describe("Lightning-input check", () => {
  it("finds the plain fields of a class a screen sends (SetupMatch.Ask, 2026-10-20)", () => {
    expect(
      found([
        CONTROLLER,
        askWith(`      @AuraEnabled
      public List<String> keys;
      @AuraEnabled
      public String seenRevisions;
      @AuraEnabled
      public Boolean versionKept = false;`)
      ])
    ).toEqual([
      "SetupMatch.cls SetupMatch.Ask.keys @4",
      "SetupMatch.cls SetupMatch.Ask.seenRevisions @6",
      "SetupMatch.cls SetupMatch.Ask.versionKept @8"
    ]);
  });

  it("passes properties, and what is only sent back", () => {
    expect(
      found([
        CONTROLLER,
        askWith(`      @AuraEnabled
      public List<String> keys { get; set; }
      @AuraEnabled
      public String seenRevisions { get; set; }`)
      ])
    ).toEqual([]);
  });

  it("follows lists and the classes a sent class holds, and its own inner names", () => {
    expect(
      found([
        {
          rel: "Edits.cls",
          source: `public class Edits {
            @AuraEnabled(cacheable=false)
            public static void save(Id scheduleId, List<Edit> edits) {}
            public class Edit {
              @AuraEnabled
              public List<Run> runs { get; set; }
            }
            public class Run {
              @AuraEnabled
              public Date day;
            }
          }`
        }
      ])
    ).toEqual(["Edits.cls Edits.Run.day @10"]);
  });

  it("lets a field the server never reads say so", () => {
    expect(
      found([
        CONTROLLER,
        askWith(`      // apex-aura-inputs-ok: shown to the screen only; never read back.
      @AuraEnabled
      public Boolean isCustom;`)
      ])
    ).toEqual([]);
  });

  it("finds nothing in this repository", () => {
    expect(scan()).toEqual({});
  });
});
