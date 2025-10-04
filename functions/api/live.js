export default {
  async fetch(req) {
    const url = new URL(req.url);
    const matchId = url.searchParams.get("matchId");
    const clubId = url.searchParams.get("clubId");

    if (!matchId || !clubId) {
      return new Response(JSON.stringify({ error: "Missing matchId or clubId" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // ✅ Use ball-by-ball instead of fullScorecard
    const target = `https://cricclubs.com/QCF/ballbyball.do?matchId=${matchId}&clubId=${clubId}`;

    try {
      const res = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "text/html,application/xhtml+xml",
        },
      });

      const html = await res.text();

      // --- Extract top teams and score ---
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      let battingTeam = "Team A", bowlingTeam = "Team B";
      let score = "", overs = "";

      if (titleMatch) {
        const t = titleMatch[1].match(/(.+?)\s(\d+\/\d+)\s*\(([\d.]+)\/20 ov/i);
        if (t) {
          battingTeam = t[1].trim();
          score = t[2];
          overs = t[3];
        }
      }

      // --- Extract batters table ---
      const batsmen = [];
      const batRegex =
        /<th><a[^>]*?>([^<]+)<\/a><\/th>[\s\S]*?<th[^>]*>(\d+)<\/th>[\s\S]*?<th[^>]*>(\d+)<\/th>[\s\S]*?<th[^>]*>(\d+)<\/th>[\s\S]*?<th[^>]*>(\d+)<\/th>/g;

      let m;
      while ((m = batRegex.exec(html)) && batsmen.length < 2) {
        batsmen.push({
          name: m[1].trim(),
          runs: m[2],
          balls: m[3],
          fours: m[4],
          sixes: m[5],
        });
      }

      // --- Extract current bowler ---
      const bowlRegex =
        /<th><a[^>]*?>([^<]+)<\/a><\/th>[\s\S]*?<th[^>]*>([\d.]+)<\/th>[\s\S]*?<th[^>]*>(\d+)<\/th>[\s\S]*?<th[^>]*>(\d+)<\/th>[\s\S]*?<th[^>]*>(\d+)<\/th>/;
      const b = html.match(bowlRegex);
      const bowler = b
        ? {
            name: b[1].trim(),
            overs: b[2],
            maidens: b[3],
            runs: b[4],
            wickets: b[5],
          }
        : null;

      return new Response(
        JSON.stringify({
          ok: true,
          battingTeam,
          bowlingTeam,
          score,
          overs,
          batsmen,
          bowler,
        }),
        { headers: { "content-type": "application/json" } }
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
};
