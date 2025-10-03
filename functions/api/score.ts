import { CheerioAPI, load } from "cheerio";

export interface Env { }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const clubId = url.searchParams.get("clubId");
    const matchId = url.searchParams.get("matchId");

    if (!clubId || !matchId) {
      return new Response(JSON.stringify({ error: "Missing clubId or matchId" }), { status: 400 });
    }

    const target = `https://cricclubs.com/QCF/viewScorecard.do?matchId=${matchId}&clubId=${clubId}`;

    try {
      // Add browser-like headers so CricClubs doesn’t block the request
      const res = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Connection": "keep-alive",
          "Referer": "https://cricclubs.com/"
        }
      });

      if (!res.ok) {
        return new Response(JSON.stringify({ error: `Upstream error ${res.status}` }), { status: 502 });
      }

      const html = await res.text();
      const $: CheerioAPI = load(html);

      // --- Extract team names ---
      const teams = $(".teamTitle").map((_, el) => $(el).text().trim()).get();
      const battingTeam = teams[0] || "Team A";
      const bowlingTeam = teams[1] || "Team B";

      // --- Extract score (runs/wickets/overs) ---
      const scoreText = $(".score").first().text().trim(); // Example: "123/4 (15.2)"
      const scoreMatch = scoreText.match(/(\d+)\/(\d+)\s*\(([\d.]+)\)/);
      const score = scoreMatch ? {
        runs: parseInt(scoreMatch[1]),
        wickets: parseInt(scoreMatch[2]),
        overs: scoreMatch[3]
      } : null;

      // --- Extract striker and non-striker (current batsmen) ---
      const batsmen = $("#batsman tbody tr").map((_, el) => {
        const cols = $(el).find("td").map((_, td) => $(td).text().trim()).get();
        if (cols.length >= 3) {
          return {
            name: cols[0],
            runs: parseInt(cols[1]) || 0,
            balls: parseInt(cols[2]) || 0
          };
        }
        return null;
      }).get().filter(b => b);

      const striker = batsmen[0] || null;
      const nonStriker = batsmen[1] || null;

      // --- Extract current bowler ---
      const bowlerRow = $("#bowler tbody tr").first();
      const bowlerCols = bowlerRow.find("td").map((_, td) => $(td).text().trim()).get();
      const bowler = bowlerCols.length >= 5 ? {
        name: bowlerCols[0],
        overs: bowlerCols[1],
        maidens: bowlerCols[2],
        runs: parseInt(bowlerCols[3]) || 0,
        wickets: parseInt(bowlerCols[4]) || 0
      } : null;

      return new Response(JSON.stringify({
        battingTeam: { name: battingTeam },
        bowlingTeam: { name: bowlingTeam },
        score,
        striker,
        nonStriker,
        bowler
      }), {
        headers: { "content-type": "application/json" }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
}
