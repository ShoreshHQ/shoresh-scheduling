/**
 * What one outgoing send did (docs/protocol/api.md API-6.3): sent, or why not, in one plain
 * sentence. The same sentence shows on Settings when a send fails.
 */
global with sharing class OutgoingResult {
  @InvocableVariable(
    label='sent'
    description='true when it is on its way. If the destination does not take it, Settings shows why.'
  )
  global Boolean sent = false;

  @InvocableVariable(
    label='message'
    description='One sentence saying what was sent, or why it was not.'
  )
  global String message;
}
