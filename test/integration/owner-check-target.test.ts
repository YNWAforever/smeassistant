import { describe, expect, it } from "vitest";
import { assertOwnerCheckTarget } from "./owner-check-target";
const fixture = { containerId: "owned-id", containerName: "sme-neon-it-db-owned", databaseName: "sme_neon_it_owned",
  databaseUrl: "postgresql://127.0.0.1:3101/sme_neon_it_owned", stop: () => undefined };
const inspect = () => ({ Id: "owned-id", Name: "/sme-neon-it-db-owned", Image: "sha256:owned-image",
  Config: { Labels: { "com.sme-scanner.integration": "neon-postgres", "com.sme-scanner.integration.database": "sme_neon_it_owned" } },
  HostConfig: { NetworkMode: "none", PortBindings: {}, Tmpfs: { "/var/lib/postgresql/data": "size=256m" } }, NetworkSettings: { Ports: {} } });
describe("owner check real DB target gate before clients", () => {
  it("accepts only the exact owned container, database, image and no-network relay", () => {
    expect(() => assertOwnerCheckTarget(fixture, inspect(), "sha256:owned-image")).not.toThrow();
  });
  it.each(["id", "name", "image", "database", "label", "network", "ports", "gateway", "storage"])("fails closed on %s drift", kind => {
    const value = inspect();
    if (kind === "id") value.Id = "another-container";
    if (kind === "name") value.Name = "/another";
    if (kind === "image") value.Image = "sha256:another";
    if (kind === "database") value.Config.Labels["com.sme-scanner.integration.database"] = "another-db";
    if (kind === "label") value.Config.Labels["com.sme-scanner.integration"] = "unowned";
    if (kind === "network") value.HostConfig.NetworkMode = "bridge";
    if (kind === "ports") value.HostConfig.PortBindings = { "5432/tcp": [{ HostPort: "5432" }] };
    if (kind === "storage") value.HostConfig.Tmpfs = {} as typeof value.HostConfig.Tmpfs;
    const target = kind === "gateway" ? { ...fixture, databaseUrl: "postgresql://unverified.invalid/sme_neon_it_owned" } : fixture;
    expect(() => assertOwnerCheckTarget(target, value, "sha256:owned-image")).toThrow();
  });
});
