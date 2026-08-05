(function () {
  "use strict";

  const { fmtCurrency, fmtCurrency2, fmtNumber, fmtPercent, setGreeting, setupSidebarNav } = window.Common;

  // Each summary card shows the last 30 days regardless of the per-page
  // filters on google-ads.html/seo-organico.html/social-organico.html —
  // this page is a fixed-window executive glance, not another filterable view.
  const SUMMARY_DAYS = 30;

  function since(days) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    return d.toISOString().slice(0, 10);
  }

  function sumRows(rows, key) {
    return rows.reduce((s, r) => s + (r[key] || 0), 0);
  }

  function renderKpis(containerId, tiles) {
    document.getElementById(containerId).innerHTML = tiles
      .map((t) => `<div class="stat-tile"><div class="label">${t.label}</div><div class="value">${t.value}</div></div>`)
      .join("");
  }

  function setStatus(id, text) {
    document.getElementById(id).textContent = text;
  }

  async function loadJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
    return res.json();
  }

  async function loadGoogleAds() {
    try {
      const payload = await loadJson("data/google_ads.json");
      if (!payload.configured) {
        setStatus("ga-status", "Aguardando configuração das credenciais da Google Ads API");
        renderKpis("ga-kpis", []);
        return;
      }
      const cutoff = since(SUMMARY_DAYS);
      const rows = (payload.rows || []).filter((r) => r.date >= cutoff);
      const cost = sumRows(rows, "cost");
      const clicks = sumRows(rows, "clicks");
      const conversions = sumRows(rows, "conversions");
      const cpa = conversions > 0 ? cost / conversions : null;
      setStatus("ga-status", `Últimos ${SUMMARY_DAYS} dias · atualizado em ${new Date(payload.generated_at).toLocaleString("pt-BR")}`);
      renderKpis("ga-kpis", [
        { label: "Investimento", value: fmtCurrency(cost) },
        { label: "Cliques", value: fmtNumber(clicks) },
        { label: "Conversões", value: fmtNumber(conversions) },
        { label: "Custo/Conversão", value: cpa == null ? "—" : fmtCurrency2(cpa) },
      ]);
    } catch (err) {
      setStatus("ga-status", `Não foi possível carregar: ${err.message}`);
      console.error(err);
    }
  }

  async function loadSeo() {
    try {
      const payload = await loadJson("data/search_console.json");
      if (!payload.configured) {
        setStatus("seo-status", "Aguardando configuração do Search Console");
        renderKpis("seo-kpis", []);
        return;
      }
      const cutoff = since(SUMMARY_DAYS);
      const rows = (payload.rows || []).filter((r) => r.date >= cutoff);
      const clicks = sumRows(rows, "clicks");
      const impressions = sumRows(rows, "impressions");
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const avgPosition = rows.length > 0 ? rows.reduce((s, r) => s + (r.position || 0), 0) / rows.length : null;
      setStatus("seo-status", `Últimos ${SUMMARY_DAYS} dias · atualizado em ${new Date(payload.generated_at).toLocaleString("pt-BR")}`);
      renderKpis("seo-kpis", [
        { label: "Cliques", value: fmtNumber(clicks) },
        { label: "Impressões", value: fmtNumber(impressions) },
        { label: "CTR", value: fmtPercent(ctr) },
        { label: "Posição média", value: avgPosition == null ? "—" : avgPosition.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) },
      ]);
    } catch (err) {
      setStatus("seo-status", `Não foi possível carregar: ${err.message}`);
      console.error(err);
    }
  }

  async function loadSocial() {
    try {
      const payload = await loadJson("data/instagram_organic.json");
      if (!payload.configured) {
        setStatus("social-status", "Aguardando configuração do token do Instagram");
        renderKpis("social-kpis", []);
        return;
      }
      const cutoff = since(SUMMARY_DAYS);
      const rows = (payload.rows || []).filter((r) => r.date >= cutoff);
      const reach = sumRows(rows, "reach");
      const profileViews = sumRows(rows, "profile_views");
      setStatus("social-status", `Últimos ${SUMMARY_DAYS} dias · atualizado em ${new Date(payload.generated_at).toLocaleString("pt-BR")}`);
      renderKpis("social-kpis", [
        { label: "Alcance", value: fmtNumber(reach) },
        { label: "Visitas ao perfil", value: fmtNumber(profileViews) },
        { label: "Seguidores", value: fmtNumber(payload.followers_count) },
        { label: "Posts no período", value: fmtNumber((payload.top_posts || []).length) },
      ]);
    } catch (err) {
      setStatus("social-status", `Não foi possível carregar: ${err.message}`);
      console.error(err);
    }
  }

  async function init() {
    setGreeting();
    setupSidebarNav();
    await Promise.all([loadGoogleAds(), loadSeo(), loadSocial()]);
  }

  init();
})();
