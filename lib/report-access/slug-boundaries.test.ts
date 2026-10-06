import { expect, it } from "vitest";
import { parseClaimBody } from "@/app/api/workspaces/claim/parse-body";
import { parseAuthFlow } from "@/lib/identity/sign-in-flow";

const valid = { claim_slug: "Ab_cd-12", workspace_name: "Fixture", primary_location: { name: "Fixture" }, market: "hk" };

it.each([" Ab_cd-12", "Ab_cd-12 ", "short", "a".repeat(65), "abc/def", "%252Fstaff"])("rejects malformed report identifiers consistently: %s", (claim) => {
  expect(parseAuthFlow(new URLSearchParams({ claim })).claim).toBeNull();
  expect(parseClaimBody({ ...valid, claim_slug: claim }).ok).toBe(false);
});

it("preserves case, underscore and hyphen when completing an already bound claim", () => {
  const result = parseClaimBody(valid);
  expect(result).toMatchObject({ ok: true, body: { claimSlug: "Ab_cd-12" } });
});
