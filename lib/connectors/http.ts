/** Read provider JSON under one abort deadline and a byte ceiling, including the body. */
export async function boundedJson(response: Response, maxBytes = 1_048_576): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) { await response.body?.cancel(); throw new Error("response_too_large"); }
  if (!response.body) throw new Error("empty_response");
  const reader = response.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error("response_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes)) as unknown;
}
export function providerFailure(error: unknown): string {
  return error instanceof Error && ["AbortError","TimeoutError"].includes(error.name) ? "timeout" : "provider_failed";
}
