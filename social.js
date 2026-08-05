(function () {
  "use strict";

  const { fmtNumber, getRange, inRange, setGreeting, setupSidebarNav, setupRangeFilter, renderBarChart } = window.Common;

  let allRows = [];
  let topPosts = [];
  let followersCount = 0;
  let oldestDate = null;
  let configured = true;
  let loadFailed = false;
  let state = { rangeMode: "30", customFrom: null, customTo: null };

  const PLACEHOLDER_ICON = `<div class="creative-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6"/><circle cx="8" cy="8.5" r="1.2" fill="currentColor" stroke="none"/></svg></div>`;

  async function loadData() {
    const res = await fetch("data/instagram_organic.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load data/instagram_organic.json (${res.status})`);
    return res.json();
  }

  function filteredRows() {
    const { from, to } = getRange(state);
    return allRows.filter((r) => inRange(r.date, from, to));
  }

  function renderKPIs(rows) {
    const reach = rows.reduce((s, r) => s + r.reach, 0);
    const profileViews = rows.reduce((s, r) => s + r.profile_views, 0);
    const engagement = topPosts.reduce((s, p) => s + (p.like_count || 0) + (p.comments_count || 0), 0);

    document.getElementById("kpi-hero").innerHTML = `
      <div>
        <div class="label">Alcance no período</div>
        <div class="value">${fmtNumber(reach)}</div>
      </div>
    `;
    const secondary = [
      { label: "Visitas ao perfil", value: fmtNumber(profileViews) },
      { label: "Seguidores", value: fmtNumber(followersCount) },
      { label: "Engajamento (posts recentes)", value: fmtNumber(engagement) },
      { label: "Posts recentes", value: fmtNumber(topPosts.length) },
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

  function renderPosts() {
    const ranked = [...topPosts].sort((a, b) => (b.like_count + b.comments_count) - (a.like_count + a.comments_count));
    document.getElementById("post-count").textContent = `${ranked.length} post(s) · ordenado por engajamento`;
    document.getElementById("post-grid").innerHTML = ranked
      .map((p) => {
        const caption = (p.caption || "").slice(0, 80) + ((p.caption || "").length > 80 ? "…" : "");
        return `<div class="creative-card">
          ${p.thumbnail_url ? `<img class="creative-thumb" src="${p.thumbnail_url}" alt="" loading="lazy" />` : PLACEHOLDER_ICON}
          <div class="creative-body">
            <div class="creative-name" title="${caption}">${caption || "—"}</div>
            <div class="creative-campaign">${p.timestamp ? new Date(p.timestamp).toLocaleDateString("pt-BR") : ""}</div>
            <div class="creative-stats">
              <div><span class="stat-value">${fmtNumber(p.like_count)}</span><span class="stat-label">curtidas</span></div>
              <div><span class="stat-value">${fmtNumber(p.comments_count)}</span><span class="stat-label">comentários</span></div>
            </div>
          </div>
        </div>`;
      })
      .join("");
  }

  function renderAll() {
    if (loadFailed || !configured) return;
    const rows = filteredRows();
    renderKPIs(rows);
    renderBarChart("chart-reach", dailySeries(rows, "reach"), "var(--series-spend)", fmtNumber);
    renderBarChart("chart-profile-views", dailySeries(rows, "profile_views"), "var(--series-leads)", fmtNumber);
    renderPosts();
  }

  function showUnconfigured() {
    document.getElementById("kpi-hero").innerHTML = "";
    document.getElementById("kpi-secondary").innerHTML =
      `<p class="muted">Aguardando configuração do token do Instagram (META_ORGANIC_ACCESS_TOKEN ou META_ACCESS_TOKEN com escopos de organic insights) — veja o README.</p>`;
    document.getElementById("post-grid").innerHTML = "";
    document.getElementById("post-count").textContent = "";
  }

  async function init() {
    setGreeting();
    setupSidebarNav();

    try {
      const payload = await loadData();
      configured = payload.configured !== false;
      allRows = payload.rows || [];
      topPosts = payload.top_posts || [];
      followersCount = payload.followers_count || 0;
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
