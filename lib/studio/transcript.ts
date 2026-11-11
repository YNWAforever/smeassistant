import type { PrototypeLocale } from "@/lib/copy";
import { studioText } from "./copy";
import type { StudioConversation, StudioMessage } from "./types";

/**
 * Read-only Markdown export of one Studio conversation (P3 polish).
 *
 * The transcript is assembled from already-authorised messages; it never
 * contains tool envelopes or internal identifiers beyond the citation titles.
 * Drafts are included as text with their approval boundary, so an export can
 * never be mistaken for an approved or delivered version.
 */
export function studioTranscriptMarkdown(input: {
  locale: PrototypeLocale;
  conversation: Pick<StudioConversation, "id" | "title" | "createdAt" | "lastMessageAt">;
  messages: readonly StudioMessage[];
}): string {
  const t = studioText(input.locale);
  const title = input.conversation.title.trim() || t.rail.untitled;
  const lines: string[] = [
    `# ${title}`,
    "",
    `> ${t.notices.boundary}`,
    "",
  ];
  for (const message of input.messages) {
    const who = message.role === "user" ? t.message.you : t.message.assistant;
    lines.push(`## ${who}`, "");
    if (message.content.trim()) lines.push(message.content.trim(), "");
    for (const part of message.parts) {
      if (part.kind === "citation" && part.refs.length) {
        lines.push(`> ${t.message.documents}: ${part.refs.map((ref) => ref.title).join(", ")}`, "");
      }
      if (part.kind === "evidence" && part.refs.length) {
        lines.push(`> ${t.message.evidence}: ${part.refs.map((ref) => ref.label).join(", ")}`, "");
      }
      if (part.kind === "artifact") {
        lines.push(`### ${part.title}`, "", part.body.trim(), "");
        if (part.carousel?.length) {
          lines.push(`#### ${t.message.carousel}`, "");
          for (const [index, slide] of part.carousel.entries()) {
            const heading = slide.heading.replace(/\s+/g, " ").trim();
            const detail = slide.detail.replace(/\s+/g, " ").trim();
            lines.push(`${index + 1}. ${[heading, detail].filter(Boolean).join(" — ")}`, "");
          }
          lines.push(`> ${t.message.carouselPlanOnly}`, "");
        }
        lines.push(`> ${t.notices.boundary}`, "");
      }
      if (part.kind === "warning") {
        lines.push(`> ${part.text}`, "");
      }
    }
  }
  if (input.messages.length === 0) lines.push(t.transcript.empty, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
