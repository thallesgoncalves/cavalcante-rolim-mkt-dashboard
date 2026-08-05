(function () {
  "use strict";

  const { fmtNumber, fmtPercent, getRange, inRange, setGreeting, setupSidebarNav, setupRangeFilter, renderBarChart } = window.Common;

  let allRows = [];
  let topQueries = [];
  let topPages = [];
  let oldestDate = null;
  let configured = true;
  let loadFailed = false;
  let state = { rangeMode: "30", customFrom: null, customTo: null };
  let querySort = { key: "clicks", dir: "desc" };
  let pageSort = { key: "clicks", dir: "desc" };

  async function loadData() {
    const res = await fetch("data/search_console.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load data/search_console.json (${res.status})`);
    return res.json();
  }

  function filteredRows() {
    const { from, to } = getRange(state);
    return allRows.filter((r) => inRange(r.date, from, to));
  }

  function renderKPIs(rows) {
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const avgPosition = rows.length > 0 ? rows.reduce((s, r) => s + (r.position || 0), 0) / rows.length : null;

    document.getElementById("kpi-hero").innerHTML = `
      <div>
        <div class="label">Cliques no período</div>
        <div class="value">${fmtNumber(clicks)}</div>
      </div>
    `;
    const secondary = [
      { label: "Impressões", value: fmtNumber(impressions) },
      { label: "CTR", value: fmtPercent(ctr) },
      { label: "Posição média", value: avgPosition == null ? "—" : avgPosition.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) },
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

  function sortRows(rows, sort) {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av = a[sort.key], bv = b[sort.key];
      if (av == null) av = -Infinity;
      if (bv == null) bv = -Infinity;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }

  function renderRankTable(rows, sort, labelKey, tbodyId, countId, tableId) {
    const sorted = sortRows(rows, sort);
    document.getElementById(countId).textContent = `${sorted.length} resultado(s)`;
    document.getElementById(tbodyId).innerHTML = sorted.length
      ? sorted
          .map(
            (r) => `<tr>
        <td>${r[labelKey]}</td>
        <td class="num">${fmtNumber(r.clicks)}</td>
        <td class="num">${fmtNumber(r.impressions)}</td>
        <td class="num">${fmtPercent(r.ctr)}</td>
        <td class="num">${(r.position || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
      </tr>`
          )
          .join("")
      : `<tr><td colspan="5" class="muted">Sem dados.</td></tr>`;
    document.querySelectorAll(`#${tableId} thead th`).forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === sort.key) th.classList.add(sort.dir === "asc" ? "sorted-asc" : "sorted-desc");
    });
  }

  function renderAll() {
    if (loadFailed || !configured) return;
    const rows = filteredRows();
    renderKPIs(rows);
    renderBarChart("chart-clicks", dailySeries(rows, "clicks"), "var(--series-leads)", fmtNumber);
    renderBarChart("chart-impressions", dailySeries(rows, "impressions"), "var(--series-spend)", fmtNumber);
    renderRankTable(topQueries, querySort, "query", "query-tbody", "query-count", "query-table");
    renderRankTable(topPages, pageSort, "page", "page-tbody", "page-count", "page-table");
  }

  function setupSortableTable(tableId, sort) {
    document.querySelectorAll(`#${tableId} thead th[data-sort]`).forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (sort.key === key) {
          sort.dir = sort.dir === "asc" ? "desc" : "asc";
        } else {
          sort.key = key;
          sort.dir = "desc";
        }
        renderAll();
      });
    });
  }

  function showUnconfigured() {
    document.getElementById("kpi-hero").innerHTML = "";
    document.getElementById("kpi-secondary").innerHTML =
      `<p class="muted">Aguardando configuração do Search Console (GOOGLE_SC_SERVICE_ACCOUNT_JSON, SEARCH_CONSOLE_SITE_URL) — veja o README.</p>`;
    document.getElementById("query-tbody").innerHTML = "";
    document.getElementById("page-tbody").innerHTML = "";
  }

  async function init() {
    setGreeting();
    setupSidebarNav();
    setupSortableTable("query-table", querySort);
    setupSortableTable("page-table", pageSort);

    try {
      const payload = await loadData();
      configured = payload.configured !== false;
      allRows = payload.rows || [];
      topQueries = payload.top_queries || [];
      topPages = payload.top_pages || [];
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
