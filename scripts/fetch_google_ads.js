// Pulls daily campaign-level metrics from the Google Ads API (GAQL over
// REST) for the Cavalcante & Rolim account and writes them to
// data/google_ads.json for the dashboard.
//
// Requires Node 18+ (built-in fetch). Envs:
//   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
//   GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID (optional — only if the account is managed
//   through an MCC and the refresh token authenticates at the MCC level)
//
// The account exists but has no campaigns running yet — this is expected to
// write `rows: []` (not zeros scattered across fake rows) until spend starts.
// If required envs are missing, this writes `configured: false` and exits 0
// instead of failing the workflow, so the pipeline for the other two sources
// (Search Console, Instagram) keeps running while Google Ads setup is pending.

const fs = require("fs");
const path = require("path");

const {
  GOOGLE_ADS_DEVELOPER_TOKEN,
  GOOGLE_ADS_CLIENT_ID,
  GOOGLE_ADS_CLIENT_SECRET,
  GOOGLE_ADS_REFRESH_TOKEN,
  GOOGLE_ADS_CUSTOMER_ID,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID,
} = process.env;

const API_VERSION = "v18";
const DAYS_BACK = 90;
const OUT_PATH = path.join(__dirname, "..", "data", "google_ads.json");

function writeUnconfigured(reason) {
  console.log(`Google Ads not configured yet: ${reason}`);
  const payload = {
    generated_at: new Date().toISOString(),
    source: "google-ads-api",
    configured: false,
    days_back: DAYS_BACK,
    rows: [],
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
}

function dateRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { since: fmt(from), until: fmt(to) };
}

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth token refresh failed: ${res.status} — ${body.slice(0, 300)}`);
  }
  const body = await res.json();
  return body.access_token;
}

async function runQuery(accessToken, customerId, query) {
  const rows = [];
  let pageToken = null;
  do {
    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
          ...(GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { "login-customer-id": GOOGLE_ADS_LOGIN_CUSTOMER_ID } : {}),
        },
        body: JSON.stringify({ query, pageToken: pageToken || undefined }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Ads API request failed: ${res.status} — ${body.slice(0, 500)}`);
    }
    const body = await res.json();
    rows.push(...(body.results || []));
    pageToken = body.nextPageToken || null;
  } while (pageToken);
  return rows;
}

async function main() {
  if (
    !GOOGLE_ADS_DEVELOPER_TOKEN ||
    !GOOGLE_ADS_CLIENT_ID ||
    !GOOGLE_ADS_CLIENT_SECRET ||
    !GOOGLE_ADS_REFRESH_TOKEN ||
    !GOOGLE_ADS_CUSTOMER_ID
  ) {
    writeUnconfigured(
      "missing one or more of GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN / GOOGLE_ADS_CUSTOMER_ID"
    );
    return;
  }

  const { since, until } = dateRange(DAYS_BACK);
  const customerId = GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, "");

  const accessToken = await getAccessToken();

  // average_cpc and cost_per_conversion, like cost_micros, are returned in
  // micros (1/1,000,000 of the currency unit) — divide by 1e6 below.
  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    ORDER BY segments.date ASC
  `;

  const results = await runQuery(accessToken, customerId, query);

  const rows = results.map((r) => ({
    date: r.segments.date,
    campaign_id: r.campaign.id,
    campaign: r.campaign.name || "",
    status: r.campaign.status || "",
    cost: Number(r.metrics.costMicros || 0) / 1e6,
    impressions: Number(r.metrics.impressions || 0),
    clicks: Number(r.metrics.clicks || 0),
    ctr: Number(r.metrics.ctr || 0) * 100,
    avg_cpc: Number(r.metrics.averageCpc || 0) / 1e6,
    conversions: Number(r.metrics.conversions || 0),
    cost_per_conversion: Number(r.metrics.costPerConversion || 0) / 1e6,
  }));

  const payload = {
    generated_at: new Date().toISOString(),
    source: "google-ads-api",
    configured: true,
    days_back: DAYS_BACK,
    rows,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${rows.length} rows to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
