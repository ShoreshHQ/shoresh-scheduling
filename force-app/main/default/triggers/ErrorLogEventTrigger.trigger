trigger ErrorLogEventTrigger on ErrorLogEvent__e(after insert) {
  ErrorCodes.write(Trigger.new);
}
