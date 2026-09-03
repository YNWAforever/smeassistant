import { describe, expect, it } from "vitest";
import { EMPTY_WEBSITE_CHECKS, inspectHtml, runWebsiteChecks, summarise, WEBSITE_CHECK_KEYS } from "./checks";

const GOOD_HTML = `<!doctype html><html lang="zh-HK"><head>
<title>錦汶館 Kam Man House · Happy Valley café</title>
<meta name="description" content="A neighbourhood café in Happy Valley serving lunch sets, coffee and desserts, open daily from morning to evening.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:image" content="https://example.test/og.jpg">
<link rel="canonical" href="https://example.test/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"Kam Man House","address":{"@type":"PostalAddress","streetAddress":"8 Yik Yam Street"},"openingHours":"Mo-Su 08:00-20:00"}</script>
<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>
</head><body><h1>Kam Man House</h1>
<p>Opening hours: Mon–Sun 8:00am – 8:00pm</p>
<p>8 Yik Yam Street, Happy Valley · Tel <a href="tel:+85212345678">+852 1234 5678</a></p>
<a href="/contact">Contact us</a>
</body></html>`;

function resultMap(html: string, url = "https://example.test/") {
  return Object.fromEntries(inspectHtml(html, url).map((r) => [r.key, r.pass]));
}

describe("inspectHtml", () => {
  it("evaluates all fifteen checks and passes a well-formed page", () => {
    const results = inspectHtml(GOOD_HTML, "https://example.test/");
    expect(results.map((r) => r.key)).toEqual([...WEBSITE_CHECK_KEYS]);
    const summary = summarise(results);
    expect(summary.evaluated).toBe(15);
    expect(summary.passed).toBe(15);
  });

  it("fails https on a plain-http final url", () => {
    expect(resultMap(GOOD_HTML, "http://example.test/").https).toBe(false);
  });

  it("fails every content check on a bare page while keeping it reachable", () => {
    const map = resultMap("<html><body><p>hello</p></body></html>");
    for (const key of WEBSITE_CHECK_KEYS) {
      if (key === "reachable" || key === "https") continue;
      expect(map[key], key).toBe(false);
    }
    expect(map.reachable).toBe(true);
  });

  it("rejects a too-short or too-long meta description", () => {
    const short = `<html><head><meta name="description" content="short"></head></html>`;
    const long = `<html><head><meta name="description" content="${"x".repeat(161)}"></head></html>`;
    expect(resultMap(short).meta_description_50_160).toBe(false);
    expect(resultMap(long).meta_description_50_160).toBe(false);
  });

  it("requires exactly one h1", () => {
    expect(resultMap("<html><body><h1>a</h1><h1>b</h1></body></html>").single_h1).toBe(false);
  });

  it("detects FAQ and local-business schema only from JSON-LD @type", () => {
    const faqOnly = `<html><head><script type="application/ld+json">{"@type":["FAQPage"]}</script></head></html>`;
    const map = resultMap(faqOnly);
    expect(map.faq_schema).toBe(true);
    expect(map.local_business_schema).toBe(false);
    expect(resultMap(`<html><body>FAQPage LocalBusiness</body></html>`).faq_schema).toBe(false);
  });

  it("detects Chinese opening-hours and address text", () => {
    const map = resultMap(`<html><body><p>營業時間 11:00–22:00</p><p>香港跑馬地奕蔭街8號</p></body></html>`);
    expect(map.opening_hours_text).toBe(true);
    expect(map.address_present).toBe(true);
  });

  it("accepts a WhatsApp or booking link as the contact signal", () => {
    expect(resultMap(`<html><body><a href="https://wa.me/85212345678">WhatsApp</a></body></html>`).contact_or_booking_link).toBe(true);
    expect(resultMap(`<html><body><a href="/about">About</a></body></html>`).contact_or_booking_link).toBe(false);
  });
});

describe("runWebsiteChecks", () => {
  it("returns evaluated = 0 when the fetch fails", async () => {
    const result = await runWebsiteChecks("https://down.example.test", {
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual(EMPTY_WEBSITE_CHECKS);
  });

  it("returns evaluated = 0 on a non-2xx response and on an unparseable url", async () => {
    const notFound = await runWebsiteChecks("example.test/missing", {
      fetch: (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch,
    });
    expect(notFound.evaluated).toBe(0);
    expect(await runWebsiteChecks("http://[bad", {})).toEqual(EMPTY_WEBSITE_CHECKS);
  });

  it("evaluates a successful fetch against the final url", async () => {
    const result = await runWebsiteChecks("example.test", {
      fetch: (async (input: string) => {
        expect(input).toBe("https://example.test/");
        return new Response(GOOD_HTML, { status: 200, headers: { "content-type": "text/html" } });
      }) as unknown as typeof fetch,
    });
    expect(result.evaluated).toBe(15);
    expect(result.passed).toBe(15);
  });
});
