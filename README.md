# Bogdan & Roxana — Command Center

Aplicația Cloudflare și serverul MCP pentru https://comand-center.ivanovroxana1988.workers.dev/ sunt în `sites-source/`.
Dashboardul și conectorul ChatGPT folosesc aceeași bază D1, configurată în `wrangler.jsonc`.

## Lucru din chat

1. Agentul citește taskurile existente și creează o propunere cu create_task, update_task, create_subtask sau complete_task.
2. Utilizatorul vede modificările înainte/după și confirmă explicit în chat.
3. Agentul apelează apply_change cu ID-ul exact al propunerii și confirmed=true.
4. Statusul applied confirmă salvarea. Dashboardul reîncarcă datele la revenire și la fiecare 30 de secunde.

Confirmarea în browser rămâne disponibilă. Referrer-Policy same-origin permite verificarea Origin la trimiterea formularului, fără transmiterea referrerului către alte site-uri. Origin și Sec-Fetch-Site continuă să fie verificate.

## Acces și verificare

Autentificare Google pentru cele două conturi autorizate și OAuth separat pentru MCP. Taskurile reale și credențialele nu sunt incluse în repository. Propunerile expiră după 15 minute; aplicările repetate ale aceleiași propuneri nu creează duplicate. Propunerile modificate între timp și aprobările altui utilizator sunt respinse.

```sh
cd sites-source
npm ci
node --test tests/mcp.test.mjs tests/mcp-oauth.test.mjs tests/google-auth.test.mjs
npx vite build
```

Cloudflare Build este configurat în wrangler.jsonc. Un commit GitHub nu dovedește publicarea: verifică buildul Cloudflare și descoperirea instrumentului apply_change pe endpointul MCP. După publicare, actualizează instrumentele conectorului existent dacă noul instrument nu apare.

Configurarea conexiunii: [MCP_CONNECTION.md](sites-source/MCP_CONNECTION.md).

## Modelul interfeței

Workers preia interfața și funcțiile versiunii 12 de pe chatgpt.site: paleta baby blue/ivory, cele 10 spații business, pagini tematice, ierarhie de taskuri și subtaskuri, drag and drop cu Undo, atașamente de maximum 20 MB și modulul Licitații. Conturile Google și OAuth MCP rămân cele existente. Datele Workers se păstrează; bazele celor două site-uri sunt distincte.

Migrațiile 0004 și 0005 extind schema fără ștergerea înregistrărilor existente. Bindingul privat R2 BUCKET este provisionat automat de Wrangler la prima publicare și reutilizat ulterior.
