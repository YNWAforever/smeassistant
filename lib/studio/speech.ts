import type { PrototypeLocale } from "@/lib/copy";

/**
 * Minimal Web Speech API surface used by the Studio composer. The browser
 * implementations disagree on the constructor name (`SpeechRecognition` vs
 * `webkitSpeechRecognition`) and TypeScript's DOM lib does not ship the
 * interface everywhere, so the component talks to this narrow shape instead of
 * `any`. Nothing here touches the server or stores audio: the browser performs
 * recognition and only the transcript text is sent with the next turn.
 */
export interface StudioSpeechResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string } | undefined;
}

export interface StudioSpeechEvent {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: StudioSpeechResult | undefined;
  };
}

export interface StudioSpeechErrorEvent {
  readonly error: string;
}

export interface StudioSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: StudioSpeechEvent) => void) | null;
  onerror: ((event: StudioSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type StudioSpeechRecognitionConstructor = new () => StudioSpeechRecognition;

/** The two names browsers expose, checked without reading `window` at import time. */
export function speechRecognitionConstructor(
  scope?: { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown },
): StudioSpeechRecognitionConstructor | null {
  const resolved = scope ?? (typeof window === "undefined" ? undefined : (window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  }));
  const candidate = resolved?.SpeechRecognition ?? resolved?.webkitSpeechRecognition;
  return typeof candidate === "function" ? (candidate as StudioSpeechRecognitionConstructor) : null;
}

/** The recognition locale follows the UI locale: en → en-US, zh-HK/zh-TW stay themselves. */
export function speechLanguage(locale: PrototypeLocale): string {
  return locale === "en" ? "en-US" : locale;
}

/**
 * Append a final transcript to the owner's existing draft instead of replacing
 * it. Dictation is an input aid, so typing done before or between phrases is
 * preserved; a single separating space is added only when the draft does not
 * already end in whitespace.
 */
export function appendTranscript(base: string, transcript: string): string {
  const next = transcript.trim();
  if (!next) return base;
  if (!base) return next;
  return /\s$/.test(base) ? `${base}${next}` : `${base} ${next}`;
}

/** Concatenate the final results delivered by a single recognition event. */
export function finalTranscript(event: StudioSpeechEvent): string {
  let out = "";
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (!result?.isFinal) continue;
    out += result[0]?.transcript ?? "";
  }
  return out.trim();
}
