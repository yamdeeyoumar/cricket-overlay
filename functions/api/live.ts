export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const matchId = url.searchParams.get("matchId");
    const clubId = url.searchParams.get("clubId");

    if (!matchId || !clubId) {
      return new Response(JSON.stringify({ error: "Missing matchId or clubId" }), { status: 400 });
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

      // --- Extract meta info (for teams and scores) ---
      const descMatch =
        html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) ||
        html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
        html.match(/<title>(.*?)<\/title>/i);

      const desc = descMatch ? descMatch[1] : "";

      const infoPattern =
        /([A-Za-z\s]+)\s(\d+\/\d+)\(?([\d\.]+)\s*overs?\)?\s*([A-Za-z\s]+)\s(\d+\/\d+)\(?([\d\.]+)\s*overs?\)?/i;
      const m = desc.match(infoPattern);

      let team1 = "Team A",
        team2 = "Team B",
        innings1: any = {},
        innings2: any = {};

      if (m) {
        [, team1, innings1.score, innings1.overs, team2, innings2.score, innings2.overs] = m;
      }

      // Determine batting/bowling
      const battingTeam =
        parseInt(innings2.score?.split("/")[0] || "0") > 0 ? team2.trim() : team1.trim();
      const bowlingTeam = battingTeam === team1.trim() ? team2.trim() : team1.trim();

      const target =
        parseInt(innings1.score?.split("/")[0] || "0") > 0
          ? parseInt(innings1.score.split("/")[0]) + 1
          : null;

      // --- Extract batting table ---
      const batTableMatch = html.match(
        /\| Batter \| R \| B \| 4s \| 6s \| SR \|([\s\S]*?)\| Bowler \|/i
      );
      let striker: any = null,
        nonStriker: any = null;

      if (batTableMatch) {
        const rows = batTableMatch[1]
          .split("\n")
          .map((r) => r.trim())
          .filter((r) => r.startsWith("| ["));

        if (rows.length > 0) {
          const parseBatter = (row: string) => {
            const cells = row.split("|").map((c) => c.replace(/\*\*/g, "").trim());
            return {
              name: cells[1].replace(/\[|\]/g, ""),
              runs: cells[2],
              balls: cells[3],
              fours: cells[4],
              sixes: cells[5],
              sr: cells[6],
            };
          };
          striker = parseBatter(rows[0]);
          if (rows[1]) nonStriker = parseBatter(rows[1]);
        }
      }

      // --- Extract bowling table ---
      const bowlMatch = html.match(/\| Bowler \| O \| M \| R \| W \| Econ \|([\s\S]*?)\n\n/i);
      let bowler: any = null;

      if (bowlMatch) {
        const row = bowlMatch[1].split("\n").find((r) => r.startsWith("| ["));
        if (row) {
          const cells = row.split("|").map((c) => c.replace(/\*\*/g, "").trim());
          bowler = {
            name: cells[1].replace(/\[|\]/g, ""),
            overs: cells[2],
            runs: cells[4],
            wickets: cells[5],
            econ: cells[6],
          };
        }
      }

      const payload = {
        battingTeam,
        bowlingTeam,
        score: innings2.score || innings1.score,
        overs: innings2.overs || innings1.overs,
        target,
        striker,
        nonStriker,
        bowler,
      };

      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  },
};
