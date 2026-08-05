# Dashboard de Marketing Orgânico & Google Ads — Cavalcante & Rolim

Segundo dashboard estático da Cavalcante & Rolim, hospedado no GitHub Pages,
cobrindo os canais que o [dashboard de Meta Ads + CV CRM](https://github.com/thallesgoncalves/cavalcante-rolim-ads-dashboard)
não cobre: **Google Ads**, **SEO orgânico** (Search Console) e **redes
sociais orgânicas** (Instagram `@cavalcanteerolim`). Mesmo padrão do outro
repo: sem build, dados via APIs oficiais direto (sem Windsor.ai nem outro
agregador), atualizados por GitHub Actions e commitados como JSON.

## Como funciona

- `scripts/fetch_google_ads.js` — busca métricas diárias por campanha
  (investimento, impressões, cliques, CTR, CPC médio, conversões) via
  **Google Ads API** (GAQL sobre REST), grava em `data/google_ads.json`.
- `scripts/fetch_search_console.js` — busca desempenho diário de busca
  (cliques, impressões, CTR, posição média) e os top 20 termos/páginas via
  **Search Console API**, grava em `data/search_console.json`.
- `scripts/fetch_instagram_organic.js` — busca alcance, visitas ao perfil e
  os últimos 12 posts (com curtidas/comentários) da conta Instagram Business
  `@cavalcanteerolim` via **Meta Graph API**, grava em
  `data/instagram_organic.json`.
- `.github/workflows/update-data.yml` — roda os três scripts a cada 3 horas
  (mais espaçado que os 15 min do dashboard de ads, porque Search Console tem
  atraso natural de 2-3 dias e os outros dois não mudam nesse ritmo) e comita
  os JSONs quando algo muda. Também pode ser disparado manualmente na aba
  **Actions**.
- `index.html` / `index.js` — página **Visão Geral**: KPIs resumidos dos três
  canais lado a lado, últimos 30 dias fixos.
- `google-ads.html` / `google-ads.js` — página **Google Ads**: KPIs, gráficos
  diários e tabela de campanhas, com filtro de período.
- `seo-organico.html` / `seo.js` — página **SEO Orgânico**: KPIs, gráficos
  diários e tabelas de top buscas/páginas, com filtro de período.
- `social-organico.html` / `social.js` — página **Social Orgânico**: KPIs,
  gráficos diários e ranking de posts recentes por engajamento, com filtro
  de período.
- `common.js` / `style.css` — copiados do dashboard de ads (mesma identidade
  visual institucional da Cavalcante & Rolim: verde `#1D332B`, creme
  `#EFECE8`, bege `#DAD5C8`, marrom `#AA805B`, dourado `#EACF8B`; fonte Lato).

## Estado "aguardando configuração"

Cada fonte é independente: se as credenciais de uma delas ainda não
estiverem nos GitHub Secrets, o script correspondente grava
`"configured": false` e a página mostra "Aguardando configuração" em vez de
zeros — para não confundir com a conta Google Ads, que **já existe mas
ainda não tem campanhas ativas** (nesse caso o script roda normalmente e
grava `configured: true, rows: []`, e a tabela mostra uma mensagem explicando
que não há investimento no período, não um erro).

## Como obter as credenciais

### Google Ads

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um
   projeto (ou reaproveite um existente), ative a **Google Ads API** e crie
   uma credencial OAuth 2.0 do tipo "Desktop app" → `GOOGLE_ADS_CLIENT_ID` e
   `GOOGLE_ADS_CLIENT_SECRET`.
2. Solicite um **developer token** em Google Ads → Ferramentas → Central de
   API → aprovação pode levar alguns dias (nível "Test" já basta para uma
   única conta).
3. Gere um `GOOGLE_ADS_REFRESH_TOKEN` autenticando uma vez com o client
   acima e o escopo `https://www.googleapis.com/auth/adwords` (fluxo OAuth
   padrão, ex. usando o [OAuth Playground](https://developers.google.com/oauthplayground)
   com seu próprio client ID/secret).
4. `GOOGLE_ADS_CUSTOMER_ID` é o ID da conta Cavalcante & Rolim (sem traços).
   Se a conta for gerenciada por uma conta MCC, defina também
   `GOOGLE_ADS_LOGIN_CUSTOMER_ID` com o ID da MCC.

### Search Console

1. No mesmo projeto do Google Cloud, ative a **Search Console API** e crie
   uma **Service Account**, gerando uma chave JSON.
2. No [Search Console](https://search.google.com/search-console), abra a
   propriedade `cavalcanterolim.com.br` → Configurações → Usuários e
   permissões → adicione o e-mail da service account (campo `client_email`
   do JSON) como usuário (permissão "Completo" ou "Restrito" já é suficiente
   para leitura).
3. `GOOGLE_SC_SERVICE_ACCOUNT_JSON` = conteúdo completo do JSON da service
   account (cole o arquivo inteiro no secret). `SEARCH_CONSOLE_SITE_URL` =
   `https://www.cavalcanterolim.com.br/` (precisa bater exatamente com a
   propriedade cadastrada, incluindo a barra final).

### Instagram/Facebook orgânico

1. Confirme que a conta `@cavalcanteerolim` é uma conta **Business** e está
   vinculada a uma Página do Facebook.
2. No Business Manager → Usuários do sistema, gere um token com as
   permissões `instagram_basic`, `instagram_manage_insights` e
   `pages_read_engagement` (o `META_ACCESS_TOKEN` do outro dashboard só tem
   `ads_read` e provavelmente não serve aqui).
3. `META_ORGANIC_ACCESS_TOKEN` = esse token. Se preferir não descobrir o ID
   da conta automaticamente (o script varre as Páginas do token e casa pelo
   username), defina `INSTAGRAM_BUSINESS_ID` diretamente com o ID numérico
   da conta Instagram Business.

## Rodar localmente

```bash
GOOGLE_ADS_DEVELOPER_TOKEN=... GOOGLE_ADS_CLIENT_ID=... GOOGLE_ADS_CLIENT_SECRET=... \
  GOOGLE_ADS_REFRESH_TOKEN=... GOOGLE_ADS_CUSTOMER_ID=... node scripts/fetch_google_ads.js

GOOGLE_SC_SERVICE_ACCOUNT_JSON='{...}' SEARCH_CONSOLE_SITE_URL=https://www.cavalcanterolim.com.br/ \
  node scripts/fetch_search_console.js

META_ORGANIC_ACCESS_TOKEN=... node scripts/fetch_instagram_organic.js

python3 -m http.server 8000
# abrir http://localhost:8000
```

Rodar qualquer script sem as envs correspondentes não falha — grava
`configured: false` no JSON e o dashboard mostra o aviso de configuração
pendente na página daquela fonte.

## Configuração no GitHub

1. Secrets em *Settings → Secrets and variables → Actions*:
   `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`,
   `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`,
   `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (opcional),
   `GOOGLE_SC_SERVICE_ACCOUNT_JSON`, `SEARCH_CONSOLE_SITE_URL`,
   `META_ORGANIC_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ID` (opcional).
2. GitHub Pages configurado para publicar a partir da branch `main` (`/root`).
