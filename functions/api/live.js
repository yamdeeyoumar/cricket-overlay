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
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://cricclubs.com/",
      },
    });

    const html = await res.text();

    // --- Extract team scores from top section ---
    const scoreRegex =
      /<span class="teamName">([\w\s]+)<br><\/span>\s*<span>(\d+\/\d+)<\/span>[\s\S]*?<p[^>]*>([\d.]+).*?ov[\s\S]*?class="teamName">([\w\s]+)<br><\/span>\s*<span>(\d+\/\d+)<\/span>[\s\S]*?<p[^>]*>([\d.]+).*?ov/i;
    const m = html.match(scoreRegex);

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

    // --- Determine batting/bowling sides ---
    const battingTeam =
      parseInt((innings2.score || "0").split("/")[0]) > 0 ? team2 : team1;
    const bowlingTeam = battingTeam === team1 ? team2 : team1;
    const target =
      innings1.score && parseInt(innings1.score)
        ? parseInt(innings1.score.split("/")[0]) + 1
        : null;

    // --- Extract current batsmen (first 2 rows of batter table) ---
    const batsmanRegex =
      /<a[^>]*>([\w\s.']+)<\/a><\/th>\s*<th[^>]*><strong>(\d+)<\/strong><\/th>\s*<th[^>]*>(\d+)<\/th>/g;
    const batsmen = [];
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

    // --- Extract top bowler ---
    const bowlRegex =
      /<a[^>]*>([\w\s.']+)<\/a><\/th>\s*<th[^>]*>([\d.]+)<\/th>\s*<th[^>]*>(\d+)<\/th>\s*<th[^>]*>(\d+)<\/th>\s*<th[^>]*>(\d+)<\/th>/;
    const bowlerMatch = html.match(bowlRegex);
    const bowler = bowlerMatch
      ? {
          name: bowlerMatch[1].trim(),
          overs: bowlerMatch[2],
          runs: bowlerMatch[4],
          wickets: bowlerMatch[5],
        }
      : null;

    return new Response(
      JSON.stringify({
        ok: true,
        battingTeam,
        bowlingTeam,
        innings1,
        innings2,
        target,
        striker,
        nonStriker,
        bowler,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
