import { createServer } from "node:http";
import { listen } from "./safety";
export type LlmMode = "success" | "missing" | "invalid" | "unavailable";
export async function startLlmServer() {
  let mode: LlmMode = "success";
  let customOutput: Record<string, unknown> | null = null;
  /**
   * Per-request scripted outputs, consumed in order. A string is returned as
   * raw assistant text (the prose answer); an object is JSON-stringified (the
   * Studio classifier and the agent JSON drafts). Optional and unused by the
   * existing specs, which keep the single `/output` behaviour.
   */
  let scripted: Array<string | Record<string, unknown>> | null = null;
  const requests: unknown[] = [];
  let held = false;
  let release: (() => void)[] = [];
  const server = createServer(async (req, res) => {
    if (req.url === "/requests" && req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(requests));
      return;
    }
    if (req.url === "/hold" && req.method === "POST") { held = true; res.end("ok"); return; }
    if (req.url === "/release" && req.method === "POST") {
      held = false;
      const pending = release; release = [];
      pending.forEach(done => done());
      res.end("ok"); return;
    }
    if (req.url === "/output" && req.method === "POST") {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString());
        if (value !== null && (typeof value !== "object" || Array.isArray(value))) throw new Error("invalid");
        customOutput = value as Record<string, unknown> | null;
        scripted = null;
        res.end("ok");
      } catch { res.writeHead(400).end(); }
      return;
    }
    if (req.url === "/outputs" && req.method === "POST") {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString());
        if (!Array.isArray(value) || !value.length) throw new Error("invalid");
        for (const entry of value) {
          if (typeof entry !== "string" && (entry === null || typeof entry !== "object" || Array.isArray(entry))) throw new Error("invalid");
        }
        scripted = value as Array<string | Record<string, unknown>>;
        customOutput = null;
        res.end("ok");
      } catch { res.writeHead(400).end(); }
      return;
    }
    if (req.url === "/mode" && req.method === "POST") {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const requested = Buffer.concat(chunks).toString() as LlmMode;
      if (!["success", "missing", "invalid", "unavailable"].includes(requested)) { res.writeHead(400).end(); return; }
      mode = requested; res.end("ok"); return;
    }
    if (req.url !== "/v1/chat/completions" || req.method !== "POST") { res.writeHead(404).end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const requestBody = JSON.parse(Buffer.concat(chunks).toString()) as { stream?: unknown };
    requests.push(requestBody);
    if (held) await new Promise<void>(resolve => { release.push(resolve); });
    if (mode === "unavailable") { res.writeHead(503).end(); return; }
    const defaultOutput = { title: "Fixture review reply", body: "Thank you for your review. We appreciate your feedback.", acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: mode === "missing" ? ["capacity"] : [] };
    const queued = scripted && scripted.length ? scripted.shift() : undefined;
    const chosen = mode === "invalid" ? "invalid-json" : queued ?? customOutput ?? defaultOutput;
    const content = typeof chosen === "string" ? chosen : JSON.stringify(chosen);
    if (requestBody.stream === true && mode !== "invalid") {
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" });
      // A few frames so the reader has to join a fragmented SSE stream, then a
      // final usage frame and [DONE], like an OpenAI-compatible gateway.
      const frames = content.match(/[\s\S]{1,80}/g) ?? [content];
      for (const frame of frames) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: frame } }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: frames.length } })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }));
  });
  const url = await listen(server);
  return { url, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
