/**
 * A camper's parent comments (decision 48.3): kept word for word, and a sheet's added to what is
 * saved without losing or repeating anything.
 */
public with sharing class ParentComments {
  /**
   * The saved comment with the sheet's added: a blank never erases, the same words are not
   * added twice, and new words go on a line of their own after what was there.
   */
  public static String joined(String saved, String sheet) {
    String given = sheet == null ? '' : sheet.trim();
    if (given == '') {
      return saved;
    }
    if (String.isBlank(saved)) {
      return given.left(32768);
    }
    if (saved.contains(given)) {
      return saved;
    }
    return (saved + '\n' + given).left(32768);
  }
}
