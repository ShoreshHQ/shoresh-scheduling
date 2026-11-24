/**
 * A screen's request as Apex reads it: one that comes incomplete or unreadable is refused as
 * "The seats could not be sent. Try again.", with a support code keeping the detail (ErrorCodes,
 * CORE-6.15).
 */
public with sharing class ScreenRequests {
  /** The refusal for a request that can't be used. what: "The seats", "That change". */
  public static ShoreshException notSent(String what, String detail) {
    return new ShoreshException(
      ErrorCodes.said(what + ' could not be sent. Try again.', detail)
    );
  }

  /** The request read as its kind; one that can't be read is notSent(what). */
  public static Object parsed(String request, System.Type kind, String what) {
    try {
      return JSON.deserialize(request, kind);
    } catch (Exception e) {
      throw notSent(what, ErrorCodes.detailOf(e));
    }
  }
}
