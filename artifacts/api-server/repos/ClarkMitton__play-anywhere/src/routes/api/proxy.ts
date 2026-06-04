import { createFileRoute } from "@tanstack/react-router";

// Simple HTML page proxy: fetches the target URL, strips framing-blocking
// headers, and injects a <base> so relative URLs resolve back to the origin.
// Limitations: cookies/logins won't persist, OAuth/CSP-strict sites will still
// break, anti-bot pages (Cloudflare, Google) will refuse.

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) return new Response("Missing ?url=", { status: 400 });

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return new Response("Only http(s) supported", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch (err) {
    return new Response(`Fetch failed: ${(err as Error).message}`, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  // Headers to strip (would block iframing or break the proxied page)
  const STRIP = new Set([
    "x-frame-options",
    "content-security-policy",
    "content-security-policy-report-only",
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "cross-origin-resource-policy",
    "permissions-policy",
    "set-cookie",
  ]);

  const headers = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!STRIP.has(k.toLowerCase())) headers.set(k, v);
  });
  // Permissive CSP so the page actually renders inside the iframe
  headers.set("content-security-policy", "frame-ancestors *;");

  // For HTML, inject <base> so relative links resolve to the original origin.
  if (contentType.includes("text/html")) {
    let body = await upstream.text();
    const baseTag = `<base href="${targetUrl.origin}${targetUrl.pathname.replace(/\/[^/]*$/, "/")}">`;
    if (/<head[^>]*>/i.test(body)) {
      body = body.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
    } else {
      body = baseTag + body;
    }
    headers.delete("content-length");
    return new Response(body, { status: upstream.status, headers });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

export const Route = createFileRoute("/api/proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
    },
  },
});
