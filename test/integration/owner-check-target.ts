import { assertOwnedPostgresContainer, type NeonDatabaseFixture } from "./neon-database";

export interface FixtureInspection {
  Id: string;
  Name: string;
  Image: string;
  Config: { Labels: Record<string, string> };
  HostConfig: { NetworkMode: string; PortBindings: Record<string, unknown> | null; Tmpfs?: Record<string, string> };
  NetworkSettings: { Ports: Record<string, unknown> };
  Mounts?: Array<{ Type: string }>;
}
export function assertOwnerCheckTarget(fixture: NeonDatabaseFixture, actual: FixtureInspection, imageId: string) {
  assertOwnedPostgresContainer(fixture.containerId, { id: actual.Id, labels: actual.Config.Labels }, {
    databaseUrl: fixture.databaseUrl, databaseName: fixture.databaseName,
    containerLabels: actual.Config.Labels, nodeEnv: "test",
  });
  if (actual.Name !== `/${fixture.containerName}` || actual.Image !== imageId ||
    actual.HostConfig.NetworkMode !== "none" ||
    Object.keys(actual.HostConfig.PortBindings ?? {}).length ||
    Object.values(actual.NetworkSettings.Ports ?? {}).some(value => value !== null) ||
    !actual.HostConfig.Tmpfs?.["/var/lib/postgresql/data"] ||
    actual.Mounts?.some(mount => mount.Type !== "tmpfs")) {
    throw new Error("unsafe_owner_check_fixture");
  }
}
