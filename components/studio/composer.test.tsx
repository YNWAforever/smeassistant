// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { StudioComposer } from "./composer";

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = true;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }
}

function windowWithSpeech() {
  return window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
}

function Harness({ locale = "en" as const }: { locale?: "en" | "zh-HK" | "zh-TW" }) {
  const [value, setValue] = useState("");
  return (
    <StudioComposer
      locale={locale}
      value={value}
      onChange={setValue}
      onSend={vi.fn()}
      onStop={vi.fn()}
      streaming={false}
    />
  );
}

function emitFinal(instance: FakeSpeechRecognition, transcript: string) {
  act(() => {
    instance.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, 0: { transcript } } },
    });
  });
}

beforeEach(() => {
  FakeSpeechRecognition.instances = [];
  windowWithSpeech().SpeechRecognition = FakeSpeechRecognition;
});

afterEach(() => {
  cleanup();
  delete windowWithSpeech().SpeechRecognition;
  delete windowWithSpeech().webkitSpeechRecognition;
});

describe("StudioComposer dictation", () => {
  it("hides the microphone where the Web Speech API is unavailable", () => {
    delete windowWithSpeech().SpeechRecognition;
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Dictate" })).toBeNull();
  });

  it("appends final dictation to the draft and stops on demand", async () => {
    render(<Harness />);
    const mic = await screen.findByRole("button", { name: "Dictate" });
    fireEvent.click(mic);

    const instance = FakeSpeechRecognition.instances[0];
    expect(instance.start).toHaveBeenCalledOnce();
    expect(instance.lang).toBe("en-US");
    expect(instance.continuous).toBe(true);
    expect(instance.interimResults).toBe(false);
    expect(screen.getByRole("button", { name: "Stop dictation" })).toBeTruthy();
    expect(screen.getByText("Listening…")).toBeTruthy();

    emitFinal(instance, "Plan this week's Instagram post");
    expect((screen.getByLabelText("Message the Studio") as HTMLTextAreaElement).value).toBe("Plan this week's Instagram post");

    emitFinal(instance, "with a carousel outline");
    expect((screen.getByLabelText("Message the Studio") as HTMLTextAreaElement).value).toBe(
      "Plan this week's Instagram post with a carousel outline",
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    expect(instance.stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Dictate" })).toBeTruthy();
  });

  it("uses the UI locale as the recognition language", async () => {
    render(<Harness locale="zh-HK" />);
    fireEvent.click(await screen.findByRole("button", { name: "語音輸入" }));
    expect(FakeSpeechRecognition.instances[0].lang).toBe("zh-HK");
  });

  it("explains a denied microphone without disposing the draft", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Dictate" }));
    const instance = FakeSpeechRecognition.instances[0];
    act(() => {
      instance.onerror?.({ error: "not-allowed" });
    });
    expect(screen.getByText(/Microphone access is blocked/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dictate" })).toBeTruthy();
  });
});
