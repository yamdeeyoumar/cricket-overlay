export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // === /api/test endpoint ===
    if (url.pathname.startsWith("/api/test")) {
      return new Response(
        JSON.stringify({ ok: true, msg: "Cloudflare Worker routing active!" }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // === /api/live endpoint ===
    if (url.pathname.startsWith("/api/live")) {
      const matchId = url.searchParams.get("matchId");
      const clubId = url.searchParams.get("clubId");

      if (!matchId || !clubId) {
        return new Response(
          JSON.stringify({ error: "Missing matchId or clubId" }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        );
      }

      const target = `https://cricclubs.com/QCF/fullScorecard.do?matchId=${matchId}&clubId=${clubId}`;

      try {
        const res = await fetch(target, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            Accept: "text/html,application/xhtml+xml",
            Referer: "https://cricclubs.com/",
          },
        });

        const html = await res.text();

        // Extract meta / title description (has score summary)
        const descMatch =
          html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i) ||
          html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
          html.match(/<title>(.*?)<\/title>/i);
        const desc = descMatch ? descMatch[1] : "";

        const pattern =
          /([A-Za-z\s]+)\s(\d+\/\d+)\s*\(?([\d.]+)\s*overs?\)?\s*([A-Za-z\s]+)\s(\d+\/\d+)\s*\(?([\d.]+)\s*overs?\)?/i;
        const m = desc.match(pattern);

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

        const battingTeam =
          parseInt((innings2.score || "0").split("/")[0]) > 0 ? team2 : team1;
        const bowlingTeam = battingTeam === team1 ? team2 : team1;
        const target =
          innings1.score ? parseInt(innings1.score.split("/")[0]) + 1 : null;

        const payload = {
          ok: true,
          battingTeam,
          bowlingTeam,
          innings1,
          innings2,
          target,
        };

        return new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }

    // === default fallback: serve static files ===
    return env.ASSETS.fetch(request);
  },
};
