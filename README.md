# Mindmap

Een eigen mindmap-tool in de browser, met synchronisatie tussen apparaten en een koppeling met Todoist.

**Adres:** https://mvanoostenrijk-create.github.io/Mindmap-tool/

Werkt in elke moderne browser op Windows, iPad en telefoon. Privé-tool: zet er geen vertrouwelijke of persoonsgevoelige informatie in.

## Installeren als app

- **iPad:** open het adres in Safari, tik op Delen en kies "Zet op beginscherm".
- **Windows:** open het adres in Edge of Chrome en klik op het installeer-icoon rechts in de adresbalk.

Na installatie werkt de app ook zonder internet. Wijzigingen worden bewaard op het apparaat en verstuurd zodra er weer verbinding is.

## Overzicht

De app start in het overzicht "Mijn mindmaps". Elke mindmap staat er als kaart met een miniatuur, het aantal takken en het moment van de laatste wijziging.

| Wat | Hoe |
|---|---|
| Mindmap openen | Klik of tik op de kaart |
| Nieuwe mindmap | Kaart "+ Nieuwe mindmap" |
| Zoeken op titel | Zoekveld rechtsboven |
| Hele naam van een mindmap lezen | Houd de muis even stil op de kaart |
| Mindmap verwijderen | ✕ op de kaart, daarna "Zeker?" |
| Mindmap in een map zetten | 📁 op de kaart, kies een map of "Nieuwe map…" |
| Eén map bekijken | Knoppen boven de kaarten: "Alle", per map, "Zonder map" |
| Map hernoemen of opheffen | Kies de map, daarna ✎. Een lege naam heft de map op; de mindmaps blijven bestaan |
| Terug naar het overzicht | ⌂ linksboven in een mindmap, of de terug-knop van de browser |

Een map bestaat zolang er minstens één mindmap in zit; mappen in mappen kan niet. Een nieuwe of geïmporteerde mindmap komt in de map die je op dat moment bekijkt. Zoeken gaat altijd door alle mappen. De indeling synchroniseert mee naar je andere apparaten.

Elke mindmap heeft een eigen adres. Je kunt er een bladwijzer van maken.

## Een mindmap bewerken

De titel van een mindmap is de tekst van het middelste blok.

| Actie | Toetsenbord | Muis of aanraking |
|---|---|---|
| Subtak toevoegen | Tab | Knop "+ Subtak" |
| Tak ernaast toevoegen | Enter | Knop "+ Tak ernaast" |
| Tekst bewerken | F2, of gewoon beginnen met typen | Dubbelklik of dubbeltik, of knop "Bewerk" |
| Bewerken afronden | Enter | Ergens anders klikken |
| Nieuwe regel in een tak | Shift+Enter | |
| Bewerken annuleren | Esc | |
| Tak verwijderen | Delete of Backspace | Knop "Verwijder" |
| In- of uitklappen | Spatie | Rondje naast de tak, of knop "Klap in/uit" |
| Navigeren tussen takken | Pijltjestoetsen | |
| Ongedaan maken | Ctrl+Z | ↶ |
| Opnieuw uitvoeren | Ctrl+Y of Ctrl+Shift+Z | ↷ |

**Verplaatsen:** sleep een tak naar een andere tak. Loslaten op het midden van een tak maakt er een subtak van; loslaten op de boven- of onderrand zet hem ervoor of erna. Sleep je een tak naar de linker- of rechterhelft van het midden, dan komt hij aan die kant.

**Beeld:** sleep de achtergrond om te schuiven. Zoom met het scrollwiel, met twee vingers, of met − en +. De knop ⤢ maakt de hele mindmap passend.

## Opmaak

Selecteer een tak en klik op "Opmaak".

- **Kleur:** geldt voor de tak en alle takken eronder.
- **Icoon:** verschijnt vóór de tekst.
- **Afbeelding:** kies een eigen bestand of zoek een stockfoto. De afbeelding wordt verkleind tot een miniatuur en in de mindmap zelf bewaard; het origineel niet.
- **Notitie:** extra toelichting. De tak krijgt een 🗒 en de notitie verschijnt onderin beeld als je de tak selecteert.
- **Link:** een webadres. De tak krijgt een 🔗 en de link verschijnt onderin beeld als je de tak selecteert.
- **Voorbeeld van de link:** de knop onder het linkveld maakt een schermafbeelding van de website en zet die als miniatuur in de tak. Het webadres gaat daarvoor naar de externe dienst Microlink; dat gebeurt alleen als je op de knop klikt. De gratis dienst heeft een daglimiet, en pagina's achter een login geven hooguit het inlogscherm.

## Bijlagen

Aan elke tak kun je bestanden hangen van elk type: pdf, Word, Excel, PowerPoint, afbeeldingen enzovoort, tot 50 MB per bestand.

| Wat | Hoe |
|---|---|
| Bijlage toevoegen | Opmaak → "Bestand toevoegen"; meerdere tegelijk kan |
| Bijlage openen | Selecteer de tak en klik onderin op de bijlage, of open hem via Opmaak |
| Bijlage verwijderen | Opmaak → ✕ achter de bijlage, daarna "Zeker?" |

Een tak met bijlagen krijgt een 📎. Pdf's en afbeeldingen openen in een nieuw tabblad; andere bestanden worden gedownload.

Bijlagen staan in je online opslag bij Supabase, niet op het apparaat. Je moet dus ingelogd en online zijn om ze toe te voegen of te openen. De gratis opslag is 1 GB. Verwijder je een tak of een hele mindmap, dan blijven de bijlagen daarvan in de opslag staan; opruimen kan in Supabase onder Storage → bijlagen.

## Stockfoto's

Opmaak → "Stockfoto zoeken", typ een zoekwoord en tik op een foto. Engelse zoekwoorden geven vaak meer resultaat. De naam van de maker verschijnt als je met de muis op de afbeelding staat.

- **Zonder sleutel** zoekt de app in Openverse en toont alleen rechtenvrije afbeeldingen (CC0 en publiek domein). Geen account nodig.
- **Met een Pexels-sleutel** zoekt de app in Pexels. Vraag een gratis sleutel aan op pexels.com/api en plak die per apparaat onder ☰ → "Pexels-sleutel".

## Verbindingen

Een verbinding is een gestippelde pijl tussen twee takken die niet onder elkaar hangen.

| Wat | Hoe |
|---|---|
| Verbinding maken | Selecteer de begintak, klik op "Verbind" en tik op de doeltak |
| Annuleren | Esc, of tik op de achtergrond |
| Verbinding verwijderen | Tik op de pijl en druk op Delete, of klik op "Verwijder" |

Zit een van de twee takken in een ingeklapt deel, dan is de pijl tijdelijk onzichtbaar.

## Claude denkt mee

**Eenmalig, per apparaat:** maak een account op console.anthropic.com, zet er tegoed op, maak een API-sleutel aan en plak die in de app onder ☰ → "Claude API-sleutel". Dit staat los van een Claude-abonnement: je betaalt per vraag.

Klik op "✨ Claude" voor het zijpaneel.

- **Stel subtakken voor:** aanvullingen bij de geselecteerde tak.
- **Wat ontbreekt?:** aanvullingen voor de hele mindmap.
- **Verbeter de structuur:** Claude verplaatst, hernoemt en voegt samen waar dat de opbouw duidelijker maakt.
- **Eigen vraag of opdracht:** typ hem onderin, bijvoorbeeld "zet alles over kosten onder één tak".

Claude kan takken toevoegen, hernoemen, verplaatsen, verwijderen en van een notitie voorzien. Hij voert niets zelf uit: de wijzigingen verschijnen als lijst met vinkjes, verwijderingen in rood. Met "Voer geselecteerde uit" gaan ze in één keer de mindmap in, en één keer ↶ of Ctrl+Z maakt alles weer ongedaan.

Bij elke vraag gaat de volledige tekst van de mindmap, inclusief notities, naar Anthropic. Een grote mindmap kost daardoor meer per vraag.

## Thema

In hetzelfde venster stel je het thema van de hele mindmap in. Het thema hoort bij de mindmap en gaat mee naar je andere apparaten.

- **Stijl:** Omlijnd, Gevuld of Minimaal.
- **Lijnen:** Gebogen, Recht of Haaks.
- **Kleurenschema:** Kleurrijk, Oceaan, Aarde of Grijs.

Licht of donker stel je per apparaat in onder ☰ → Weergave. Standaard volgt de app de instelling van het apparaat.

## Synchroniseren

Log in via het wolkje (☁) met het e-mailadres en wachtwoord van je account. Daarna gaat opslaan vanzelf: elke wijziging staat binnen een paar seconden op je andere apparaten.

De stip bij het wolkje toont de status:

| Stip | Betekenis |
|---|---|
| Groen | Gesynchroniseerd |
| Oranje | Offline; wijzigingen worden later verstuurd |
| Rood | Synchroniseren is mislukt; de app probeert het opnieuw |
| Grijs | Niet ingelogd; mindmaps staan alleen op dit apparaat |

Bewerk je dezelfde mindmap op twee apparaten tegelijk, dan wint de laatste wijziging en gaat de andere verloren. Na elkaar werken gaat goed.

Een nieuw wachtwoord stel je in via Supabase, onder Authentication → Users.

## Todoist

**Eenmalig koppelen, per apparaat:** kopieer in Todoist je API-token (Instellingen → Integraties → Ontwikkelaar). Plak het in de app onder ☰ → "Todoist API-token" en klik op "Koppel Todoist". Het token blijft op dat apparaat.

**Taak maken:** selecteer een tak en klik op "✓ Taak". Kies project, deadline in gewone taal ("morgen", "vrijdag", "17 nov") en prioriteit. De taak krijgt in Todoist de omschrijving "Uit mindmap: <titel>".

**Status in de mindmap:**

| Teken | Betekenis |
|---|---|
| ☐ met datum eronder | Taak staat open |
| ☑ en doorgestreept | Taak is afgerond in Todoist |
| ⚠ | Taak bestaat niet meer in Todoist |

De status wordt opgehaald bij het openen van een mindmap, bij terugkeer naar de app en elke vijf minuten. Klik opnieuw op "✓ Taak" voor de status, een link naar de taak en de knop "Ontkoppel". Afvinken doe je in Todoist zelf.

## Exporteren

Onder ☰, met een mindmap geopend:

- **Afbeelding:** PNG met witte achtergrond.
- **PDF:** één A4-pagina, liggend of staand. De tekst is een plaatje en dus niet doorzoekbaar.
- **Tekst:** Markdown-bestand met de mindmap als ingesprongen lijst, inclusief iconen, links, notities en taken.
- **Kopieer tekst:** dezelfde lijst naar het klembord.

Afbeelding en PDF tonen wat je ziet: ingeklapte takken blijven dicht. De tekstexport bevat altijd alles. Op de iPad opent het deelmenu in plaats van een download.

## Back-up

- **Download back-up:** bewaart de geopende mindmap als los bestand op het apparaat.
- **Back-up terugzetten:** opent zo'n bestand als nieuwe mindmap.

Dit staat los van de synchronisatie en is bedoeld als extra kopie.

## Importeren uit MindMeister

1. Open de mindmap in MindMeister en kies Exporteren → FreeMind (.mm). Bevat de mindmap bijlagen, dan krijg je een zip-bestand; dat is ook goed.
2. Klik in het overzicht van de app op "Importeren" en selecteer één of meer bestanden tegelijk.
3. Elke mindmap verschijnt als nieuwe kaart en synchroniseert mee.

| Komt mee | Komt niet mee |
|---|---|
| Structuur en teksten | Kleuren en stijlen (de app kiest zelf een kleur per hoofdtak) |
| Links en rechts van het midden | Afbeeldingen op volle grootte |
| Notities, als platte tekst | |
| Weblinks | Taken en opmerkingen uit MindMeister |
| De meest gebruikte iconen | Overige iconen |
| Verbindingspijlen | |
| Bijlagen (alleen uit een zip, en alleen als je bent ingelogd) | |
| Afbeeldingen als miniatuur (alleen uit een zip) | |

Een mindmap met meer dan 150 takken wordt vanaf het derde niveau ingeklapt geïmporteerd, zodat hij te overzien blijft. Het getal in het rondje toont hoeveel takken eronder zitten.

Via dezelfde knop kun je ook een eigen back-up (.json) terugzetten.

## Techniek en beheer

- De app is een statische website zonder bouwstap: `index.html`, `style.css` en `app.js`. Hosting via GitHub Pages; een wijziging op de `main`-branch staat na een à twee minuten online.
- Op het apparaat zelf staan mindmaps in de browseropslag (IndexedDB), zodat de app ook offline werkt.
- Mindmaps staan in een Supabase-database (EU-regio), afgeschermd per gebruiker. De tabel staat beschreven in `supabase.sql`, de projectgegevens in `config.js`.
- `CLAUDE.md` beschrijft de opbouw van de code voor wie eraan verder werkt.
