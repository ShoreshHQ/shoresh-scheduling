/**
 * Roots' table (repo ADR 0020): one request for what its cards draw beyond the season's setup.
 */
public with sharing class RootsController {
  @AuraEnabled
  public static RootsTable.Table getTable(Id seasonId) {
    try {
      RootsTable.Table table = RootsTable.read(seasonId);
      table.noted = RootsNoted.read(seasonId);
      return table;
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }
}
