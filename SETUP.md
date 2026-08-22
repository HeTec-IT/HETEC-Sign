# HETEC Sign – Setup

## Jetzt schon testbar (ohne jedes Deployment)

- **tablet-app/index.html** direkt im Browser öffnen → "Test: Beispiel-PDF laden" →
  kompletter Ablauf (Vertrag lesen, Fortschritt, Unterschrift, Einbettung) läuft
  rein lokal, Ergebnis wird als PDF heruntergeladen. Kein Firebase nötig.
- **pc-app/index.html** direkt öffnen → "PDF manuell öffnen (Test)" → lokale
  Vertragserkennung (Keyword-Scoring) läuft sofort, auch ohne Firebase.
  Erst der Klick auf "Auf Tablet öffnen" braucht ein echtes Firebase-Projekt.

## Für den echten Ablauf (PC ↔ Tablet über Sitzungen)

1. **Eigenes Firebase-Projekt anlegen** (bewusst getrennt von
   `o2-pencil-selling` / `pencil-selling-telekom`, da hier auch anonyme,
   nicht kontrollierte Kundentablets Zugriff bekommen).
   - Firestore aktivieren (Standort: `eur3` / Europa).
   - Storage aktivieren (Standort: Europa, z. B. `europe-west1` / `europe-west3`).
   - Authentication → Sign-in-Methode "Anonym" aktivieren.
2. Config-Objekt aus der Firebase-Konsole in **beide** Dateien eintragen:
   - `pc-app/index.html`, Zeile mit `const firebaseConfig = {...}`
   - `tablet-app/index.html`, dieselbe Stelle (muss identisch sein).
3. Rules & Function deployen:
   ```
   cd backend
   npm install --prefix functions
   firebase deploy --only firestore:rules,storage:rules,functions
   ```
   Vorher lokal prüfen: `firebase emulators:start` – die Rules sind nicht
   live getestet.
4. **pc-app/** und **tablet-app/** wie gewohnt auf GitHub Pages veröffentlichen
   (z. B. `hetec-it.github.io/HETEC-Sign/pc-app/` und `.../tablet-app/`).
   In `pc-app/index.html` die Konstante `HETEC_TABLET_BASE_URL` an die
   tatsächliche Tablet-URL anpassen.
5. **PC-App als PWA installieren** (Edge/Chrome, kein Adminrecht nötig):
   Adressleiste → App installieren. Danach beim ersten PDF-Öffnen einmalig
   "HETEC Sign" als App auswählen.
   - Falls Gruppenrichtlinien das Setzen einer *Standard*-App pro Dateityp
     blockieren: funktioniert weiterhin per Rechtsklick auf die PDF → "Öffnen
     mit" → HETEC Sign (nur ein Klick mehr, kein Adminrecht nötig).
6. **Tablet:** einmal die Tablet-URL öffnen und "Zum Startbildschirm
   hinzufügen", damit sie sich wie eine App anfühlt (Vollbild).

## Bekannte Grenzen dieses Prototyps

- Sehr große PDFs (deutlich über ~10 MB) können an Direct-Upload-Limits von
  Firebase Storage/Firestore-Dokumentgrößen stoßen – für Standard-Vertrags-
  PDFs unkritisch, bei Bedarf später auf signierte Upload-URLs umstellen.
- "Per E-Mail senden" kann aus Browsern heraus keine Datei an eine `mailto:`-
  Mail anhängen (Browser-Sicherheitsbeschränkung) – die App lädt die PDF
  herunter und öffnet parallel den Mail-Client zum manuellen Anhängen.
- Icons (`icon-192.png`, `icon-512.png`) sind Platzhalter – gerne durch
  echtes HeTec-Branding ersetzen.
