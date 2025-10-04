export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const matchId = url.searchParams.get("matchId");
    const clubId = url.searchParams.get("clubId");

    if (!matchId || !clubId)
      return new Response(JSON.stringify({ error: "Missing matchId or clubId" }), { status: 400 });

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

      // --- META INFO (teams & scores)
      const descMatch =
        html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) ||
        html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
        html.match(/<title>(.*?)<\/title>/i);

      const desc = descMatch ? descMatch[1] : "";

      // Example: "Royal 131/10(20.0 overs) Hindustan Hurricanes 60/0(8.0 overs)"
      const infoPattern =
        /([A-Za-z\s]+)\s(\d+\/\d+)\(?([\d.]+)\s*overs?\)?\s*([A-Za-z\s]+)\s(\d+\/\d+)\(?([\d.]+)\s*overs?\)?/i;
      const m = desc.match(infoPattern);

      let team1 = "Team A",
        team2 = "Team B",
        innings1: any = {},
        innings2: any = {};

      if (m) {
        [, team1, innings1.score, innings1.overs, team2, innings2.score, innings2.overs] = m;
      }

      // Decide who’s batting
      const battingTeam =
        parseInt(innings2.score?.split("/")[0] || "0") > 0 ? team2.trim() : team1.trim();
      const bowlingTeam = battingTeam === team1.trim() ? team2.trim() : team1.trim();

      const target =
        parseInt(innings1.score?.split("/")[0] || "0") > 0
          ? parseInt(innings1.score.split("/")[0]) + 1
          : null;

      // --- BATSMEN TABLE
      const batSection = html.match(/\| Batter \| R \| B \| 4s \| 6s \| SR \|([\s\S]*?)\| Bowler \|/i);
      let striker: any = null,
        nonStriker: any = null;

      if (batSection) {
        const rows = batSection[1]
          .split("\n")
          .map((r) => r.trim())
          .filter((r) => /^\| \[.*?\]/.test(r));

        const parseRow = (row: string) => {
          const parts = row.split("|").map((p) => p.trim());
          return {
            name: parts[1]?.replace(/\[|\]/g, "") || "",
            runs: parts[2] || "0",
            balls: parts[3] || "0",
            fours: parts[4] || "0",
            sixes: parts[5] || "0",
            sr: parts[6] || "0",
          };
        };

        if (rows[0]) striker = parseRow(rows[0]);
        if (rows[1]) nonStriker = parseRow(rows[1]);
      }

      // --- BOWLER TABLE
      const bowlSection = html.match(/\| Bowler \| O \| M \| R \| W \| Econ \|([\s\S]*?)(?:###|-\s|<\/div>|$)/i);
      let bowler: any = null;

      if (bowlSection) {
        const row = bowlSection[1]
          .split("\n")
          .map((r) => r.trim())
          .find((r) => /^\| \[.*?\]/.test(r));

        if (row) {
          const parts = row.split("|").map((p) => p.trim());
          bowler = {
            name: parts[1]?.replace(/\[|\]/g, "") || "",
            overs: parts[2] || "0",
            runs: parts[4] || "0",
            wickets: parts[5] || "0",
            econ: parts[6] || "0",
          };
        }
      }

      const payload = {
        battingTeam,
        bowlingTeam,
        score: innings2.score || innings1.score || "0/0",
        overs: innings2.overs || innings1.overs || "0.0",
        target,
        striker,
        nonStriker,
        bowler,
      };

      return new Response(JSON.stringify(payload, null, 2), {
        headers: { "content-type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  },
};
