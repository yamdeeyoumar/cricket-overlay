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

  const targetUrl = `https://cricclubs.com/QCF/ballbyball.do?matchId=${matchId}&clubId=${clubId}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml",
        "Referer": "https://cricclubs.com/",
      },
    });

    const html = await res.text();

    // --- Extract team info from scoreboard header ---
    const teamPattern =
      /<span class="teamName">([^<]+)<\/span>[\s\S]*?<span>([\d/]+)<\/span>[\s\S]*?(\d+(?:\.\d+)?)\s*ov[\s\S]*?<span class="teamName">([^<]+)<\/span>[\s\S]*?<span>([\d/]+)<\/span>[\s\S]*?(\d+(?:\.\d+)?)\s*ov/;
    const match = html.match(teamPattern);

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
    const targetScore =
      innings1.score && parseInt(innings1.score)
        ? parseInt(innings1.score.split("/")[0]) + 1
        : null;

    // --- Extract batsmen table (current striker & non-striker) ---
    const batTableRegex =
      /<table[^>]*id="battingTable"[^>]*>([\s\S]*?)<\/table>/i;
    const batTable = html.match(batTableRegex);
    const batsmen = [];

    if (batTable) {
      const rowRegex =
        /<tr[^>]*>\s*<td[^>]*>(?:<a[^>]*>)?([^<]+?)(?:<\/a>)?<\/td>[\s\S]*?<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>/g;
      let m;
      while ((m = rowRegex.exec(batTable[1])) && batsmen.length < 2) {
        batsmen.push({
          name: m[1].trim(),
          runs: m[2],
          balls: m[3],
        });
      }
    }

    const striker = batsmen[0] || null;
    const nonStriker = batsmen[1] || null;

    // --- Extract bowler table (top of the list) ---
    const bowlTableRegex =
      /<table[^>]*id="bowlingTable"[^>]*>([\s\S]*?)<\/table>/i;
    const bowlTable = html.match(bowlTableRegex);
    let bowler = null;

    if (bowlTable) {
      const bowlRowRegex =
        /<tr[^>]*>\s*<td[^>]*>(?:<a[^>]*>)?([^<]+?)(?:<\/a>)?<\/td>[\s\S]*?<td[^>]*>([\d.]+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>/;
      const b = bowlTable[1].match(bowlRowRegex);
      if (b) {
        bowler = {
          name: b[1].trim(),
          overs: b[2],
          runs: b[4],
          wickets: b[5],
        };
      }
    }

    // --- Return JSON response ---
    return new Response(
      JSON.stringify(
        {
          ok: true,
          battingTeam,
          bowlingTeam,
          innings1,
          innings2,
          target: targetScore,
          striker,
          nonStriker,
          bowler,
        },
        null,
        2
      ),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}