(function () {
  "use strict";

  const { fmtCurrency, fmtCurrency2, fmtNumber, fmtPercent, getRange, inRange, setGreeting, setupSidebarNav, setupRangeFilter, renderBarChart } =
    window.Common;

  let allRows = [];
  let oldestDate = null;
  let configured = true;
  let loadFailed = false;
  let state = { rangeMode: "30", customFrom: null, customTo: null, sortKey: "cost", sortDir: "desc" };

  async function loadData() {
    const res = await fetch("data/google_ads.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load data/google_ads.json (${res.status})`);
    return res.json();
  }

  function filteredRows() {
    const { from, to } = getRange(state);
    return allRows.filter((r) => inRange(r.date, from, to));
  }

  function renderKPIs(rows) {
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const conversions = rows.reduce((s, r) => s + r.conversions, 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const avgCpc = clicks > 0 ? cost / clicks : null;
    const costPerConversion = conversions > 0 ? cost / conversions : null;

    document.getElementById("kpi-hero").innerHTML = `
      <div>
        <div class="label">Investimento total</div>
        <div class="value">${fmtCurrency(cost)}</div>
      </div>
    `;

    const secondary = [
      { label: "Cliques", value: fmtNumber(clicks) },
      { label: "CTR", value: fmtPercent(ctr) },
      { label: "CPC médio", value: avgCpc == null ? "—" : fmtCurrency2(avgCpc) },
      { label: "Conversões", value: fmtNumber(conversions) },
      { label: "Custo/Conversão", value: costPerConversion == null ? "—" : fmtCurrency2(costPerConversion) },
    ];
    document.getElementById("kpi-secondary").innerHTML = secondary
      .map((t) => `<div class="stat-tile"><div class="label">${t.label}</div><div class="value">${t.value}</div></div>`)
      .join("");
  }

  function dailySeries(rows, key) {
    const byDate = new Map();
    for (const r of rows) byDate.set(r.date, (byDate.get(r.date) || 0) + r[key]);
    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, value]) => ({ date, value }));
  }

  function campaignAggregates(rows) {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.campaign_id)) {
        map.set(r.campaign_id, { campaign: r.campaign, status: r.status, cost: 0, impressions: 0, clicks: 0, conversions: 0 });
      }
      const agg = map.get(r.campaign_id);
      agg.cost += r.cost;
      agg.impressions += r.impressions;
      agg.clicks += r.clicks;
      agg.conversions += r.conversions;
    }
    return Array.from(map.values()).map((agg) => ({
      ...agg,
      ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0,
      avg_cpc: agg.clicks > 0 ? agg.cost / agg.clicks : null,
      cost_per_conversion: agg.conversions > 0 ? agg.cost / agg.conversions : null,
    }));
  }

  function sortRows(rows) {
    const dir = state.sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av = a[state.sortKey], bv = b[state.sortKey];
      if (av == null) av = -Infinity;
      if (bv == null) bv = -Infinity;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }

  function renderTable(rows) {
    const aggregates = sortRows(campaignAggregates(rows));
    document.getElementById("table-count").textContent = `${aggregates.length} campanha(s)`;
    document.getElementById("campaign-tbody").innerHTML = aggregates.length
      ? aggregates
          .map(
            (c) => `<tr>
        <td>${c.campaign}${c.status && c.status !== "ENABLED" ? ` <span class="account-badge">${c.status}</span>` : ""}</td>
        <td class="num">${fmtCurrency(c.cost)}</td>
        <td class="num">${fmtNumber(c.impressions)}</td>
        <td class="num">${fmtNumber(c.clicks)}</td>
        <td class="num">${fmtPercent(c.ctr)}</td>
        <td class="num">${c.avg_cpc == null ? "—" : fmtCurrency2(c.avg_cpc)}</td>
        <td class="num">${fmtNumber(c.conversions)}</td>
        <td class="num">${c.cost_per_conversion == null ? "—" : fmtCurrency2(c.cost_per_conversion)}</td>
      </tr>`
          )
          .join("")
      : `<tr><td colspan="8" class="muted">Nenhuma campanha ativa no período — a conta Google Ads da Cavalcante & Rolim ainda não tem investimento em veiculação.</td></tr>`;

    document.querySelectorAll("#campaign-table thead th").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === state.sortKey) th.classList.add(state.sortDir === "asc" ? "sorted-asc" : "sorted-desc");
    });
  }

  function renderAll() {
    if (loadFailed || !configured) return;
    const rows = filteredRows();
    renderKPIs(rows);
    renderBarChart("chart-cost", dailySeries(rows, "cost"), "var(--series-spend)", fmtCurrency);
    renderBarChart("chart-clicks", dailySeries(rows, "clicks"), "var(--series-leads)", fmtNumber);
    renderTable(rows);
  }

  function setupSortableTable() {
    document.querySelectorAll("#campaign-table thead th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = "desc";
        }
        renderTable(filteredRows());
      });
    });
  }

  function showUnconfigured() {
    document.getElementById("kpi-hero").innerHTML = "";
    document.getElementById("kpi-secondary").innerHTML =
      `<p class="muted">Aguardando configuração das credenciais da Google Ads API (GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID) — veja o README.</p>`;
    document.getElementById("campaign-tbody").innerHTML = "";
    document.getElementById("table-count").textContent = "";
  }

  async function init() {
    setGreeting();
    setupSidebarNav();
    setupSortableTable();

    try {
      const payload = await loadData();
      configured = payload.configured !== false;
      allRows = payload.rows || [];
      oldestDate = allRows.reduce((min, r) => (!min || r.date < min ? r.date : min), null);
      setupRangeFilter(state, oldestDate, renderAll);

      const updatedAt = payload.generated_at ? new Date(payload.generated_at) : null;
      document.getElementById("updated-at").textContent = updatedAt
        ? `Atualizado em ${updatedAt.toLocaleString("pt-BR")}`
        : "";

      if (!configured) {
        showUnconfigured();
      } else {
        renderAll();
      }
    } catch (err) {
      loadFailed = true;
      document.getElementById("kpi-hero").innerHTML = "";
      document.getElementById("kpi-secondary").innerHTML =
        `<p class="muted">Não foi possível carregar os dados: ${err.message}</p>`;
      console.error(err);
    }
  }

  init();
})();
