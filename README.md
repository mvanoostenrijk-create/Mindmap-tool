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
| Mindmap verwijderen | ✕ op de kaart, daarna "Zeker?" |
| Terug naar het overzicht | ⌂ linksboven in een mindmap, of de terug-knop van de browser |

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
- **Notitie:** extra toelichting. De tak krijgt een 🗒 en de notitie verschijnt onderin beeld als je de tak selecteert.
- **Link:** een webadres. De tak krijgt een 🔗 en de link verschijnt onderin beeld als je de tak selecteert.

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
| Links en rechts van het midden | Afbeeldingen en bijlagen |
| Notities, als platte tekst | Verbindingspijlen tussen takken |
| Weblinks | Taken en opmerkingen uit MindMeister |
| De meest gebruikte iconen | Overige iconen |

Een mindmap met meer dan 150 takken wordt vanaf het derde niveau ingeklapt geïmporteerd, zodat hij te overzien blijft. Het getal in het rondje toont hoeveel takken eronder zitten.

Via dezelfde knop kun je ook een eigen back-up (.json) terugzetten.

## Techniek en beheer

- De app is een statische website zonder bouwstap: `index.html`, `style.css` en `app.js`. Hosting via GitHub Pages; een wijziging op de `main`-branch staat na een à twee minuten online.
- Op het apparaat zelf staan mindmaps in de browseropslag (IndexedDB), zodat de app ook offline werkt.
- Mindmaps staan in een Supabase-database (EU-regio), afgeschermd per gebruiker. De tabel staat beschreven in `supabase.sql`, de projectgegevens in `config.js`.
- `CLAUDE.md` beschrijft de opbouw van de code voor wie eraan verder werkt.
