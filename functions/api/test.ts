export default async function handler(req, res) {
  const { matchId = "3566", clubId = "1834" } = req.query;
  const url = `https://cricclubs.com/QCF/ballbyball.do?matchId=${matchId}&clubId=${clubId}`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml",
      "Referer": "https://cricclubs.com/",
    },
  });
  const html = await r.text();
  res.status(200).send(html.slice(0, 500)); // just return HTML snippet
}
