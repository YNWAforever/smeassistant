import { describe, expect, it } from "vitest";

import {
  appendTranscript,
  finalTranscript,
  speechLanguage,
  speechRecognitionConstructor,
  type StudioSpeechEvent,
} from "./speech";

function event(results: Array<{ final: boolean; transcript: string }>, resultIndex = 0): StudioSpeechEvent {
  return {
    resultIndex,
    results: {
      length: results.length,
      ...Object.fromEntries(results.map((result, index) => [index, { isFinal: result.final, 0: { transcript: result.transcript } }])),
    },
  };
}

describe("Studio speech helpers", () => {
  it("uses the UI locale as the recognition locale", () => {
    expect(speechLanguage("en")).toBe("en-US");
    expect(speechLanguage("zh-HK")).toBe("zh-HK");
    expect(speechLanguage("zh-TW")).toBe("zh-TW");
  });

  it("finds either browser constructor and rejects what is not a constructor", () => {
    class FakeRecognition {}
    expect(speechRecognitionConstructor({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(speechRecognitionConstructor({ webkitSpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(speechRecognitionConstructor({})).toBeNull();
    expect(speechRecognitionConstructor(undefined)).toBeNull();
  });

  it("appends speech to the existing draft without replacing typed text", () => {
    expect(appendTranscript("", "hello")).toBe("hello");
    expect(appendTranscript("Draft:", "hello")).toBe("Draft: hello");
    expect(appendTranscript("Draft: ", "hello")).toBe("Draft: hello");
    expect(appendTranscript("Draft: hello", "   ")).toBe("Draft: hello");
  });

  it("reads only final results from the event window", () => {
    expect(finalTranscript(event([{ final: false, transcript: "interim" }]))).toBe("");
    expect(finalTranscript(event([{ final: true, transcript: "one" }, { final: false, transcript: "two" }]))).toBe("one");
    expect(finalTranscript(event([{ final: false, transcript: "old" }, { final: true, transcript: "new" }], 1))).toBe("new");
    expect(finalTranscript(event([{ final: true, transcript: " a " }, { final: true, transcript: " b" }]))).toBe("a  b");
  });
});
