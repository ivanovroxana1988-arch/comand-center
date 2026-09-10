# Command Center: conectare ChatGPT

Server MCP: `https://comand-center.ivanovroxana1988.workers.dev/mcp`

Autentificare: OAuth 2.1, CIMD, client public cu PKCE S256. Nu introduceți aici
Google Client ID sau Google Client Secret: acestea aparțin autentificării Google
a dashboardului și rămân în Cloudflare.

În configurarea MCP din ChatGPT alegeți OAuth și, dacă este oferită alegerea,
Client ID Metadata Document (CIMD). Discovery publică automat configurația.
Client acceptat: `https://chatgpt.com/oauth/client.json`.
Callback acceptat exact: `https://chatgpt.com/connector_platform_oauth_redirect`.
Nu sunt acceptate callbackuri arbitrare sau clienți DCR.

Flux: ChatGPT → autentificare Google în Command Center → consimțământ pentru
citire/propuneri → revenire în ChatGPT. Numai cele două conturi Google existente
pot autoriza accesul. Fiecare persoană își autorizează propria conexiune.

Instrumente: list_tasks, get_task, create_task, update_task, create_subtask,
complete_task, get_change_status. Operațiile de scriere creează propuneri,
nu modifică imediat taskurile. Utilizatorul verifică înainte/după în linkul
returnat și apasă Confirmă și salvează. Un simplu «da» în chat nu aplică propunerea.
Dashboardul citește actualizările la revenirea în pagină și la fiecare 15 secunde
cât timp este vizibil. Nu monitorizează automat toate conversațiile ChatGPT.

Accesul poate fi revocat din linkul Acces ChatGPT al dashboardului. Access token:
cel mult o oră; refresh rotit la fiecare folosire; grant: cel mult 30 zile.
În D1 se păstrează doar hashurile tokenurilor. Scope-ul tasks:write permite
propuneri, fără a expune un instrument de aprobare. Tokenurile MCP nu permit
apelarea API-urilor de confirmare ale browserului.

## Verificări

`node --test tests/google-auth.test.mjs tests/mcp.test.mjs tests/mcp-oauth.test.mjs`

Testele folosesc o bază SQLite izolată și răspunsuri Google/ChatGPT simulate.
Nu reprezintă o conectare reală la ChatGPT sau dovada publicării în Cloudflare.
După build/deploy verificați discovery 200 JSON și /mcp 401 cu WWW-Authenticate.
Apoi conectați contul și testați într-un chat nou: listare → propunere task de
test → confirmare manuală → get_change_status applied → task în dashboard.
Nu marcați integrarea finalizată înainte de acest test complet.

Referință: https://developers.openai.com/plugins/build/auth
