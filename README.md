# Bogdan & Roxana — Command Center

Repository privat pentru migrarea aplicației existente din ChatGPT Sites pe Cloudflare.

## Stare verificată

- Codul aplicației existente, operațiile MCP și migrațiile bazei de date sunt în `sites-source/`.
- Taskurile reale și credențialele nu sunt incluse în GitHub.
- Codul existent este specific găzduirii Sites. **Acest repository nu este încă o versiune publicabilă pe Cloudflare.**
- Nu există un flux automat de publicare activat.

## Ce rămâne pentru migrare

1. Înlocuirea autentificării Sites cu autentificare verificată pentru găzduirea externă, pentru Roxana și Bogdan.
2. Configurarea autentificării OAuth a conexiunii MCP la ChatGPT și a permisiunilor de citire/scriere.
3. Crearea bazei D1 în contul Cloudflare și configurarea legăturii cu Worker-ul.
4. Exportul și importul verificat al datelor, păstrând ID-urile și relațiile dintre taskuri.
5. Testarea accesului, confirmărilor și conectării dintr-un chat nou.
6. Trecerea la noua adresă numai după verificare; dashboard-ul actual rămâne sursa activă până atunci.

## Atenție la autentificare

Adaptorul actual din `sites-source/lib/site-task-service.ts` se bazează pe antete furnizate de platforma Sites. Aceste antete NU trebuie considerate autentificare pe o găzduire externă, unde pot fi falsificate de un apelant. Copierea codului pe un Worker public fără înlocuirea adaptorului ar expune datele.

## Verificare locală

Cu Node.js 24:

```sh
cd sites-source
node --test tests/mcp.test.mjs
```

Cele șapte teste folosesc o bază SQLite izolată și nu modifică datele reale. Validarea locală nu dovedește conectarea OAuth la ChatGPT.
