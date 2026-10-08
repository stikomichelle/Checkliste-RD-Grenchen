# RD Fallübungen – Anleitung

## 1. Online stellen (Netlify)
Neue Version: In Netlify im Projekt unter «Deploys» die Datei `rd-checkliste-netlify.zip` ins Feld unten ziehen.

Erstmals:
1. ZIP entpacken.
2. https://app.netlify.com/drop öffnen.
3. Den ganzen Ordner `rd-checkliste` ins Fenster ziehen.
4. Netlify zeigt eine Adresse (z. B. `https://xyz.netlify.app`). Diese teilst du mit den Studierenden.
   Tipp: Mit einem kostenlosen Netlify-Konto bleibt die Seite dauerhaft und du kannst den Namen ändern.

Wichtig: Die App funktioniert nur über eine Webadresse, nicht durch Doppelklick auf `index.html`.

## 2. Auf dem iPhone / iPad installieren
1. Adresse in **Safari** öffnen.
2. «Teilen» → «Zum Home-Bildschirm».
3. Die App startet nun im Vollbild und funktioniert nach dem ersten Öffnen auch offline.

## 3. Bedienung
- **Übung**: Hinweise («?»), rote Markierung kritischer Punkte und Instruktor-Infos sind sichtbar.
- **Prüfung**: Nur die Checkliste, alle Hilfen ausgeblendet.
- Der Timer startet automatisch beim ersten Häkchen (oder manuell mit ▶).
- Jedes Häkchen erhält die Zeit seit Einsatzbeginn (z. B. +03:12).
- Bei xABCDE hat jeder Hauptpunkt Unterpunkte. Sind alle Unterpunkte abgehakt, hakt sich der Hauptpunkt automatisch ab.
- Es gibt kein Punktesystem. «Zusammenfassung anzeigen» zeigt am Schluss, was erledigt bzw. nicht erledigt wurde (mit Zeiten) sowie die Notizen; als Text kopieren oder drucken / als PDF sichern.
- Fortschritt wird nur auf dem jeweiligen Gerät gespeichert.

## 4. Fälle bearbeiten (`faelle.json`)
Die Datei mit einem Texteditor öffnen (z. B. TextEdit im Modus «Reiner Text» oder VS Code).

**`phasen`** – die 9 Standardphasen, die in jedem Fall vorkommen.
**`faelle`** – die einzelnen Fallbeispiele. Ein Fall besteht aus:

```json
{
  "id": "hypoglykaemie",
  "titel": "Bewusstseinsstörung",
  "kategorie": "Internistisch",
  "dringlichkeit": "P1",
  "meldung": { "alarm": "…", "ort": "…", "situation": "…" },
  "instruktor": {
    "vitalwerte": [["HF", "110/min"], ["BZ", "1.8 mmol/l"]],
    "befunde": "…",
    "verlauf": ["…", "…"]
  },
  "zusatzpunkte": {
    "xabcde": [
      { "id": "hy-1", "text": "Blutzucker gemessen", "info": "Worauf achten …", "kritisch": true }
    ]
  }
}
```

Regeln:
- Jede `id` innerhalb eines Falls nur einmal verwenden, ohne Leerzeichen.
- Phasen-Namen für `zusatzpunkte`: `vorbereitung`, `szene`, `ersteindruck`, `xabcde`, `anamnese`, `secondary`, `massnahmen`, `transport`, `uebergabe`.
- `info` und `kritisch` sind freiwillig.
- Unterpunkte werden so ergänzt (jede `id` nur einmal):
  ```json
  { "id": "b", "text": "B – Breathing (Atmung)", "unterpunkte": [
      { "id": "b-1", "text": "Atemfrequenz?" },
      { "id": "b-2", "text": "Hautkolorit (Zyanose)?" }
  ] }
  ```
- Zwischen zwei Einträgen steht ein Komma, nach dem letzten nicht.
- Zur Kontrolle vor dem Hochladen: Inhalt in https://jsonlint.com einfügen.

Nach dem Bearbeiten den Ordner einfach erneut auf Netlify hochladen. Geänderte Fälle erscheinen beim nächsten Öffnen mit Internet.

Achtung: Wird die `id` eines Punktes geändert, geht dessen gespeicherter Haken auf den Geräten verloren.

## 5. Design oder Funktionen ändern
Änderungen werden automatisch geladen, sobald das Gerät online ist. Eine Versionsnummer muss nicht mehr angepasst werden.
