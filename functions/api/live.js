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
    // Look for the schedule-logo section which contains team names
    const scheduleSection = /<div class="schedule-logo[^"]*"[\s\S]*?<ul class="list-inline"[\s\S]*?<\/ul>/i;
    const scheduleMatch = html.match(scheduleSection);
    
    let team1 = "Team A", team2 = "Team B";
    let innings1 = {}, innings2 = {};
    
    if (scheduleMatch) {
      // Pattern to match each team's complete info block
      const winBlockPattern = /<li class="win"[^>]*>([\s\S]*?)<\/li>/g;
      const winBlocks = [...scheduleMatch[0].matchAll(winBlockPattern)];
      
      if (winBlocks.length >= 1) {
        const block1 = winBlocks[0][1];
        const name1 = block1.match(/<span class="teamName">([^<]+)<br>/);
        const score1 = block1.match(/<span>(\d+\/\d+)<\/span>/);
        const overs1 = block1.match(/([\d.]+)\s*\/\d+\s*(?:ov|Overs)/i);
        
        if (name1) team1 = name1[1].trim();
        if (score1) innings1.score = score1[1];
        if (overs1) innings1.overs = overs1[1];
      }
      
      if (winBlocks.length >= 2) {
        const block2 = winBlocks[1][1];
        const name2 = block2.match(/<span class="teamName">([^<]+)<br>/);
        const score2 = block2.match(/<span>(\d+\/\d+)<\/span>/);
        const overs2 = block2.match(/([\d.]+)\s*\/\d+\s*(?:ov|Overs)/i);
        
        if (name2) team2 = name2[1].trim();
        if (score2) innings2.score = score2[1];
        if (overs2) innings2.overs = overs2[1];
        else innings2.overs = "0"; // If no overs found, set to 0
      }
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