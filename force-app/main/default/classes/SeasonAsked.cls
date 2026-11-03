/**
 * The season an AI request asked for, for an answer refused before it found one (API-1.108):
 * OutgoingRows.answered and said use it when the request hadn't looked its season up yet.
 */
public with sharing class SeasonAsked {
  /**
   * The season this request asked for, when it was refused before finding it: the one named, if
   * it is there, or the one the screens open on. Null when it can't be told (API-1.108).
   */
  public static Season__c found() {
    RestRequest request = RestContext.request;
    if (request == null) {
      return null;
    }
    try {
      String name = request.params?.get('season');
      if (
        name == null &&
        request.requestBody != null &&
        request.requestBody.size() > 0
      ) {
        Object body = JSON.deserializeUntyped(request.requestBody.toString());
        if (body instanceof Map<String, Object>) {
          Object named = ((Map<String, Object>) body).get('season');
          name = named instanceof String ? (String) named : null;
        }
      }
      return OutgoingRows.seasonCalled(name);
    } catch (Exception e) {
      return null; // no season can be said: the answer stands without one
    }
  }
}
