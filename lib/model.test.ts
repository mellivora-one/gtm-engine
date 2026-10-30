import test from "node:test";
import assert from "node:assert/strict";
import {
  draftWorkspace,
  emptyWorkspace,
  exampleWorkspace,
  exportPlan,
  isPersonalLinkedIn,
  normalizeUrl,
  restoreWorkspace,
} from "./model.ts";

test("example flow preserves editable data and exports an honest search plan", () => {
  const draft = draftWorkspace(structuredClone(exampleWorkspace));
  const confirmed = {
    ...draft,
    productConfirmed: true,
    customersConfirmed: true,
  };
  const restored = restoreWorkspace(JSON.parse(JSON.stringify(confirmed)));
  assert.equal(restored.product.name, "AI Support Assistant");
  assert.equal(restored.customersConfirmed, true);
  assert.equal(exportPlan(restored).liveResearchPerformed, false);
  assert.equal(exportPlan(restored).messagesSent, 0);
});

test("input validation and manual mode do not fabricate website research", () => {
  assert.throws(() => draftWorkspace(structuredClone(emptyWorkspace)));
  assert.throws(() => normalizeUrl("javascript:alert(1)"));
  assert.throws(() => normalizeUrl("https://user:password@example.com"));
  assert.equal(normalizeUrl("example.com"), "https://example.com/");
  assert.equal(isPersonalLinkedIn("https://www.linkedin.com/in/founder"), true);
  assert.equal(
    isPersonalLinkedIn("https://linkedin.com.evil.example/in/founder"),
    false,
  );
  const draft = draftWorkspace({
    ...structuredClone(emptyWorkspace),
    intake: { description: "Our inventory app", url: "https://example.com" },
  });
  assert.equal(draft.product.description, "Our inventory app");
  assert.equal(draft.product.name, "");
  assert.equal(draft.profile.industry, "");
});

test("malformed storage cannot unlock incomplete steps", () => {
  assert.deepEqual(restoreWorkspace(null), emptyWorkspace);
  const state = restoreWorkspace({
    version: 1,
    productConfirmed: true,
    customersConfirmed: true,
    product: { name: 123 },
    profile: { roles: [123] },
  });
  assert.equal(state.productConfirmed, false);
  assert.equal(state.customersConfirmed, false);
  assert.deepEqual(state.profile.roles, []);
});
