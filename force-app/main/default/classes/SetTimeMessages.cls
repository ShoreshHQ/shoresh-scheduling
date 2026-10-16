/**
 * The refusal for a clash, in the camp's own words: what would go wrong, then how to fix it from
 * the side the change came from (the item itself, a location, a time block, or something else
 * such as a group or the program's days).
 */
public with sharing class SetTimeMessages {
  public enum Side {
    ITEM,
    LOCATION,
    TIME_BLOCK,
    OTHER
  }

  private final CampLabels t;
  private final SetTimeClash clash;

  private SetTimeMessages(SetTimeClash clash, CampLabels labels) {
    this.clash = clash;
    this.t = labels;
  }

  public static String of(SetTimeClash clash, CampLabels labels, Side origin) {
    SetTimeMessages words = new SetTimeMessages(clash, labels);
    return words.what() + ' ' + words.fix(origin);
  }

  private String what() {
    switch on clash.kind {
      when PAST_END {
        return quoted(clash.item.name) +
          ' takes ' +
          clash.item.length +
          ' ' +
          (clash.item.length == 1
            ? t.singularInSentence('TimeBlock')
            : t.pluralInSentence('TimeBlock')) +
          ', which would run past the last ' +
          t.singularInSentence('TimeBlock') +
          ' of ' +
          clash.item.program.program.Name +
          '.';
      }
      when CLOSED_DAY {
        return quoted(clash.item.name) +
          ' is ticked for ' +
          clash.day +
          ', but ' +
          clash.item.program.program.Name +
          ' does not run on ' +
          clash.day +
          's.';
      }
      when SAME_GROUP {
        return quoted(clash.other.name) +
          ' and ' +
          quoted(clash.item.name) +
          ' would both have ' +
          clash.groupName +
          moment() +
          '.';
      }
      when else {
        return crowdedLocation();
      }
    }
  }

  private String crowdedLocation() {
    List<String> names = new List<String>();
    for (String name : clash.names) {
      names.add(quoted(name));
    }
    Integer fits = clash.location.GroupsThatFit__c.intValue();
    return quoted(clash.location.Name) +
      ' fits ' +
      groups(fits) +
      ' at once, but ' +
      String.join(names, ' and ') +
      ' would have ' +
      clash.count +
      ' there' +
      moment() +
      '.';
  }

  /** " in Period 1 on Monday in Week 2" (no week when the season has none yet). */
  private String moment() {
    return ' in ' +
      clash.blockName +
      ' on ' +
      clash.day +
      (clash.weekName == null ? '' : ' in ' + clash.weekName);
  }

  private String fix(Side origin) {
    if (origin == Side.ITEM) {
      return itemFix();
    }
    if (
      origin == Side.LOCATION &&
      clash.kind == SetTimeClash.Kind.OVER_LOCATION
    ) {
      return 'Keep it at ' +
        clash.count +
        ' or more, or move ' +
        (clash.names.size() == 1 ? 'it' : 'one of them') +
        ' to another ' +
        t.singularInSentence('Location') +
        ' first.';
    }
    return 'Change ' +
      (clash.kind == SetTimeClash.Kind.SAME_GROUP ||
        clash.names.size() > 1
        ? 'one of them'
        : quoted(clash.item.name)) +
      ' first, then try again.';
  }

  private String itemFix() {
    switch on clash.kind {
      when PAST_END {
        return 'Shorten it, or choose an earlier ' +
          t.singularInSentence('TimeBlock') +
          '.';
      }
      when CLOSED_DAY {
        return 'Untick ' + clash.day + '.';
      }
      when SAME_GROUP {
        // Fixed activities have no days or who to change.
        Boolean bothFixed =
          clash.item.term == 'FixedActivity' &&
          clash.other.term == 'FixedActivity';
        return 'Change the ' +
          t.singularInSentence('TimeBlock') +
          ', ' +
          t.singularInSentence('Length') +
          (bothFixed ? ', or ' : ', days, who it covers, or ') +
          t.pluralInSentence('Week') +
          ' of one of them.';
      }
      when else {
        return 'Choose another ' +
          t.singularInSentence('Location') +
          ', or raise how many ' +
          t.pluralInSentence('Group') +
          ' fit at ' +
          quoted(clash.location.Name) +
          '.';
      }
    }
  }

  private String groups(Integer count) {
    return count +
      ' ' +
      (count == 1
        ? t.singularInSentence('Group')
        : t.pluralInSentence('Group'));
  }

  private static String quoted(String name) {
    return '"' + name + '"';
  }
}
