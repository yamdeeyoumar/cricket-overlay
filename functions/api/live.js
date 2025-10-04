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

    // Extract team names and scores from the VS section
    const vsPattern = /<li class="win"[^>]*>\s*<span class="teamName">([^<]+)<\/span>\s*<span>(\d+\/\d+)<\/span>\s*<br\/>\s*<p[^>]*>\s*([\d.]+)\s*\/\d+\s*ov/gi;
    
    let team1 = "Team A", team2 = "Team B";
    let innings1 = {}, innings2 = {};
    
    const matches = [...html.matchAll(vsPattern)];
    
    if (matches.length >= 1) {
      team1 = matches[0][1].trim();
      innings1 = { score: matches[0][2], overs: matches[0][3] };
    }
    
    if (matches.length >= 2) {
      team2 = matches[1][1].trim();
      innings2 = { score: matches[1][2], overs: matches[1][3] };
    }

    // Determine batting team (team with current innings)
    const battingTeam = parseInt((innings2.score || "0/0").split("/")[0]) > 0 ? team2 : team1;
    const bowlingTeam = battingTeam === team1 ? team2 : team1;
    
    // Calculate target
    const targetScore = innings1.score ? parseInt(innings1.score.split("/")[0]) + 1 : null;

    // Extract current batsmen from the batting table
    const batTableRegex = /<table[^>]*class="table"[^>]*>[\s\S]*?<thead>[\s\S]*?<th>Batter<\/th>[\s\S]*?<\/thead>\s*<tbody>([\s\S]*?)<\/tbody>/i;
    const batTable = html.match(batTableRegex);
    const batsmen = [];

    if (batTable) {
      const rowRegex = /<th><a[^>]*>([^<]+)<\/a><\/th>\s*<th[^>]*><strong>(\d+)<\/strong><\/th>\s*<th[^>]*>(\d+)<\/th>/g;
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