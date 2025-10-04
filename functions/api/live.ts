// pages/api/live.ts
export default async function handler(req, res) {
  const { matchId, clubId } = req.query;
  if (!matchId || !clubId)
    return res.status(400).json({ error: "Missing matchId or clubId" });

  const targetUrl = `https://cricclubs.com/QCF/ballbyball.do?matchId=${matchId}&clubId=${clubId}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://cricclubs.com/",
      },
    });

    const html = await response.text(); // ✅ parse as text
    // Basic check — if HTML is a login page or blank
    if (!html || html.startsWith("<!DOCTYPE") === false)
      return res.status(500).json({ error: "Unexpected response", preview: html.slice(0, 200) });

    // 🏏 Try extracting title/meta (score + overs info)
    const meta =
      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) ||
      html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
      html.match(/<title>(.*?)<\/title>/i);

    const desc = meta ? meta[1] : "";

    // "Royal 131/10(20.0 overs) Hindustan Hurricanes 60/0(8.0 overs)"
    const infoPattern =
      /([A-Za-z\s]+)\s(\d+\/\d+)\(?([\d.]+)\s*overs?\)?\s*([A-Za-z\s]+)\s(\d+\/\d+)\(?([\d.]+)\s*overs?\)?/i;
    const m = desc.match(infoPattern);

    let team1 = "Team A",
      team2 = "Team B",
      innings1: any = {},
      innings2: any = {};

    if (m) [, team1, innings1.score, innings1.overs, team2, innings2.score, innings2.overs] = m;

    const battingTeam =
      parseInt(innings2.score?.split("/")[0] || "0") > 0 ? team2.trim() : team1.trim();
    const bowlingTeam = battingTeam === team1.trim() ? team2.trim() : team1.trim();

    const target =
      parseInt(innings1.score?.split("/")[0] || "0") > 0
        ? parseInt(innings1.score.split("/")[0]) + 1
        : null;

    // 🧩 Batter parsing
    const batTable = html.match(/\| Batter \| R \| B \| 4s \| 6s \| SR \|([\s\S]*?)\| Bowler \|/i);
    let striker = null,
      nonStriker = null;

    if (batTable) {
      const rows = batTable[1]
        .split("\n")
        .map((r) => r.trim())
        .filter((r) => /^\| \[.*?\]/.test(r));

      const parseRow = (r: string) => {
        const c = r.split("|").map((p) => p.trim());
        return {
          name: c[1]?.replace(/\[|\]/g, "") || "",
          runs: c[2] || "0",
          balls: c[3] || "0",
          fours: c[4] || "0",
          sixes: c[5] || "0",
          sr: c[6] || "0",
        };
      };

      if (rows[0]) striker = parseRow(rows[0]);
      if (rows[1]) nonStriker = parseRow(rows[1]);
    }

    // 🧩 Bowler parsing
    const bowlTable = html.match(/\| Bowler \| O \| M \| R \| W \| Econ \|([\s\S]*?)(?:###|-\s|<\/div>|$)/i);
    let bowler = null;

    if (bowlTable) {
      const row = bowlTable[1]
        .split("\n")
        .map((r) => r.trim())
        .find((r) => /^\| \[.*?\]/.test(r));
      if (row) {
        const c = row.split("|").map((p) => p.trim());
        bowler = {
          name: c[1]?.replace(/\[|\]/g, "") || "",
          overs: c[2] || "0",
          runs: c[4] || "0",
          wickets: c[5] || "0",
          econ: c[6] || "0",
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

    return res.status(200).json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
