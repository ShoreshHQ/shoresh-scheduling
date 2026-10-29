/**
 * What happened to one incoming record (docs/protocol/api.md API-6.3): saved, unchanged or a
 * problem, and one plain sentence saying what or why. The same for a Flow action and a web address.
 */
global with sharing class IncomingResult {
  @InvocableVariable(
    label='row'
    description='Which record of the batch this is about, counting from 1.'
  )
  global Integer row;

  @InvocableVariable(label='result' description='saved, unchanged or problem.')
  global String result;

  @InvocableVariable(
    label='message'
    description='One sentence saying what was done, or why not.'
  )
  global String message;
}
