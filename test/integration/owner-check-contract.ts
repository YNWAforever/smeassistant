import type { MerchantSeed } from "../e2e/seed";
export interface OwnerCheckTarget {
  app: string; mail: string;
  // Private in-process child environment only. Never serialized to evidence.
  ownerUrl: string; runtimeUrl: string;
  containerId: string; containerName: string; databaseName: string; imageId: string;
  a: MerchantSeed; b: MerchantSeed; managerInEmail: string;
  ownerId: string; managerInId: string;
  ids: Record<"v1" | "v2" | "secondAction" | "secondVersion" | "foreignVersion" | "assetA" | "assetB" | "retractAction" | "retractVersion" | "staleVersion", string>;
  evidencePath: string;
}
