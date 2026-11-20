/**
 * WeekTickets, the week's ticket (ADR 0005 §9): its stamp, each named rule for a ticket that is
 * missing, blank, empty, different or the same, and the ticket a write leaves. The write is on
 * GeneratedTestData's synthetic camp.
 */
@IsTest
private class WeekTicketsTest {
  private static final String WEEK = '2026-06-29:3,2026-06-30:1';

  private static ScheduleDays.DayGrid dayAt(Date dateValue, Integer revision) {
    ScheduleDays.DayGrid read = new ScheduleDays.DayGrid();
    read.day = dateValue;
    read.revision = revision;
    return read;
  }

  @IsTest
  static void theStampIsEachDaysRevisionInOrder() {
    Assert.areEqual(
      WEEK,
      WeekTickets.stamp(
        new List<ScheduleDays.DayGrid>{
          dayAt(Date.newInstance(2026, 6, 29), 3),
          dayAt(Date.newInstance(2026, 6, 30), 1)
        }
      )
    );
    Assert.areEqual('', WeekTickets.stamp(new List<ScheduleDays.DayGrid>()));
  }

  @IsTest
  static void blankNeverIsAsSeenOnlyWithTheExactTicket() {
    Assert.isTrue(WeekTickets.seenBlankNever(WEEK, WEEK), 'match');
    Assert.isFalse(WeekTickets.seenBlankNever(WEEK, WEEK + '1'), 'mismatch');
    Assert.isFalse(WeekTickets.seenBlankNever(WEEK, null), 'null');
    Assert.isFalse(WeekTickets.seenBlankNever('', ''), 'empty, on no days');
    Assert.isFalse(WeekTickets.seenBlankNever('', ' '), 'blank, on no days');
    Assert.isFalse(WeekTickets.seenBlankNever('', null), 'null, on no days');
  }

  @IsTest
  static void nullAsEmptyReadsNoTicketAsAWeekWithNoDays() {
    Assert.isTrue(WeekTickets.seenNullAsEmpty(WEEK, WEEK), 'match');
    Assert.isFalse(WeekTickets.seenNullAsEmpty(WEEK, WEEK + '1'), 'mismatch');
    Assert.isFalse(WeekTickets.seenNullAsEmpty(WEEK, null), 'null');
    Assert.isFalse(WeekTickets.seenNullAsEmpty(WEEK, ''), 'empty');
    Assert.isTrue(WeekTickets.seenNullAsEmpty('', ''), 'empty, on no days');
    Assert.isTrue(WeekTickets.seenNullAsEmpty('', null), 'null, on no days');
    Assert.isFalse(WeekTickets.seenNullAsEmpty('', ' '), 'blank, on no days');
    Assert.isFalse(
      WeekTickets.seenNullAsEmpty('2026-06-29:null', '2026-06-29:NULL'),
      'capitals count'
    );
  }

  @IsTest
  static void nullNeverTakesEmptyAsAWeekWithNoDays() {
    Assert.isTrue(WeekTickets.seenNullNever(WEEK, WEEK), 'match');
    Assert.isFalse(WeekTickets.seenNullNever(WEEK, WEEK + '1'), 'mismatch');
    Assert.isFalse(WeekTickets.seenNullNever(WEEK, null), 'null');
    Assert.isFalse(WeekTickets.seenNullNever(WEEK, ''), 'empty');
    Assert.isTrue(WeekTickets.seenNullNever('', ''), 'empty, on no days');
    Assert.isFalse(WeekTickets.seenNullNever('', null), 'null, on no days');
    Assert.isFalse(WeekTickets.seenNullNever('', ' '), 'blank, on no days');
    Assert.isTrue(
      WeekTickets.seenNullNever('2026-06-29:null', '2026-06-29:NULL'),
      'capitals ignored'
    );
  }

  @IsTest
  static void nullSkipsDoesNotCheckAnUnknownTicket() {
    Assert.isTrue(WeekTickets.seenNullSkips(WEEK, WEEK), 'match');
    Assert.isFalse(WeekTickets.seenNullSkips(WEEK, WEEK + '1'), 'mismatch');
    Assert.isTrue(WeekTickets.seenNullSkips(WEEK, null), 'null');
    Assert.isFalse(WeekTickets.seenNullSkips(WEEK, ''), 'empty');
    Assert.isTrue(WeekTickets.seenNullSkips('', ''), 'empty, on no days');
    Assert.isFalse(WeekTickets.seenNullSkips('', ' '), 'blank, on no days');
  }

  @IsTest
  static void afterWriteTakesTheWrittenRevisionsAndKeepsTheRest() {
    List<ScheduleDays.DayGrid> read = new List<ScheduleDays.DayGrid>{
      dayAt(Date.newInstance(2026, 6, 29), 3),
      dayAt(Date.newInstance(2026, 6, 30), 1),
      dayAt(Date.newInstance(2026, 7, 1), null)
    };
    Assert.areEqual(
      '2026-06-29:3,2026-06-30:2,2026-07-01:1',
      WeekTickets.afterWrite(
        read,
        new Map<Date, Integer>{
          Date.newInstance(2026, 6, 30) => 2,
          Date.newInstance(2026, 7, 1) => 1
        }
      )
    );
    Assert.areEqual(
      WeekTickets.stamp(read),
      WeekTickets.afterWrite(read, new Map<Date, Integer>()),
      'Nothing written'
    );
  }

  // The ticket a write leaves is the one the week is then read at, without reading it again.
  @IsTest
  static void theTicketAfterADayWriteIsTheWeekAsReadAgain() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      List<ScheduleDays.DayGrid> read = ScheduleDays.read(draftId);
      String was = WeekTickets.stamp(read);
      Test.startTest();
      Map<Date, Integer> written = ScheduleDaySaves.write(
        draftId,
        new List<ScheduleDaySaves.DaySave>{
          new ScheduleDaySaves.DaySave(
            read[1].day,
            read[1].grid,
            read[1].revision
          )
        }
      );
      String left = WeekTickets.afterWrite(read, written);
      Test.stopTest();
      Assert.areEqual(
        new Map<Date, Integer>{ read[1].day => read[1].revision + 1 },
        written
      );
      Assert.areNotEqual(was, left);
      Assert.areEqual(WeekTickets.stamp(ScheduleDays.read(draftId)), left);
    }
  }
}
