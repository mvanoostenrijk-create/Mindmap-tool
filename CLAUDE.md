# Mindmap-tool (Mindmeister-achtig, met Todoist)

Statische webapp zonder build-stap: `index.html`, `style.css`, `app.js` (vanilla JS). UI in het Nederlands.
Overig: `config.js` (Supabase-URL + publishable key), `supabase.js` (supabase-js 2.45.4, ongewijzigd meegeleverd), `supabase.sql` (tabel `maps` + RLS), `sw.js` + `manifest.webmanifest` + iconen (PWA).
Gebruiker werkt met beperkte tokens: één fase per sessie, geen frameworks, geen onnodige bestanden.

## Opzet app.js
- `store`: lokale opslag met async `list/load/save/remove`; blijft leidend (offline). Mindmaps in IndexedDB (`idb`), index/tombstones/instellingen in localStorage; `keep()` schrijft een synchrone noodkopie naar localStorage bij afsluiten.
- Import (`importFiles`, `parseFreemind`, `unzip` incl. zip64): MindMeister-export als FreeMind .mm of zip, en eigen .json. Getest met een echte export van 943 takken.
- `cloud`: sync met Supabase-tabel `maps`, per mindmap wint de laatste wijziging (`updated`), verwijderen via tombstone (`deleted`). Alleen inloggen met e-mail + wachtwoord; gebruiker is handmatig in Supabase aangemaakt. Getest met nagebootste backend, zie fases.
- Model: `map = {id,title,updated,root,theme?}`; node = `{id,text,children[],collapsed?,side?,color?,icon?,note?,link?,map?,task?}`. `side` alleen op kinderen van de root; `color` (index in palet) erft naar beneden. `theme = {style,edge,palette}` (zie `theme()`, `PALETTES`). Titel = tekst van de root.
- Overzicht (`#portal`, `drawList`, `miniSvg`) is de startpagina; `route()` kiest op basis van `#m=<id>`. `body.home` = overzicht zichtbaar. `arrange()` is de gedeelde boomindeling (editor en miniaturen).
- Mappen: `map.folder` (naam, één niveau, synct mee in `data`); een map bestaat zolang er een mindmap in zit. `folder` = gekozen map in het overzicht, `setFolder()` verplaatst/hernoemt.
- Doorklikken: `node.map` = id van een andere mindmap; kiezen in het opmaak-venster (`fillMaps`, keuzelijst `fMap` met optgroups per map, of nieuwe lege mindmap). `follow(id)` opent hem en zet `{id,title}` op `trail`; `openMap(m, keepTrail)` wist `trail` behalve bij doorklik/terug; `route()` haalt bij browser-terug het laatste item eraf. Terugknop `bBack` en knop `peekMap` worden in app.js opgebouwd. `store.title(id)` leest de titel synchroon uit de index. Kiezen uit het overzicht: `pickFromPortal(nodeId)` zet `picking` en `body.picking` (balk `#pPick`, eigen kaart/nieuw/✕/📁/🔗 verborgen), `endPick(id?)` koppelt of annuleert. Kopiëren: knop `.cp` op de kaart zet `{id,title}` in `clip` (localStorage `mm:clip`, per apparaat) en het adres op het klembord; plakken via `peekPaste` of Ctrl+V → `pasteMap(id)` maakt een gekoppelde subtak en wist `clip`. `mapIdOf(url)` herkent eigen adressen (`#m=<id>`) in het linkveld en bij plakken (`paste`-event). Korte meldingen in de editor via `say()` (in `#peekNote`).
- Opmaak-venster: module `format`. Icoon/taak/notitie/link tonen via `data-pre`/`data-post` op `.txt` (`pre()`, `post()`), ook in de export.
- Verbindingen: `map.links = [{id,a,b}]`, getekend in `layout()` via `linkShape()`; `selLink`/`linking` zijn de selectie- en tekenstand. Undo-snapshot bevat `root` + `links`.
- Whiteboard: `map.items = [{id,kind (note/rect/oval/text),x,y,w,h,text,color?}]` in wereldcoördinaten (root = 0,0), DOM in `iels` via `drawItems()`, selectie `selItem` (los van `sel`). Items staan ook in `geo`, dus `fit()`, export en `map.links` (eind mag tak of item zijn, zie `has()`) werken mee. Balk `#board` en knop `tBoard` worden in app.js opgebouwd, niet in index.html. Undo-snapshot bevat ook `items`. Meervoudige selectie: Set `more` (alle gekozen items, `selItem` = laatste; `picks()` geeft de lijst), via Shift/Ctrl-klik, stand `multiMode` (knop `wMulti`) of kader (`g.type 'box'`, `lasso`); `render()` bewaakt dat `more` leeg is bij minder dan 2.
- Afbeeldingen: `node.img = {src (data-URL, max 320px), w, h, by?}` via `shrink()`; module `media` (bestand, Pexels met sleutel, anders Openverse `api.openverse.org/v1/images/` met `license=cc0,pdm`). Sleutels per apparaat via module `keys` (`mm:pexels`, `mm:claude`).
- Claude: module `claude`, rechtstreeks `fetch` naar de Messages API (geen SDK: app heeft geen build-stap). Model `claude-opus-5-5`, effort `medium`, structured output (`reply` + `actions` met op add/rename/move/delete/note; `apply()` voert de aangevinkte uit als één undo-stap en slaat ongeldige over), `fallbacks: "default"`. Elke vraag is één losstaand user-bericht (geen assistant-beurten terugsturen). Bij wijzigingen eerst de skill `claude-api` lezen.
- Bijlagen: module `files`; bestanden in Supabase Storage-bucket `bijlagen` op pad `<user-id>/<map-id>/<id>` (zie supabase.sql), `node.files = [{id,path,name,size,type}]`. Openen via signed URL. Verwijderde takken/mindmaps laten weesbestanden achter (nog geen opruiming).
- `render()` → `index()` (info per node) → DOM-nodes in `#world` → `layout()` (automatische boomindeling, links/rechts) → SVG-lijnen.
- Wijzigingen altijd via `change(fn)` (undo-snapshot + opslaan + render).
- Invoer: pointer events (pan, pinch, slepen = verplaatsen/herordenen, dubbeltik = bewerken) en toetsenbord (Tab, Enter, Delete, F2, spatie, pijlen, Ctrl+Z/Y).

## Fases
1. Kern-editor, lokaal opgeslagen — KLAAR (touch/pinch nog niet op echte iPad getest).
2. Login + cloud-sync + PWA — KLAAR. Draait op GitHub Pages (repo is publiek): https://mvanoostenrijk-create.github.io/Mindmap-tool/ ; gebruiker bevestigt dat het werkt, ook op iPad.
3. Todoist — KLAAR (module `todoist` in app.js). API v1 (`https://api.todoist.com/api/v1/`), rechtstreeks vanuit de browser met persoonlijk token in localStorage (per apparaat). `node.task = {id, done, due, gone?}` synct mee. Status via GET `tasks/{id}` bij openen, terugkeren naar de app en elke 5 min. Gebruiker bevestigt dat het werkt.
4. Export — GEBOUWD (zijbalk): PNG via canvas (`drawCanvas`, altijd licht thema), PDF als zelfgebouwd één-pagina-A4-bestand met JPEG (`makePdf`), Markdown-outline (`outline`) als bestand of naar klembord. `deliver()` gebruikt op touch-apparaten het deelmenu, anders download. Getest in Chromium; deelmenu op iPad nog niet bevestigd.

6. Verbindingen, afbeeldingen + Pexels, Claude-paneel — GEBOUWD; Pexels en Claude alleen getest met nagebootste API's (CORS in de praktijk onbevestigd). Webvoorbeeld van een link via `api.microlink.io` (schermafbeelding → `node.img`), knop `fLinkShot` in module `media`; ook alleen nagebootst getest.

7. Whiteboard-elementen (plaknotitie, rechthoek, ellips, tekst, pijlen via verbindingen) — GEBOUWD, getest in Chromium met muis; touch niet getest. Meervoudige selectie van items (niet van takken). Geen vrij tekenen.

5. Opmaak per tak, thema's per mindmap, overzichtspagina, README — GEBOUWD, getest in Chromium.

8. Doorklikken van een tak naar een andere mindmap, met terugknop; koppelen via lijst, kiezen uit overzicht of kopiëren/plakken vanuit het overzicht — GEBOUWD, getest in Chromium (muis, toetsenbord, telefoonbreedte); iPad (touch, klembord) en sync tussen apparaten niet getest.

Buiten scope: delen/samenwerken. README.md is de gebruikershandleiding: bijwerken bij nieuwe functies. Privé-tool, geen gevoelige informatie.
