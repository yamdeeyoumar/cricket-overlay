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

  // ✅ Use the live "ball by ball" page
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

    // --- Extract team names and scores ---
    const scoreRegex =
      /<span class="teamName">([^<]+)<br><\/span>\s*<span>([\d/]+)<\/span>[\s\S]*?(\d+(?:\.\d+)?)\s*ov[\s\S]*?<span class="teamName">([^<]+)<br><\/span>\s*<span>([\d/]+)<\/span>[\s\S]*?(\d+(?:\.\d+)?)\s*ov/;
    const match = html.match(scoreRegex);

    let team1 = "Team A",
      team2 = "Team B",
      innings1 = {},
      innings2 = {};

    if (match) {
      team1 = match[1].trim();
      innings1 = { score: match[2], overs: match[3] };
      team2 = match[4].trim();
      innings2 = { score: match[5], overs: match[6] };
    }

    const battingTeam =
      parseInt((innings2.score || "0").split("/")[0]) > 0 ? team2 : team1;
    const bowlingTeam = battingTeam === team1 ? team2 : team1;
    const target =
      innings1.score && parseInt(innings1.score)
        ? parseInt(innings1.score.split("/")[0]) + 1
        : null;

    // --- Extract batters ---
    const batsmen = [];
    const batsmanRegex =
      /<a[^>]*>([^<]+)<\/a><\/th>\s*<th[^>]*><strong>(\d+)<\/strong><\/th>\s*<th[^>]*>(\d+)<\/th>/g;
    let b;
    while ((b = batsmanRegex.exec(html)) && batsmen.length < 2) {
      batsmen.push({
        name: b[1].trim(),
        runs: b[2],
        balls: b[3],
      });
    }

    const striker = batsmen[0] || null;
    const nonStriker = batsmen[1] || null;

    // --- Extract first bowler row ---
    const bowlRegex =
      /<a[^>]*>([^<]+)<\/a><\/th>\s*<th[^>]*>([\d.]+)<\/th>\s*<th[^>]*>(\d+)<\/th>\s*<th[^>]*>(\d+)<\/th>\s*<th[^>]*>(\d+)<\/th>/;
    const bowlerMatch = html.match(bowlRegex);

    const bowler = bowlerMatch
      ? {
          name: bowlerMatch[1].trim(),
          overs: bowlerMatch[2],
          runs: bowlerMatch[4],
          wickets: bowlerMatch[5],
        }
      : null;

    const payload = {
      ok: true,
      battingTeam,
      bowlingTeam,
      innings1,
      innings2,
      target,
      striker,
      nonStriker,
      bowler,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
