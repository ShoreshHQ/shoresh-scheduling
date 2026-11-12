/**
 * The rules behind the camp's words (word walk W1), kept beside CampLabels: one English plural
 * for every standard word, and the words that follow one the camp set (CORE-1.34, CORE-1.35).
 */
public with sharing class CampWordRules {
  /**
   * The English plural, the one rule the screens use too (shoreshTerms guessPlural): "ies"
   * after a consonant and y, "es" after s, x, z, ch and sh, else "s".
   */
  public static String pluralOf(String singular) {
    String lower = singular.toLowerCase();
    if (lower.endsWith('y') && !Pattern.matches('.*[aeiou]y', lower)) {
      return singular.removeEnd('y') + 'ies';
    }
    if (Pattern.matches('.*(s|x|z|ch|sh)', lower)) {
      return singular + 'es';
    }
    return singular + 's';
  }

  /**
   * CORE-1.34: a word the camp left standard that follows a word it set: Elective set is the
   * camp's Elective words ("Chug" / "Chugim"); Groups that fit and Groups at once are its Group
   * plural ("Bunks that fit"). Null when the camp set this word itself, or the word it follows
   * is standard. custom: the camp's own words, by model term.
   */
  public static List<String> followed(
    Map<String, CampLabel__c> custom,
    String term
  ) {
    if (custom.containsKey(term)) {
      return null;
    }
    if (term == 'ElectiveSet' && custom.containsKey('Elective')) {
      CampLabel__c elective = custom.get('Elective');
      return new List<String>{ elective.Singular__c, elective.Plural__c };
    }
    Boolean ofGroups = term == 'GroupsThatFit' || term == 'GroupsAtOnce';
    if (ofGroups && custom.containsKey('Group')) {
      String word =
        custom.get('Group').Plural__c +
        (term == 'GroupsThatFit' ? ' that fit' : ' at once');
      return new List<String>{ word, word };
    }
    return null;
  }

  /**
   * "a time block", "an Edah", "an hour", "a Unit": the article a word takes by its sound, as the
   * screens' article() (shoreshTerms).
   */
  public static String withArticle(String word) {
    String lower = word.toLowerCase();
    Boolean vowelSound =
      Pattern.matches('(hour|honest|hono|heir).*', lower) ||
      (Pattern.matches('[aeiou].*', lower) &&
      !Pattern.matches('(uni|use|usu|uti|ure|one|once|eu|ewe).*', lower));
    return (vowelSound ? 'an ' : 'a ') + word;
  }
}
