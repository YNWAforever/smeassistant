import { describe, expect, it } from "vitest";

import { BUDGET_VARIABLES, BudgetConfigurationError, readBudgetConfig } from "./config";

describe("readBudgetConfig", () => {
  it("applies the conservative global defaults and leaves per-workspace limits off", () => {
    expect(readBudgetConfig({})).toEqual({
      scanAttemptsGlobal24h: 200,
      scanAttemptsWorkspace24h: null,
      aiUsdGlobal24h: 20,
      aiUsdWorkspace24h: null,
    });
  });

  it("turns any limit off with the literal off", () => {
    expect(
      readBudgetConfig({
        BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off",
        BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "off",
        BUDGET_AI_USD_GLOBAL_24H: "off",
        BUDGET_AI_USD_WORKSPACE_24H: "off",
      }),
    ).toEqual({ scanAttemptsGlobal24h: null, scanAttemptsWorkspace24h: null, aiUsdGlobal24h: null, aiUsdWorkspace24h: null });
  });

  it("reads positive integer scan limits and positive decimal AI limits", () => {
    expect(
      readBudgetConfig({
        BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "350",
        BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H: "12",
        BUDGET_AI_USD_GLOBAL_24H: "7.5",
        BUDGET_AI_USD_WORKSPACE_24H: "0.25",
      }),
    ).toEqual({ scanAttemptsGlobal24h: 350, scanAttemptsWorkspace24h: 12, aiUsdGlobal24h: 7.5, aiUsdWorkspace24h: 0.25 });
    expect(readBudgetConfig({ BUDGET_AI_USD_GLOBAL_24H: "40" }).aiUsdGlobal24h).toBe(40);
  });

  it.each([
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "0"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "-5"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "2.5"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "ten"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", ""],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", " 5"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "OFF"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "1e3"],
    ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "99999999999999999999"],
    ["BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H", "0"],
    ["BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H", ""],
    ["BUDGET_AI_USD_GLOBAL_24H", "0"],
    ["BUDGET_AI_USD_GLOBAL_24H", "0.00"],
    ["BUDGET_AI_USD_GLOBAL_24H", "-1"],
    ["BUDGET_AI_USD_GLOBAL_24H", "$20"],
    ["BUDGET_AI_USD_GLOBAL_24H", ""],
    ["BUDGET_AI_USD_GLOBAL_24H", "Infinity"],
    ["BUDGET_AI_USD_GLOBAL_24H", "1."],
    ["BUDGET_AI_USD_WORKSPACE_24H", "0"],
    ["BUDGET_AI_USD_WORKSPACE_24H", "abc"],
  ] as const)("rejects %s=%j with a coded error that names only the variable", (variable, value) => {
    let thrown: unknown;
    try {
      readBudgetConfig({ [variable]: value });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BudgetConfigurationError);
    expect((thrown as BudgetConfigurationError).code).toBe("budget_configuration_invalid");
    expect((thrown as BudgetConfigurationError).variable).toBe(variable);
    expect((thrown as Error).message).toBe(`budget_configuration_invalid: ${variable}`);
  });

  it("names exactly the four documented variables", () => {
    expect([...BUDGET_VARIABLES]).toEqual([
      "BUDGET_SCAN_ATTEMPTS_GLOBAL_24H",
      "BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H",
      "BUDGET_AI_USD_GLOBAL_24H",
      "BUDGET_AI_USD_WORKSPACE_24H",
    ]);
  });
});
