// Pulls daily search performance + top queries/pages from the Google Search
// Console API for cavalcanterolim.com.br and writes them to
// data/search_console.json for the dashboard.
//
// Requires Node 18+ (built-in fetch + crypto, no external deps). Auth is a
// Service Account JWT signed locally (no `googleapis` package) exchanged for
// an OAuth access token. Envs:
//   GOOGLE_SC_SERVICE_ACCOUNT_JSON — full JSON key of the service account
//     (must be added as a user of the site in Search Console)
//   SEARCH_CONSOLE_SITE_URL — e.g. "https://www.cavalcanterolim.com.br/"
//
// If required envs are missing, this writes `configured: false` and exits 0
// instead of failing the workflow, so the other two sources keep updating
// while Search Console setup is pending.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { GOOGLE_SC_SERVICE_ACCOUNT_JSON, SEARCH_CONSOLE_SITE_URL } = process.env;

const DAYS_BACK = 90;
const TOP_LIMIT = 20;
const OUT_PATH = path.join(__dirname, "..", "data", "search_console.json");

function writeUnconfigured(reason) {
  console.log(`Search Console not configured yet: ${reason}`);
  const payload = {
    generated_at: new Date().toISOString(),
    source: "search-console-api",
    configured: false,
    site_url: SEARCH_CONSOLE_SITE_URL || null,
    days_back: DAYS_BACK,
    rows: [],
    top_queries: [],
    top_pages: [],
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
}

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(serviceAccount) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claims = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(serviceAccount.private_key);
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Service account token exchange failed: ${res.status} — ${body.slice(0, 300)}`);
  }
  const body = await res.json();
  return body.access_token;
}

function dateRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { since: fmt(from), until: fmt(to) };
}

async function queryAnalytics(accessToken, siteUrl, body) {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search Console API request failed: ${res.status} — ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  return json.rows || [];
}

async function main() {
  if (!GOOGLE_SC_SERVICE_ACCOUNT_JSON || !SEARCH_CONSOLE_SITE_URL) {
    writeUnconfigured("missing GOOGLE_SC_SERVICE_ACCOUNT_JSON or SEARCH_CONSOLE_SITE_URL");
    return;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(GOOGLE_SC_SERVICE_ACCOUNT_JSON);
  } catch (err) {
    throw new Error(`GOOGLE_SC_SERVICE_ACCOUNT_JSON is not valid JSON: ${err.message}`);
  }

  const { since, until } = dateRange(DAYS_BACK);
  const accessToken = await getAccessToken(serviceAccount);

  const [dailyRows, queryRows, pageRows] = await Promise.all([
    queryAnalytics(accessToken, SEARCH_CONSOLE_SITE_URL, {
      startDate: since,
      endDate: until,
      dimensions: ["date"],
      rowLimit: 25000,
    }),
    queryAnalytics(accessToken, SEARCH_CONSOLE_SITE_URL, {
      startDate: since,
      endDate: until,
      dimensions: ["query"],
      rowLimit: 1000,
    }),
    queryAnalytics(accessToken, SEARCH_CONSOLE_SITE_URL, {
      startDate: since,
      endDate: until,
      dimensions: ["page"],
      rowLimit: 1000,
    }),
  ]);

  const rows = dailyRows.map((r) => ({
    date: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr * 100,
    position: r.position,
  }));

  // The API doesn't support server-side ordering — sort by clicks locally
  // and keep only the top N for the dashboard's ranking tables.
  const topQueries = queryRows
    .map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr * 100, position: r.position }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, TOP_LIMIT);

  const topPages = pageRows
    .map((r) => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr * 100, position: r.position }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, TOP_LIMIT);

  const payload = {
    generated_at: new Date().toISOString(),
    source: "search-console-api",
    configured: true,
    site_url: SEARCH_CONSOLE_SITE_URL,
    days_back: DAYS_BACK,
    rows,
    top_queries: topQueries,
    top_pages: topPages,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${rows.length} daily rows, ${topQueries.length} queries, ${topPages.length} pages to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
