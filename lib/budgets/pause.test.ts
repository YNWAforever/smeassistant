import { afterEach, describe, expect, it, vi } from "vitest";
import { PauseConfigurationError, logPauseRefusal, pauseState, readPauseConfig } from "./pause";

afterEach(() => vi.restoreAllMocks());

describe("readPauseConfig", () => {
  it("is off when unset or empty", () => {
    expect(readPauseConfig({})).toEqual({ scans: false, ai: false, mail: false });
    expect(readPauseConfig({ SCANS_PAUSED: "", AI_DRAFTS_PAUSED: "", MAIL_PAUSED: "" })).toEqual({
      scans: false,
      ai: false,
      mail: false,
    });
  });

  it("is on only for exactly 'true'", () => {
    expect(readPauseConfig({ SCANS_PAUSED: "true" })).toEqual({ scans: true, ai: false, mail: false });
    expect(readPauseConfig({ AI_DRAFTS_PAUSED: "true" })).toEqual({ scans: false, ai: true, mail: false });
    expect(readPauseConfig({ MAIL_PAUSED: "true" })).toEqual({ scans: false, ai: false, mail: true });
  });

  it("throws, naming the variable, for any other value", () => {
    for (const value of ["TRUE", "yes", "1", "false", " true"]) {
      expect(() => readPauseConfig({ SCANS_PAUSED: value })).toThrow(new PauseConfigurationError("SCANS_PAUSED"));
      expect(() => readPauseConfig({ AI_DRAFTS_PAUSED: value })).toThrow("pause_configuration_invalid: AI_DRAFTS_PAUSED");
      expect(() => readPauseConfig({ MAIL_PAUSED: value })).toThrow(new PauseConfigurationError("MAIL_PAUSED"));
    }
  });
});

describe("pauseState", () => {
  it("passes a valid configuration through", () => {
    expect(pauseState({ SCANS_PAUSED: "true" })).toEqual({ scans: true, ai: false, mail: false });
  });

  it("fails closed: an invalid value pauses every switch, and is logged with the variable", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(pauseState({ AI_DRAFTS_PAUSED: "yes" })).toEqual({ scans: true, ai: true, mail: true });
    expect(error).toHaveBeenCalledWith("[pause] configuration_invalid", { variable: "AI_DRAFTS_PAUSED" });
  });

  it("fails closed on an invalid MAIL_PAUSED value too", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(pauseState({ MAIL_PAUSED: "yes" })).toEqual({ scans: true, ai: true, mail: true });
    expect(error).toHaveBeenCalledWith("[pause] configuration_invalid", { variable: "MAIL_PAUSED" });
  });
});

describe("logPauseRefusal", () => {
  it("writes one fixed line", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logPauseRefusal("scan_start");
    expect(warn).toHaveBeenCalledWith("[pause] refused", { entry: "scan_start" });
  });
});
