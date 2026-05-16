const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init.headers || {}),
    },
  });
}

function textSnippet(value, length = 300) {
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

function stripTags(value = "") {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function getAttribute(value = "", attributeName) {
  const attr = new RegExp(`${attributeName}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(value);
  return attr ? decodeHtmlEntities(attr[2]) : "";
}

function parseScorecardTeams(scheduleHtml = "") {
  const entries = [];
  const liPattern = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
  let liMatch;

  while ((liMatch = liPattern.exec(scheduleHtml))) {
    const [, attributes, content] = liMatch;
    const className = getAttribute(attributes, "class");
    const logoMatch = content.match(/<img\b[^>]*src\s*=\s*(["'])(.*?)\1/i);

    if (/\b(?:win|lose|tie)\b/i.test(className)) {
      const teamNameMatch = content.match(/<span\b[^>]*class\s*=\s*(["'])teamName\1[^>]*>([\s\S]*?)<\/span>/i);
      const scoreMatch = content.match(/<span\b(?![^>]*class\s*=\s*(["'])teamName\1)[^>]*>\s*([^<]*\d+\s*\/\s*\d+[^<]*)<\/span>/i);
      const oversMatch = content.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);

      entries.push({
        type: "team",
        resultClass: className,
        name: teamNameMatch ? stripTags(teamNameMatch[2]) : "",
        score: scoreMatch ? stripTags(scoreMatch[2]).replace(/\s+/g, "") : "",
        overs: oversMatch ? stripTags(oversMatch[1]) : "",
        logo: logoMatch ? decodeHtmlEntities(logoMatch[2]) : "",
      });
    } else if (logoMatch) {
      entries.push({ type: "logo", src: decodeHtmlEntities(logoMatch[2]) });
    } else if (/\bvs\b/i.test(className) || /\bVS\b/.test(stripTags(content))) {
      entries.push({ type: "vs" });
    }
  }

  const teams = entries.filter((entry) => entry.type === "team");

  for (const [teamIndex, team] of teams.entries()) {
    if (team.logo) continue;

    const entryIndex = entries.indexOf(team);
    const adjacentIndexes = teamIndex === 0
      ? [entryIndex - 1, entryIndex + 1]
      : [entryIndex + 1, entryIndex - 1];
    const logoEntry = adjacentIndexes
      .map((index) => entries[index])
      .find((entry) => entry && entry.type === "logo");

    if (logoEntry) team.logo = logoEntry.src;
  }

  return teams;
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  const url = new URL(request.url);
  const matchId = url.searchParams.get("matchId");
  const clubId = url.searchParams.get("clubId");

  if (!matchId || !clubId) {
    return jsonResponse({ error: "Missing matchId or clubId" }, { status: 400 });
  }

  const targetUrl = `https://cricclubs.com/QCF/ballbyball.do?matchId=${encodeURIComponent(matchId)}&clubId=${encodeURIComponent(clubId)}`;

  try {
    const res = await fetch(targetUrl, {
      cf: { cacheTtl: 0, cacheEverything: false },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://cricclubs.com/",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    const html = await res.text();

    if (!res.ok) {
      return jsonResponse(
        {
          error: `CricClubs request failed with HTTP ${res.status}`,
          upstreamStatus: res.status,
          upstreamStatusText: res.statusText,
          targetUrl,
          snippet: textSnippet(html),
        },
        { status: 502 }
      );
    }

    // Extract team names and scores from the VS section
    // Look for the schedule-logo section which contains team names
    const scheduleSection = /<div class="schedule-logo[^"]*"[\s\S]*?<ul class="list-inline"[\s\S]*?<\/ul>/i;
    const scheduleMatch = html.match(scheduleSection);
    
    let team1 = "Team A", team2 = "Team B";
    let innings1 = {}, innings2 = {};
    const scorecardTeams = scheduleMatch ? parseScorecardTeams(scheduleMatch[0]) : [];

    if (scorecardTeams.length >= 1) {
      team1 = scorecardTeams[0].name || team1;
      innings1 = {
        score: scorecardTeams[0].score,
        overs: (scorecardTeams[0].overs.match(/[\d.]+/) || [""])[0],
      };
    }

    if (scorecardTeams.length >= 2) {
      team2 = scorecardTeams[1].name || team2;
      innings2 = {
        score: scorecardTeams[1].score,
        overs: (scorecardTeams[1].overs.match(/[\d.]+/) || ["0"])[0],
      };

      if (innings2.score === "0/0") innings2.overs = "0";
    }

    if (!scheduleMatch || !innings1.score) {
      return jsonResponse(
        {
          error: "Could not find CricClubs score data in the upstream response",
          targetUrl,
          snippet: textSnippet(html),
        },
        { status: 502 }
      );
    }

    // Determine batting team (team with current innings)
    const battingTeam = parseInt((innings2.score || "0/0").split("/")[0]) > 0 ? team2 : team1;
    const bowlingTeam = battingTeam === team1 ? team2 : team1;
    
    // Calculate target
    const targetScore = innings1.score ? parseInt(innings1.score.split("/")[0]) + 1 : null;

    // Extract current batsmen from the batting table
    const batTableRegex = /<table[^>]*class="table"[^>]*>[\s\S]*?<th>Batter<\/th>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i;
    const batTable = html.match(batTableRegex);
    const batsmen = [];

    if (batTable) {
      // Simple pattern to find all batsman names and their stats
      const batsmanPattern = /<th><a[^>]*>([^<]+)<\/a><\/th>[\s\S]*?<strong>(\d+)<\/strong>[\s\S]*?<th[^>]*>(\d+)<\/th>/g;
      let match;
      
      while ((match = batsmanPattern.exec(batTable[1])) && batsmen.length < 2) {
        batsmen.push({
          name: match[1].trim(),
          runs: match[2],
          balls: match[3],
        });
      }
    }

    const striker = batsmen[0] || null;
    const nonStriker = batsmen[1] || null;

    // Extract current bowler from the bowling table
    const bowlTableRegex = /<table[^>]*class="table"[^>]*>[\s\S]*?<thead>[\s\S]*?<th[^>]*>Bowler<\/th>[\s\S]*?<\/thead>\s*<tbody>([\s\S]*?)<\/tbody>/i;
    const bowlTable = html.match(bowlTableRegex);
    let bowler = null;

    if (bowlTable) {
      const bowlRowRegex = /<th><a[^>]*>([^<]+)<\/a><\/th>\s*<th[^>]*>([\d.]+)<\/th>\s*<th[^>]*>\d+<\/th>\s*<th[^>]*>(\d+)<\/th>\s*<th[^>]*>(\d+)<\/th>/;
      const b = bowlTable[1].match(bowlRowRegex);
      if (b) {
        bowler = {
          name: b[1].trim(),
          overs: b[2],
          runs: b[3],
          wickets: b[4],
        };
      }
    }

    // Return JSON response
    return jsonResponse({
      ok: true,
      battingTeam,
      bowlingTeam,
      innings1,
      innings2,
      scorecardTeams,
      target: targetScore,
      striker,
      nonStriker,
      bowler,
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, { status: 500 });
  }
}
