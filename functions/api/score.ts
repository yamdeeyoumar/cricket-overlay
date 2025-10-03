export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const clubId = url.searchParams.get("clubId");
  const matchId = url.searchParams.get("matchId");
  const matchUrl = url.searchParams.get("matchUrl");

  if (!matchUrl && !(clubId && matchId)) {
    return json({ error: "Need ?matchUrl or ?clubId+matchId" }, 400);
  }
  const target = matchUrl ??
    `https://cricclubs.com/QCF/viewScorecard.do?matchId=${matchId}&clubId=${clubId}`;

  try {
    const res = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();

    // Use a DOM parser library: since in Cloudflare Workers there's no full DOM,
    // we can do string + regex parsing. We'll do rough parsing:

    // 1. Team names (look for <div class="teamName"> or headings)
    const teamMatch = html.match(/<div[^>]*class="teamName"[^>]*>([^<]+)<\/div>[^<]*<div[^>]*class="teamName"[^>]*>([^<]+)<\/div>/i);
    let teamA = "Team A", teamB = "Team B";
    if (teamMatch) {
      teamA = teamMatch[1].trim();
      teamB = teamMatch[2].trim();
    }

    // 2. Score line: runs/wkts (overs)
    const scoreRe = /(\d{1,3})\/(\d{1,2})\s*\((\d{1,2}(?:\.\d)?)\s*ov\)/i;
    const scoreMatch = html.match(scoreRe);
    let runs = 0, wickets = 0, overs = "0.0";
    if (scoreMatch) {
      runs = +scoreMatch[1];
      wickets = +scoreMatch[2];
      overs = scoreMatch[3];
    }

    // 3. Extract batsmen table: we look for rows in table with class or <td> positions
    //   We search a table where batsmen are listed, e.g. "Batsmen / How Out / Runs / Balls"
    //   Use regex to capture two first batsmen lines.
    const batsRegex = /<table[^>]*class="table table-bordered"[^>]*>([\s\S]*?)<\/table>/i;
    const batTable = html.match(batsRegex)?.[1] || "";
    // split rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows = [];
    let mrow;
    while ((mrow = rowRegex.exec(batTable))) {
      const row = mrow[1];
      rows.push(row);
    }
    let striker = null, nonStriker = null;
    // skip header row (first). Then first two data rows.
    for (let i = 1; i <= 2 && i < rows.length; i++) {
      const cols = rows[i].split(/<td[^>]*>/).map(s => s.replace(/<[^>]+>/g, "").trim());
      // typically columns are: Batsman name, how out, runs, balls, etc.
      // So: cols[1] name, cols[2] how out, cols[3] runs, cols[4] balls ...
      const name = cols[1];
      const runsB = +cols[3] || 0;
      const ballsB = +cols[4] || 0;
      if (i === 1) {
        striker = { name, runs: runsB, balls: ballsB };
      } else {
        nonStriker = { name, runs: runsB, balls: ballsB };
      }
    }

    // 4. Extract bowler table: similar method
    const bowlRegex = /<div[^>]*id="bowling"[^>]*>([\s\S]*?)<\/div>/i;
    const bowlDiv = html.match(bowlRegex)?.[1] || "";
    const bowlTableMatch = bowlDiv.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    let bowler = null;
    if (bowlTableMatch) {
      const bowlTable = bowlTableMatch[1];
      const bowlRows = [];
      let br;
      const brRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      while ((br = brRegex.exec(bowlTable))) {
        bowlRows.push(br[1]);
      }
      // skip header (row 0); take first data row (current bowler)
      if (bowlRows.length > 1) {
        const cols = bowlRows[1].split(/<td[^>]*>/).map(s => s.replace(/<[^>]+>/g, "").trim());
        // typical: bowler name, overs, maidens, runs, wickets, etc.
        const name = cols[1];
        const o = cols[2];
        const r = +cols[4] || 0;
        const w = +cols[5] || 0;
        bowler = { name, overs: o, runs: r, wickets: w };
      }
    }

    const data = {
      battingTeam: { name: teamA },
      bowlingTeam: { name: teamB },
      score: { runs, wickets, overs },
      striker, nonStriker, bowler,
      status: "LIVE",
      lastUpdated: new Date().toISOString(),
    };

    return json(data);
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
