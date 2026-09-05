import { createServer } from "node:http";
import { listen } from "./safety";
export type LlmMode = "success" | "missing" | "invalid" | "unavailable";
export async function startLlmServer() {
  let mode: LlmMode = "success";
  const server = createServer(async (req, res) => {
    if (req.url === "/mode" && req.method === "POST") {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const requested = Buffer.concat(chunks).toString() as LlmMode;
      if (!["success", "missing", "invalid", "unavailable"].includes(requested)) { res.writeHead(400).end(); return; }
      mode = requested; res.end("ok"); return;
    }
    if (req.url !== "/v1/chat/completions" || req.method !== "POST") { res.writeHead(404).end(); return; }
    for await (const _chunk of req) { void _chunk; }
    if (mode === "unavailable") { res.writeHead(503).end(); return; }
    const output = { title: "Fixture review reply", body: "Thank you for your review. We appreciate your feedback.", acceptance_criteria: [], warnings: [], facts_used: [], facts_needed: mode === "missing" ? ["capacity"] : [] };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: mode === "invalid" ? "invalid-json" : JSON.stringify(output) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }));
  });
  const url = await listen(server);
  return { url, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
