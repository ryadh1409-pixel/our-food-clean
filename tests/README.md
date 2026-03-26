# Integration tests

## Order flow test

`orderFlow.test.ts` verifies the create-and-join order flow using the **Firestore emulator**.

### Run with emulator

1. Start the Firestore emulator (in a separate terminal):

   ```bash
   firebase emulators:start --only firestore
   ```

2. Run tests:

   ```bash
   npm test
   ```

### What the test does

1. **User A** creates an order in the `orders` collection with `status: "open"`, `participantIds: [userA]`, `maxPeople: 3`.
2. Fetches the order from Firestore and asserts initial state.
3. **User B** joins using the same transaction logic as `joinOrderWithTransaction` (status must be `"open"`, then `arrayUnion(userB)` and status stays `"open"` until full).
4. Asserts: `participantIds.length === 2`, both users included, `status === "open"` (since 2 < 3).

If the emulator is not running, the test fails after ~8s with a message asking you to start it.
