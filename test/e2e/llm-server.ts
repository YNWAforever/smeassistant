import { createServer } from "node:http";
import { listen } from "./safety";
export type LlmMode = "success" | "missing" | "invalid" | "unavailable";
export async function startLlmServer() {
  let mode: LlmMode = "success";
  let customOutput: Record<string, unknown> | null = null;
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
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    if (held) await new Promise<void>(resolve => { release.push(resolve); });
    if (mode === "unavailable") { res.writeHead(503).end(); return; }
    const output = customOutput ?? { title: "Fixture review reply", body: "Thank you for your review. We appreciate your feedback.", acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: mode === "missing" ? ["capacity"] : [] };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: mode === "invalid" ? "invalid-json" : JSON.stringify(output) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }));
  });
  const url = await listen(server);
  return { url, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
