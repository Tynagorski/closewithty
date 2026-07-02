// Netlify Function: debrief
// Returns: { rate30, rate15, news[] }
// Env vars needed:
//   FRED_API_KEY  — free at https://fred.stlouisfed.org/docs/api/api_key.html
//   (optional) NEWS_RSS_URL — override RSS feed URL

exports.handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600' // cache 1 hour
  };

  const [rates, news] = await Promise.allSettled([fetchRates(), fetchNews()]);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      rate30: rates.status === 'fulfilled' ? rates.value.rate30 : null,
      rate15: rates.status === 'fulfilled' ? rates.value.rate15 : null,
      news:   news.status  === 'fulfilled' ? news.value         : []
    })
  };
};

// ── Freddie Mac rates via FRED API ────────────────────────────
async function fetchRates() {
  const key = process.env.FRED_API_KEY;
  if (!key) return { rate30: null, rate15: null };

  const base = 'https://api.stlouisfed.org/fred/series/observations';
  const params = `&api_key=${key}&sort_order=desc&limit=1&file_type=json`;

  const [r30, r15] = await Promise.all([
    fetch(`${base}?series_id=MORTGAGE30US${params}`).then(r => r.json()),
    fetch(`${base}?series_id=MORTGAGE15US${params}`).then(r => r.json())
  ]);

  return {
    rate30: r30.observations?.[0]?.value || null,
    rate15: r15.observations?.[0]?.value || null
  };
}

// ── Real estate news, parsed directly from Google News RSS ───
// (Previously proxied through rss2json.com, which unreliably fails
// to fetch Google News' feed — fetching and parsing the XML
// ourselves removes that point of failure entirely.)
async function fetchNews() {
  const rssUrl = process.env.NEWS_RSS_URL ||
    'https://news.google.com/rss/search?q=mortgage+real+estate+rates+housing&hl=en-US&gl=US&ceid=US:en';

  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CloseWithTyBot/1.0; +https://closewithty.com)' }
  });
  if (!res.ok) return [];

  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return items.slice(0, 4).map(block => {
    const rawTitle = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const sourceMatch = block.match(/<source[^>]*>([^<]*)<\/source>/);
    const source = sourceMatch ? decodeEntities(sourceMatch[1]) : extractDomain(link);
    return {
      title: decodeEntities(rawTitle).replace(/ - [^-]+$/, ''), // strip trailing " - Source" from title
      link,
      source,
      date: formatDate(extractTag(block, 'pubDate'))
    };
  }).filter(item => item.title && item.link);
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return '';
  return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}
