const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
};

const DEFAULT_SOURCE = "https://cricclubs.com/QCF/ballbyball.do?matchId=3626&clubId=1834";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init.headers || {}),
    },
  });
}

function textSnippet(value = "", length = 300) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function decodeHtmlEntities(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
    const lowerCode = code.toLowerCase();

    if (lowerCode[0] === "#") {
      const base = lowerCode[1] === "x" ? 16 : 10;
      const number = parseInt(lowerCode.slice(base === 16 ? 2 : 1), base);
      return Number.isNaN(number) ? entity : String.fromCodePoint(number);
    }

    return named[lowerCode] || entity;
  });
}

function getSourceUrl(requestUrl) {
  const url = new URL(requestUrl);
  const suppliedSource = url.searchParams.get("source") || url.searchParams.get("url");

  if (suppliedSource) {
    return new URL(suppliedSource);
  }

  const matchId = url.searchParams.get("matchId");
  const clubId = url.searchParams.get("clubId");

  if (matchId && clubId) {
    return new URL(
      `https://cricclubs.com/QCF/ballbyball.do?matchId=${encodeURIComponent(matchId)}&clubId=${encodeURIComponent(clubId)}`
    );
  }

  return new URL(DEFAULT_SOURCE);
}

function assertAllowedSource(sourceUrl) {
  if (sourceUrl.protocol !== "https:") {
    throw new Error("Only https CricClubs links are supported");
  }

  if (sourceUrl.hostname !== "cricclubs.com" && sourceUrl.hostname !== "www.cricclubs.com") {
    throw new Error("Only cricclubs.com links are supported");
  }
}

function findOpeningTagEnd(html, startIndex) {
  let quote = "";

  for (let index = startIndex; index < html.length; index += 1) {
    const character = html[index];

    if (quote) {
      if (character === quote) quote = "";
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") return index;
  }

  return -1;
}

function extractBalancedDiv(html, startIndex) {
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = startIndex;
  let depth = 0;
  let match;

  while ((match = tagPattern.exec(html))) {
    const tag = match[0];

    if (/^<\s*\/\s*div/i.test(tag)) {
      depth -= 1;
      if (depth === 0) return html.slice(startIndex, tagPattern.lastIndex);
    } else if (!/\/\s*>$/.test(tag)) {
      depth += 1;
    }
  }

  return "";
}

function absolutizeUrls(fragment, sourceUrl) {
  return fragment.replace(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi, (full, attribute, quote, value) => {
    if (!value || /^(?:data:|mailto:|tel:|javascript:|#)/i.test(value)) return full;

    try {
      return `${attribute}=${quote}${new URL(decodeHtmlEntities(value), sourceUrl).href}${quote}`;
    } catch {
      return full;
    }
  });
}

function sanitizeFragment(fragment) {
  return fragment
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:data-toggle|data-content|data-html|data-placement|data-trigger)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function extractMatchSummary(html, sourceUrl) {
  const summaryStart = html.search(/<div\b[^>]*class\s*=\s*(["'])[^"']*\bmatch-summary\b[^"']*\1[^>]*>/i);

  if (summaryStart === -1) return "";

  const openingTagEnd = findOpeningTagEnd(html, summaryStart);
  if (openingTagEnd === -1) return "";

  const fragment = extractBalancedDiv(html, summaryStart);
  if (!fragment) return "";

  return sanitizeFragment(absolutizeUrls(fragment, sourceUrl));
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Only GET requests are supported" }, { status: 405 });
  }

  try {
    const sourceUrl = getSourceUrl(request.url);
    assertAllowedSource(sourceUrl);
    sourceUrl.searchParams.set("_overlayTs", Date.now().toString());

    const upstreamResponse = await fetch(sourceUrl.href, {
      cf: { cacheTtl: 0, cacheEverything: false },
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        pragma: "no-cache",
        referer: "https://cricclubs.com/",
      },
    });

    const html = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      return jsonResponse(
        {
          error: `CricClubs request failed with HTTP ${upstreamResponse.status}`,
          upstreamStatus: upstreamResponse.status,
          sourceUrl: sourceUrl.href,
          snippet: textSnippet(html),
        },
        { status: 502 }
      );
    }

    const matchSummaryHtml = extractMatchSummary(html, sourceUrl);

    if (!matchSummaryHtml) {
      return jsonResponse(
        {
          error: "Could not find a div with class match-summary in the CricClubs response",
          sourceUrl: sourceUrl.href,
          snippet: textSnippet(html),
        },
        { status: 502 }
      );
    }

    return jsonResponse({
      ok: true,
      sourceUrl: sourceUrl.href,
      fetchedAt: new Date().toISOString(),
      html: matchSummaryHtml,
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }
}
