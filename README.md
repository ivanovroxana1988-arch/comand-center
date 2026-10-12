# Bogdan & Roxana — Command Center

Aplicația Cloudflare și serverul MCP pentru https://comand-center.ivanovroxana1988.workers.dev/ sunt în `sites-source/`.
Dashboardul și conectorul ChatGPT folosesc aceeași bază D1, configurată în `wrangler.jsonc`.

## Lucru din chat

1. Agentul citește taskurile existente și creează o propunere cu create_task, update_task, create_subtask sau complete_task.
2. Utilizatorul vede modificările înainte/după și confirmă explicit în chat.
3. Agentul apelează apply_change cu ID-ul exact al propunerii și confirmed=true.
4. Statusul applied confirmă salvarea. Dashboardul primește revizia workspace-ului printr-un flux autentificat și reîncarcă datele în aproximativ 2 secunde, cât timp aplicația este vizibilă.

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

Migrațiile 0004 și 0005 extind schema fără ștergerea înregistrărilor existente. Bindingul privat R2 BUCKET este creat explicit la prima publicare și reutilizat ulterior.

## Aplicația pe telefon

Instalare PWA din Chrome pe Android sau prin Partajează → Adaugă pe ecranul principal în Safari pe iPhone. Manifestul folosește modul standalone și iconuri locale. Aplicația și dashboardul folosesc aceeași bază D1.

Migrația 0006 adaugă un contor de revizie și triggere pentru taskuri, pagini, organizare, atașamente și licitații. Fluxul SSE verifică sesiunea Google și revizia la fiecare 2 secunde; închide conexiunea la revocare, anulare sau trecerea aplicației în fundal. Formularele și mutările active amână refresh-ul până la finalizare. Notificările push sunt opționale și se activează separat pe fiecare dispozitiv. Service worker-ul păstrează numai pagina publică offline; taskurile, sesiunile și documentele rămân exclusiv în rețea.

## Notificări personale

Abonarea este asociată exclusiv identității Google verificate. Roxana primește evenimente pentru owner=Roxana, Bogdan pentru owner=Bogdan, iar Împreună notifică ambele conturi. Telefonul unui alt cont nu poate fi preluat prin simpla schimbare a ownerului în JSON. Maximum cinci dispozitive per cont; Test și Oprește acționează doar asupra abonamentului propriu.

Migrația 0007 adaugă abonamente, evenimente, livrări idempotente și cheia de semnare VAPID, generată pe server și păstrată numai în baza D1 protejată. API-ul returnează doar cheia publică. Push-urile nu conțin payload: furnizorul telefonului nu primește titluri de task, note sau documente. Service worker-ul arată o alertă generală și deschide aplicația, unde detaliile cer autentificare.

Evenimentele pentru taskuri noi și atribuiri noi sunt create prin triggere D1, indiferent dacă schimbarea vine din chat sau din dashboard. Worker-ul încearcă livrarea după scriere; un cron la fiecare minut reia erorile temporare și pregătește o alertă zilnică pentru termenele active, după ora 09:00 în fusul orar al dispozitivului. Abonamentele expirate sunt eliminate; evenimentele nu sunt trimise retroactiv la activarea unui telefon. Livrările pot întârzia în funcție de internet și de sistemul de operare. Fiecare utilizator trebuie să acorde permisiunea pe telefonul lui.

## Monitorizare simplificată

Pagina principală este Azi și identifică automat Roxana/Bogdan din sesiunea Google. Taskurile proprii și cele Împreună sunt grupate în Taskurile mele, Aștept răspuns (inclusiv follow-up) și Întârziate. Ecranul Echipa arată separat responsabilitățile Roxanei, ale lui Bogdan și cele comune. Spațiile, paginile și organizarea avansată rămân în meniul secundar. Gruparea nu modifică statusurile, termenele sau datele taskurilor.

Migrația 0008 restrânge notificările la taskuri active nou create, schimbarea responsabilului și alerte de termen. Modificările de status sau de detalii continuă să se sincronizeze, fără notificări push suplimentare.
