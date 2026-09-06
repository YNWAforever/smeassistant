import type { ScanProcessorDependencies } from "./processor";
/** Storage ports owned by the host application, never constructed by the engine. */
export type ScanExecutionStore = Pick<
  ScanProcessorDependencies,
  "claimJob" | "persist" | "fail"
> & {
  setStage: NonNullable<ScanProcessorDependencies["setStage"]>;
  recordTerminal: NonNullable<ScanProcessorDependencies["recordTerminal"]>;
};
