// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { StudioComposer } from "./composer";
import type { StudioSpeechErrorEvent, StudioSpeechEvent, StudioSpeechRecognition } from "@/lib/studio/speech";

class FakeSpeechRecognition implements StudioSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = true;
  onresult: ((event: StudioSpeechEvent) => void) | null = null;
  onerror: ((event: StudioSpeechErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  // Web Speech ends asynchronously; tests deliver terminal callbacks explicitly.
  stop = vi.fn();
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
    expect((screen.getByLabelText("Message Kinnso") as HTMLTextAreaElement).value).toBe("Plan this week's Instagram post");

    emitFinal(instance, "with a carousel outline");
    expect((screen.getByLabelText("Message Kinnso") as HTMLTextAreaElement).value).toBe(
      "Plan this week's Instagram post with a carousel outline",
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    expect(instance.stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Dictate" })).toBeTruthy();
  });

  it.each(["end", "error", "result"] as const)("ignores stopped A's late %s after B starts", async (event) => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Dictate" }));
    const first = FakeSpeechRecognition.instances[0];
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    fireEvent.click(screen.getByRole("button", { name: "Dictate" }));
    const second = FakeSpeechRecognition.instances[1];
    if (event === "result") emitFinal(first, "stale phrase");
    else act(() => event === "end" ? first.onend?.() : first.onerror?.({ error: "not-allowed" }));
    expect(screen.getByRole("button", { name: "Stop dictation" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Message Kinnso")).toHaveValue("");
    expect(screen.queryByText(/Microphone access is blocked/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it("accepts a final phrase after an ordinary Stop in the same draft", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Dictate" }));
    const first = FakeSpeechRecognition.instances[0];
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    emitFinal(first, "final owned phrase");
    act(() => first.onend?.());
    expect(screen.getByLabelText("Message Kinnso")).toHaveValue("final owned phrase");
    expect(screen.getByRole("button", { name: "Dictate" })).toHaveAttribute("aria-pressed", "false");
  });

  it("rejects a stopped session's result after the owner replaces the draft", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Dictate" }));
    const first = FakeSpeechRecognition.instances[0];
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    fireEvent.change(screen.getByLabelText("Message Kinnso"), { target: { value: "new draft" } });
    emitFinal(first, "old phrase");
    expect(screen.getByLabelText("Message Kinnso")).toHaveValue("new draft");
  });

  it.each([false, true])("fences results synchronously when sending (already stopped: %s)", async (stopped) => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Message Kinnso"), { target: { value: "send me" } });
    fireEvent.click(await screen.findByRole("button", { name: "Dictate" }));
    const first = FakeSpeechRecognition.instances[0];
    if (stopped) fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    emitFinal(first, "late phrase");
    expect(screen.getByLabelText("Message Kinnso")).toHaveValue("send me");
    expect(first.abort).toHaveBeenCalled();
  });

  it("fences late callbacks on unmount", async () => {
    const onChange = vi.fn();
    const { unmount } = render(<StudioComposer locale="en" value="" onChange={onChange} onSend={vi.fn()} onStop={vi.fn()} streaming={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dictate" }));
    const first = FakeSpeechRecognition.instances[0];
    unmount();
    emitFinal(first, "late phrase");
    expect(onChange).not.toHaveBeenCalled();
    expect(first.abort).toHaveBeenCalledOnce();
  });

  it.each(["disabled", "streaming", "locale", "context", "draft"] as const)("cancels and fences dictation when %s changes", async (change) => {
    const onChange = vi.fn();
    const props = { locale: "en" as const, value: "owned", onChange, onSend: vi.fn(), onStop: vi.fn(), streaming: false, dictationContext: "chat-a" };
    const { rerender } = render(<StudioComposer {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dictate" }));
    const first = FakeSpeechRecognition.instances[0];
    const next = {
      ...props,
      ...(change === "disabled" ? { disabled: true } : {}),
      ...(change === "streaming" ? { streaming: true } : {}),
      ...(change === "locale" ? { locale: "zh-TW" as const } : {}),
      ...(change === "context" ? { dictationContext: "chat-b" } : {}),
      ...(change === "draft" ? { value: "replacement" } : {}),
    };
    rerender(<StudioComposer {...next} />);
    expect(first.abort).toHaveBeenCalledOnce();
    emitFinal(first, "obsolete phrase");
    act(() => { first.onerror?.({ error: "not-allowed" }); first.onend?.(); });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: change === "locale" ? "語音輸入" : "Dictate" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(/Microphone access is blocked/)).not.toBeInTheDocument();
  });

  it("preserves explicit standalone dictation started during streaming through completion", async () => {
    const onChange = vi.fn();
    const props = { locale: "en" as const, value: "next draft", onChange, onSend: vi.fn(), onStop: vi.fn(), dictationContext: "chat-a" };
    const { rerender } = render(<StudioComposer {...props} streaming={true} />);
    const mic = await screen.findByRole("button", { name: "Dictate" });
    expect(mic).toBeEnabled();
    fireEvent.click(mic);
    expect(FakeSpeechRecognition.instances).toHaveLength(1);
    const first = FakeSpeechRecognition.instances[0];
    rerender(<StudioComposer {...props} streaming={false} />);
    expect(first.abort).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stop dictation" })).toHaveAttribute("aria-pressed", "true");
    emitFinal(first, "more words");
    expect(onChange).toHaveBeenCalledWith("next draft more words");
  });

  it("keeps dictation owned through ordinary focus restoration", async () => {
    const onChange = vi.fn();
    const props = { locale: "en" as const, value: "", onChange, onSend: vi.fn(), onStop: vi.fn(), streaming: false, dictationContext: "chat-a" };
    const { rerender } = render(<StudioComposer {...props} focusKey={1} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dictate" }));
    const first = FakeSpeechRecognition.instances[0];
    rerender(<StudioComposer {...props} focusKey={2} />);
    emitFinal(first, "still owned");
    expect(first.abort).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith("still owned");
  });

  it("preserves typing between phrases while actively listening", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "Dictate" }));
    const first = FakeSpeechRecognition.instances[0];
    emitFinal(first, "first phrase");
    fireEvent.change(screen.getByLabelText("Message Kinnso"), { target: { value: "edited phrase" } });
    emitFinal(first, "next phrase");
    expect(screen.getByLabelText("Message Kinnso")).toHaveValue("edited phrase next phrase");
    expect(first.abort).not.toHaveBeenCalled();
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
