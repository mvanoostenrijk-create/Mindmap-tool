# Mindmap-tool (Mindmeister-achtig, met Todoist)

Statische webapp zonder build-stap: `index.html`, `style.css`, `app.js` (vanilla JS). UI in het Nederlands.
Overig: `config.js` (Supabase-URL + publishable key), `supabase.js` (supabase-js 2.45.4, ongewijzigd meegeleverd), `supabase.sql` (tabel `maps` + RLS), `sw.js` + `manifest.webmanifest` + iconen (PWA).
Gebruiker werkt met beperkte tokens: één fase per sessie, geen frameworks, geen onnodige bestanden.

## Opzet app.js
- `store`: lokale opslag (localStorage) met async `list/load/save/remove`; blijft leidend (offline).
- `cloud`: sync met Supabase-tabel `maps`, per mindmap wint de laatste wijziging (`updated`), verwijderen via tombstone (`deleted`). Alleen inloggen met e-mail + wachtwoord; gebruiker is handmatig in Supabase aangemaakt. Getest met nagebootste backend, zie fases.
- Model: `map = {id,title,updated,root}`; node = `{id,text,children[],collapsed?,side?,color?}`. `side`/`color` alleen op kinderen van de root. Titel = tekst van de root.
- `render()` → `index()` (info per node) → DOM-nodes in `#world` → `layout()` (automatische boomindeling, links/rechts) → SVG-lijnen.
- Wijzigingen altijd via `change(fn)` (undo-snapshot + opslaan + render).
- Invoer: pointer events (pan, pinch, slepen = verplaatsen/herordenen, dubbeltik = bewerken) en toetsenbord (Tab, Enter, Delete, F2, spatie, pijlen, Ctrl+Z/Y).

## Fases
1. Kern-editor, lokaal opgeslagen — KLAAR (touch/pinch nog niet op echte iPad getest).
2. Login + cloud-sync + PWA — KLAAR. Draait op GitHub Pages (repo is publiek): https://mvanoostenrijk-create.github.io/Mindmap-tool/ ; gebruiker bevestigt dat het werkt, ook op iPad.
3. Todoist — GEBOUWD (module `todoist` in app.js). API v1 (`https://api.todoist.com/api/v1/`), rechtstreeks vanuit de browser met persoonlijk token in localStorage (per apparaat). `node.task = {id, done, due, gone?}` synct mee. Status via GET `tasks/{id}` bij openen, terugkeren naar de app en elke 5 min. Alleen getest met nagebootste API; CORS en gedrag bij afgeronde taken moeten blijken in de praktijk. Plan B bij CORS-blokkade: Supabase Edge Function.
4. Export: PNG, PDF, Markdown-outline.

Buiten scope: opmaak/thema's, delen/samenwerken. Privé-tool, geen gevoelige informatie.
