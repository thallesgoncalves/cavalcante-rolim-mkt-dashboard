// Pulls daily account insights + recent post engagement for the
// @cavalcanteerolim Instagram Business account via the Meta Graph API and
// writes them to data/instagram_organic.json for the dashboard.
//
// Requires Node 18+ (built-in fetch). Envs:
//   META_ORGANIC_ACCESS_TOKEN (preferred) or META_ACCESS_TOKEN — a Page/System
//     User token with instagram_basic, instagram_manage_insights and
//     pages_read_engagement. The other dashboard's META_ACCESS_TOKEN (ads_read
//     only) will likely fail here with a permissions error — if so, generate
//     a separate META_ORGANIC_ACCESS_TOKEN with the scopes above.
//   INSTAGRAM_BUSINESS_ID (optional) — skips the Page lookup below if set.
//   INSTAGRAM_USERNAME (optional, default "cavalcanteerolim") — used to pick
//     the right Page when the token manages more than one.
//
// If no token is configured, this writes `configured: false` and exits 0
// instead of failing the workflow, so the other two sources keep updating
// while Instagram token setup is pending.

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.META_ORGANIC_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
const EXPLICIT_IG_ID = process.env.INSTAGRAM_BUSINESS_ID;
const USERNAME = process.env.INSTAGRAM_USERNAME || "cavalcanteerolim";

const API_VERSION = "v21.0";
const DAYS_BACK = 90;
const INSIGHTS_WINDOW_DAYS = 30; // Graph API day-level insights cap the lookback per call.
const TOP_POSTS_LIMIT = 12;
const OUT_PATH = path.join(__dirname, "..", "data", "instagram_organic.json");

function writeUnconfigured(reason) {
  console.log(`Instagram organic not configured yet: ${reason}`);
  const payload = {
    generated_at: new Date().toISOString(),
    source: "instagram-graph-api",
    configured: false,
    account: USERNAME,
    followers_count: 0,
    days_back: DAYS_BACK,
    rows: [],
    top_posts: [],
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
}

async function graphGet(pathAndQuery) {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${pathAndQuery}${sep}access_token=${TOKEN}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API request failed for ${pathAndQuery.split("?")[0]}: ${res.status} — ${body.slice(0, 400)}`);
  }
  return res.json();
}

async function resolveInstagramBusinessId() {
  if (EXPLICIT_IG_ID) return EXPLICIT_IG_ID;

  const accounts = await graphGet("me/accounts?fields=name,instagram_business_account{username}&limit=100");
  const pages = accounts.data || [];
  const withIg = pages.filter((p) => p.instagram_business_account);

  const exact = withIg.find(
    (p) => (p.instagram_business_account.username || "").toLowerCase() === USERNAME.toLowerCase()
  );
  if (exact) return exact.instagram_business_account.id;

  if (withIg.length === 1) return withIg[0].instagram_business_account.id;

  throw new Error(
    withIg.length === 0
      ? `Token has no Pages with a linked Instagram Business account (checked ${pages.length} page(s)).`
      : `Multiple Pages with Instagram Business accounts and none matched username "${USERNAME}" — set INSTAGRAM_BUSINESS_ID explicitly.`
  );
}

function dateWindows(days, chunkDays) {
  const windows = [];
  const to = new Date();
  let windowEnd = new Date(to);
  let remaining = days;
  while (remaining > 0) {
    const span = Math.min(chunkDays, remaining);
    const windowStart = new Date(windowEnd);
    windowStart.setDate(windowStart.getDate() - span);
    windows.push({ since: windowStart, until: windowEnd });
    windowEnd = windowStart;
    remaining -= span;
  }
  return windows;
}

async function fetchDailyInsights(igId) {
  const byDate = new Map();
  for (const { since, until } of dateWindows(DAYS_BACK, INSIGHTS_WINDOW_DAYS)) {
    const sinceUnix = Math.floor(since.getTime() / 1000);
    const untilUnix = Math.floor(until.getTime() / 1000);
    const body = await graphGet(
      `${igId}/insights?metric=reach,profile_views&period=day&since=${sinceUnix}&until=${untilUnix}`
    );
    for (const metric of body.data || []) {
      for (const point of metric.values || []) {
        const date = (point.end_time || "").slice(0, 10);
        if (!date) continue;
        if (!byDate.has(date)) byDate.set(date, { date, reach: 0, profile_views: 0 });
        byDate.get(date)[metric.name] = point.value || 0;
      }
    }
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fetchTopPosts(igId) {
  const body = await graphGet(
    `${igId}/media?fields=id,caption,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=${TOP_POSTS_LIMIT}`
  );
  return (body.data || []).map((m) => ({
    id: m.id,
    caption: m.caption || "",
    permalink: m.permalink || "",
    thumbnail_url: m.thumbnail_url || m.media_url || "",
    timestamp: m.timestamp || null,
    like_count: m.like_count || 0,
    comments_count: m.comments_count || 0,
  }));
}

async function main() {
  if (!TOKEN) {
    writeUnconfigured("missing META_ORGANIC_ACCESS_TOKEN and META_ACCESS_TOKEN");
    return;
  }

  const igId = await resolveInstagramBusinessId();
  const profile = await graphGet(`${igId}?fields=followers_count,username`);
  const [rows, topPosts] = await Promise.all([fetchDailyInsights(igId), fetchTopPosts(igId)]);

  const payload = {
    generated_at: new Date().toISOString(),
    source: "instagram-graph-api",
    configured: true,
    account: profile.username || USERNAME,
    followers_count: profile.followers_count || 0,
    days_back: DAYS_BACK,
    rows,
    top_posts: topPosts,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${rows.length} daily rows and ${topPosts.length} posts to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
