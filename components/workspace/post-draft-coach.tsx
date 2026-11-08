"use client";

import { ImagePlus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { PrototypeLocale } from "@/lib/copy";
import { postDraftCopy, type PostDraftChannel, type PostDraftTone } from "@/lib/copy-conversation-post-draft";
import { POST_DRAFT_FIXTURES } from "@/lib/workspace/post-draft-fixture";

const CHANNELS = ["facebook", "instagram", "threads", "googleBusinessProfile"] as const;
const TONES = ["friendly", "straightforward", "playful"] as const;

const SCHEDULE_REQUEST = [
  /排程/, /排期/, /即發/, /即時發/, /自動(?:發|出)/, /(?:聽日|明日|今日|明天).*(?:發|出)/, /幫我(?:發|出)(?!草稿)/, /發佈/, /發布/, /schedule/i, /publish/i, /post\s+(?:it|now)/i, /auto[- ]?post/i,
];

function asksToSchedule(value: string): boolean {
  return SCHEDULE_REQUEST.some(pattern => pattern.test(value));
}

export interface ConfirmedPostDraft {
  id: string;
  title: string;
  body: string;
  channel: PostDraftChannel | null;
  confirmedAt: string;
}
export interface PostDraftCoachProps {
  locale: PrototypeLocale;
  onSaveTodo: (draft: ConfirmedPostDraft) => "saved" | "failed";
}

type Stage = "idle" | "channel" | "tone" | "card";
type Feedback = { kind: "success" | "error" | "info"; text: string };

export function PostDraftCoach({ locale, onSaveTodo }: PostDraftCoachProps) {
  const t = postDraftCopy[locale];
  const baseId = useId();
  const copyRef = useRef<HTMLButtonElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [intent, setIntent] = useState("");
  const [channel, setChannel] = useState<PostDraftChannel | null>(null);
  const [tone, setTone] = useState<PostDraftTone | null>(null);
  const [variant, setVariant] = useState(0);
  const [draft, setDraft] = useState(() => POST_DRAFT_FIXTURES[locale][0]);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [scheduleRequest, setScheduleRequest] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (confirmed) copyRef.current?.focus();
  }, [confirmed]);

  function start(event: FormEvent) {
    event.preventDefault();
    const value = intent.trim();
    if (!value) { setFeedback({ kind: "error", text: t.errors.emptyIntent }); return; }
    setIntent(value);
    setScheduleRequest(asksToSchedule(value));
    setFeedback(null);
    setStage("channel");
  }
  function pickChannel(next: PostDraftChannel | null) {
    setChannel(next);
    setFeedback(null);
    setStage("tone");
  }
  function pickTone(next: PostDraftTone | null) {
    setTone(next);
    setDraft(POST_DRAFT_FIXTURES[locale][variant]);
    setEditing(false);
    setFeedback(null);
    setStage("card");
  }
  function regenerate() {
    const next = (variant + 1) % POST_DRAFT_FIXTURES[locale].length;
    setVariant(next);
    setDraft(POST_DRAFT_FIXTURES[locale][next]);
    setEditing(false);
    setFeedback(null);
  }
  function confirmDraft() {
    setConfirmed(true);
    setEditing(false);
    setFeedback(null);
  }
  function editAgain() {
    setConfirmed(false);
    setEditing(true);
    setFeedback({ kind: "info", text: t.confirm.editResets });
  }
  async function copyDraft() {
    const text = `${draft.title}\n\n${draft.body}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setFeedback({
        kind: "success",
        text: channel ? t.actions.copied.replace("{channel}", t.channel[channel]) : t.actions.copiedGeneric,
      });
    } catch {
      setFeedback({ kind: "error", text: t.actions.copyFailed });
    }
  }
  function saveTodo() {
    const result = onSaveTodo({
      id: crypto.randomUUID(),
      title: draft.title,
      body: draft.body,
      channel,
      confirmedAt: new Date().toISOString(),
    });
    setFeedback(result === "saved"
      ? { kind: "success", text: t.actions.savedTodo }
      : { kind: "error", text: t.actions.saveTodoFailed });
  }

  const titleId = `${baseId}-title`, bodyId = `${baseId}-body`, headingId = `${baseId}-heading`;

  return <section className="post-coach" aria-label={t.coach.title}>
    {stage === "idle" ? <div className="post-coach-open">
      <h2>{t.coach.title}</h2>
      <p>{t.coach.prompt}</p>
      <p className="post-coach-trust">{t.coach.trustLine}</p>
      <div className="post-coach-examples" role="group" aria-labelledby={`${baseId}-examples`}>
        <p id={`${baseId}-examples`}>{t.examples.label}</p>
        <button type="button" onClick={() => setIntent(t.examples.weeklyIg)}>{t.examples.weeklyIg}</button>
        <button type="button" onClick={() => setIntent(t.examples.newItem)}>{t.examples.newItem}</button>
        <button type="button" onClick={() => setIntent(t.examples.hoursNotice)}>{t.examples.hoursNotice}</button>
        <p className="post-coach-disclaimer">{t.examples.disclaimer}</p>
      </div>
      <form className="post-coach-composer" onSubmit={start}>
        <div className="post-coach-composer-row">
          <input aria-label={t.coach.inputPlaceholder} value={intent} onChange={event => { setIntent(event.target.value); setFeedback(null); }} placeholder={t.coach.inputPlaceholder} />
          <button type="submit" disabled={!intent.trim()}>{t.coach.startCta}</button>
        </div>
      </form>
      {feedback && <p className={`post-draft-feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</p>}
    </div> : <div className="post-coach-flow">
      <p className="post-coach-bubble">{intent}</p>
      {stage === "channel" && <div className="post-coach-clarify" role="group" aria-labelledby={`${baseId}-channel`}>
        <h3 id={`${baseId}-channel`}>{t.clarify.channel.question}</h3>
        <div className="post-coach-chips">
          {CHANNELS.map(key => <button type="button" key={key} onClick={() => pickChannel(key)}>{t.channel[key]}<small>{t.channel.notConnected}</small></button>)}
        </div>
        <button type="button" className="post-coach-skip" onClick={() => pickChannel(null)}>{t.clarify.channel.notSure}</button>
      </div>}
      {stage === "tone" && <div className="post-coach-clarify" role="group" aria-labelledby={`${baseId}-tone`}>
        <h3 id={`${baseId}-tone`}>{t.clarify.tone.question}</h3>
        <div className="post-coach-chips">
          {TONES.map(key => <button type="button" key={key} onClick={() => pickTone(key)}>{t.clarify.tone[key]}</button>)}
        </div>
        <button type="button" className="post-coach-skip" onClick={() => pickTone(null)}>{t.clarify.tone.skip}</button>
      </div>}
      {stage === "card" && <article className="post-draft-card" aria-labelledby={headingId} data-tone={tone ?? "none"}>
        <header className="post-draft-head">
          <h2 id={headingId}>{t.card.heading}</h2>
          <span className={`post-draft-pill ${confirmed ? "is-confirmed" : "is-draft"}`}>{confirmed ? t.confirmed.status : t.card.status.draft}</span>
          {confirmed && <span className="post-draft-done">{t.confirmed.done}</span>}
        </header>
        {!confirmed && <p className="post-draft-honesty">{t.honesty.aiDraftsOnly}</p>}
        {scheduleRequest && <p className="post-draft-honesty" role="status">{t.honesty.scheduleRequestReply}</p>}
        <div className="post-draft-field">
          {editing ? <label htmlFor={titleId}>{t.card.titleLabel}</label> : <span className="post-draft-field-label">{t.card.titleLabel}</span>}
          {editing
            ? <input id={titleId} value={draft.title} maxLength={140} onChange={event => setDraft({ ...draft, title: event.target.value })} />
            : <p className="post-draft-title">{draft.title}</p>}
        </div>
        <div className="post-draft-field">
          {editing ? <label htmlFor={bodyId}>{t.card.bodyLabel}</label> : <span className="post-draft-field-label">{t.card.bodyLabel}</span>}
          {editing
            ? <textarea id={bodyId} value={draft.body} maxLength={4000} onChange={event => setDraft({ ...draft, body: event.target.value })} />
            : <p className="post-draft-body">{draft.body}</p>}
        </div>
        <div className="post-draft-photo" data-optional="photo">
          <ImagePlus aria-hidden="true" />
          <span>{t.card.imageSlotLabel}</span>
          <small>{t.card.imageSlotHint}</small>
        </div>
        {channel && <>
          <p className="post-draft-platform-label">{t.card.channelLabel.replace("{channel}", t.channel[channel])}</p>
          <div className="post-draft-platform"><span className="post-draft-chip">{t.channel[channel]}<small>{t.channel.notConnected}</small></span></div>
        </>}
        {!confirmed ? <div className="post-draft-actions">
          <div className="post-draft-row">
            <button type="button" className="is-ghost" aria-pressed={editing} onClick={() => setEditing(value => !value)}>{t.card.editCta}</button>
            <button type="button" className="is-ghost" onClick={regenerate}>{t.card.regenerateCta}</button>
            <span className="post-draft-spacer" />
            <button type="button" className="is-primary" onClick={confirmDraft}>{t.confirm.primaryCta}</button>
          </div>
          <p className="post-draft-helper">{t.confirm.helper}</p>
        </div> : <div className="post-draft-actions">
          <div className="post-draft-row">
            <button type="button" className="is-ghost" onClick={editAgain}>{t.actions.editAgain}</button>
            <button type="button" className="is-ghost" onClick={saveTodo}>{t.actions.saveTodo}</button>
            <span className="post-draft-spacer" />
            <button type="button" className="is-primary" ref={copyRef} onClick={() => void copyDraft()}>{t.actions.copy}</button>
          </div>
        </div>}
        {feedback && <p className={`post-draft-feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</p>}
      </article>}
    </div>}
  </section>;
}
