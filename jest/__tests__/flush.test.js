// jest/flush.js: one flush lets a chain of promise turns finish; until() waits, and fails loudly.
import { flush, until } from "shoresh-jest/flush";

it("lets an answer, its handling and the re-render after it all happen", async () => {
  let done = false;
  let chain = Promise.resolve();
  for (let turn = 0; turn < 19; turn++) {
    chain = chain.then(() => undefined);
  }
  chain.then(() => {
    done = true;
  });
  await flush();
  expect(done).toBe(true);
});

it("until() returns once done() says yes, including after work queued as a task", async () => {
  let ready = false;
  setTimeout(() => {
    ready = true;
  }, 0);
  await until(() => ready);
  expect(ready).toBe(true);
});

it("until() throws when done() never says yes", async () => {
  await expect(until(() => false, 3)).rejects.toThrow(
    "still waiting after 3 tries"
  );
});
