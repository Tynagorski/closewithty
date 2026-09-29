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
      rateDate: rates.status === 'fulfilled' ? rates.value.rateDate : null,
      news:   news.status  === 'fulfilled' ? news.value         : []
    })
  };
};

// ── Freddie Mac PMMS rates ────────────────────────────────────
//
// Two sources, in order. FRED first when a key is configured, because it is a
// clean JSON API. Freddie Mac's own published CSV second, because it needs no
// key at all — and a card that only works once somebody remembers to set an
// environment variable is a card that shows an em-dash for months.
//
// The CSV is the same PMMS series the card already credits in its label, so
// this is not a different number from a different place.
//
// Everything degrades to null, which the front end renders as "Call for
// today's rate". A source that is down, moved, or has changed its columns
// costs nothing beyond the rate not appearing — which is the state this
// replaces.
async function fetchRates() {
  const fromFred = await tryFred().catch(() => null);
  if (fromFred && fromFred.rate30) return fromFred;

  const fromCsv = await tryPmmsCsv().catch(() => null);
  if (fromCsv && fromCsv.rate30) return fromCsv;

  return { rate30: null, rate15: null, rateDate: null };
}

async function tryFred() {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;

  const base = 'https://api.stlouisfed.org/fred/series/observations';
  const params = `&api_key=${key}&sort_order=desc&limit=1&file_type=json`;

  const [r30, r15] = await Promise.all([
    fetch(`${base}?series_id=MORTGAGE30US${params}`).then(r => r.json()),
    fetch(`${base}?series_id=MORTGAGE15US${params}`).then(r => r.json())
  ]);

  return {
    rate30: cleanRate(r30.observations?.[0]?.value),
    rate15: cleanRate(r15.observations?.[0]?.value),
    rateDate: surveyWeek(r30.observations?.[0]?.date)
  };
}

// Freddie Mac publishes the weekly survey as a plain CSV with no key.
async function tryPmmsCsv() {
  const res = await fetch('https://www.freddiemac.com/pmms/docs/PMMS_history.csv', {
    headers: { 'User-Agent': 'CloseWithTyBot/1.0 (+https://closewithty.com)' }
  });
  if (!res.ok) return null;
  return parsePmms(await res.text());
}

// Split out and exported so it can be tested without a network call.
//
// Columns are located by name rather than by position: the header has been
// through more than one shape over the years, and a hard-coded index silently
// reads the wrong column rather than failing, which would put a made-up number
// on the page. Anything that does not parse as a plausible rate yields null.
function parsePmms(csv) {
  const lines = String(csv).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const find = (re) => header.findIndex(h => re.test(h));
  // "pmms30", "30yr", "30-year fixed rate mortgage average" have all appeared.
  const i30 = find(/(^|[^0-9])30/);
  const i15 = find(/(^|[^0-9])15/);
  const iDate = find(/date|week/);
  if (i30 === -1) return null;

  // Newest row last. Walk backwards to the most recent row that actually has a
  // 30-year figure — the tail can carry blanks or a partial week.
  for (let i = lines.length - 1; i > 0; i--) {
    const cols = lines[i].split(',');
    const r30 = cleanRate(cols[i30]);
    if (!r30) continue;
    return {
      rate30: r30,
      rate15: i15 === -1 ? null : cleanRate(cols[i15]),
      rateDate: iDate === -1 ? null : surveyWeek(cols[iDate])
    };
  }
  return null;
}

// A rate is a number in a believable range. Rejecting the implausible is the
// point: a header row, an "N/A", or a column that turned out to be a spread
// would otherwise render as a mortgage rate.
function cleanRate(v) {
  if (v === undefined || v === null) return null;
  const n = parseFloat(String(v).trim());
  if (!Number.isFinite(n) || n <= 0 || n > 25) return null;
  return n.toFixed(2);
}

// The survey week, rendered as "Sep 25, 2026".
//
// PMMS is a weekly survey, so a bare number invites the question this label
// answers: how old is it. Formatted in UTC deliberately — the dates arrive as
// plain YYYY-MM-DD, which Date parses as UTC midnight, and formatting that in a
// negative-offset zone would report the previous day.
function surveyWeek(value) {
  if (!value) return null;
  const raw = String(value).trim();
  // Date is far too willing: new Date('6.26') is June 26, 2001. If the column
  // heuristic picked up a rate, that would print as a real-looking survey week.
  // Require an unambiguous 4-digit year before parsing anything.
  if (!/(^|\D)\d{4}(\D|$)/.test(raw)) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  // A date far outside the plausible range means the column was not a date.
  const year = d.getUTCFullYear();
  if (year < 1971 || year > new Date().getUTCFullYear() + 1) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  });
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

// Exported for tests; harmless in the Netlify runtime.
module.exports.parsePmms = parsePmms;
module.exports.cleanRate = cleanRate;
module.exports.surveyWeek = surveyWeek;
