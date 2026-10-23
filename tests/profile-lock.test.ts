import { test } from "node:test";
import assert from "node:assert/strict";
import { reserveProfile } from "../electron/profile-lock.js";
test("application refuses duplicate profiles during startup and while running", () => {
  const live = new Map<string, unknown>();
  const opening = new Set<string>();
  reserveProfile("one", live, opening);
  assert.throws(() => reserveProfile("one", live, opening));
  reserveProfile("two", live, opening);
  opening.delete("one");
  live.set("one", {});
  assert.throws(() => reserveProfile("one", live, opening));
  live.delete("one");
  reserveProfile("one", live, opening);
  assert.equal(opening.has("one"), true);
});
