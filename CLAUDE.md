# Mindmap-tool (Mindmeister-achtig, met Todoist)

Statische webapp zonder build-stap: `index.html`, `style.css`, `app.js` (vanilla JS). UI in het Nederlands.
Gebruiker werkt met beperkte tokens: één fase per sessie, geen frameworks, geen onnodige bestanden.

## Opzet app.js
- `store`: opslaglaag (nu localStorage) met async `list/load/save/remove`. Fase 2 vervangt alleen dit object.
- Model: `map = {id,title,updated,root}`; node = `{id,text,children[],collapsed?,side?,color?}`. `side`/`color` alleen op kinderen van de root. Titel = tekst van de root.
- `render()` → `index()` (info per node) → DOM-nodes in `#world` → `layout()` (automatische boomindeling, links/rechts) → SVG-lijnen.
- Wijzigingen altijd via `change(fn)` (undo-snapshot + opslaan + render).
- Invoer: pointer events (pan, pinch, slepen = verplaatsen/herordenen, dubbeltik = bewerken) en toetsenbord (Tab, Enter, Delete, F2, spatie, pijlen, Ctrl+Z/Y).

## Fases
1. Kern-editor, lokaal opgeslagen — KLAAR (touch/pinch nog niet op echte iPad getest).
2. Login + cloud-sync (Supabase, EU-regio) + hosting als PWA (manifest, service worker). Hostingkeuze nog open.
3. Todoist: taak aanmaken vanuit node (project, deadline, prioriteit) + status terugzien + link. Veld `task` op de node. Eerst checken of Todoist-API rechtstreeks vanuit de browser mag (CORS); anders Supabase Edge Function.
4. Export: PNG, PDF, Markdown-outline.

Buiten scope: opmaak/thema's, delen/samenwerken. Privé-tool, geen gevoelige informatie.
