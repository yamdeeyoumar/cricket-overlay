export async function onRequest(context) {
  const { request } = context;

  const url = new URL(request.url);
  const matchId = url.searchParams.get("matchId");
  const clubId = url.searchParams.get("clubId");

  if (!matchId || !clubId) {
    return new Response(JSON.stringify({ error: "Missing matchId or clubId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const target = `https://cricclubs.com/QCF/ballbyball.do?matchId=${matchId}&clubId=${clubId}`;

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/html,application/xhtml+xml",
        "Referer": "https://cricclubs.com/",
      },
    });

    const html = await res.text();

    // --- Extract meta or quick score info ---
    const descMatch =
      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) ||
      html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
      html.match(/<title>(.*?)<\/title>/i);

    const desc = descMatch ? descMatch[1] : "";

    // Example: Dragons 145/7 (20.0 overs) Enemy 122/9 (20.0 overs)
    const pattern =
      /([A-Za-z\s]+)\s(\d+\/\d+)\s*\(?([\d.]+)\s*overs?\)?\s*([A-Za-z\s]+)\s(\d+\/\d+)\s*\(?([\d.]+)\s*overs?\)?/i;
    const m = desc.match(pattern);

    let team1 = "Team A",
      team2 = "Team B",
      innings1 = {},
      innings2 = {};

    if (m) {
      team1 = m[1].trim();
      innings1 = { score: m[2], overs: m[3] };
      team2 = m[4].trim();
      innings2 = { score: m[5], overs: m[6] };
    }

    const battingTeam =
      parseInt((innings2.score || "0").split("/")[0]) > 0 ? team2 : team1;
    const bowlingTeam = battingTeam === team1 ? team2 : team1;
    const targetScore =
      innings1.score ? parseInt(innings1.score.split("/")[0]) + 1 : null;

    // --- Extract last ball update info ---
    const updateCalls = [...html.matchAll(/updateBall\(([^)]+)\)/g)];
    const lastUpdate = updateCalls.pop();
    let striker = null, nonStriker = null, bowler = null;

    if (lastUpdate) {
      const args = lastUpdate[1].split(",");
      // Extract batsman & bowler names from JS call
      striker = { name: args[11]?.replace(/['"]/g, "").trim() || null, runs: "-", balls: "-" };
      bowler = { name: args[12]?.replace(/['"]/g, "").trim() || null, overs: "-", runs: "-", wickets: "-" };
    }

    // --- Extract current batsmen scores ---
    const batsmen = [];
    const batRegex = /<td[^>]*>\s*([\w\s.'-]+)\s*<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>/g;
    let matchBat;
    while ((matchBat = batRegex.exec(html)) && batsmen.length < 2) {
      batsmen.push({
        name: matchBat[1].trim(),
        runs: matchBat[2],
        balls: matchBat[3],
      });
    }

    if (batsmen.length > 0) {
      striker = batsmen[0];
      nonStriker = batsmen[1] || null;
    }

    // --- Extract bowler (first one listed) ---
    const bowlRegex = /<td[^>]*>\s*([\w\s.'-]+)\s*<\/td>\s*<td[^>]*>(\d+\.\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>/;
    const b = html.match(bowlRegex);
    if (b) {
      bowler = {
        name: b[1].trim(),
        overs: b[2],
        runs: b[4],
        wickets: b[5],
      };
    }

    // --- Build JSON output ---
    const payload = {
      ok: true,
      battingTeam,
      bowlingTeam,
      innings1,
      innings2,
      score: innings2.score || innings1.score,
      overs: innings2.overs || innings1.overs,
      target: targetScore,
      striker,
      nonStriker,
      bowler,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: { "content-type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
