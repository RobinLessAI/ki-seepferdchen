# 🐠 KI-Seepferdchen – Spielbrett für Beamer + Handy-Steuerung

Ein kindgerechtes Brettspiel (8–10 Jahre) für den Beamer, gesteuert mit dem Handy.

| Datei | Wofür |
|---|---|
| `index.html` | Startseite mit Links zu beiden Ansichten |
| `beamer.html` | **Spielbrett** für Laptop/Beamer (Vollbild) |
| `steuerung.html` | **Steuerung** fürs Handy |

## So geht's

1. Den Ordner auf einem Webserver bereitstellen, z. B. **GitHub Pages**
   (Repo → *Settings → Pages → Branch wählen*). Dann ist das Spiel unter
   `https://<name>.github.io/ki-seepferdchen/` erreichbar.
2. Laptop am Beamer: `beamer.html` öffnen → **„Vollbild & Ton starten“** klicken.
3. Handy: den **QR-Code** auf dem Beamer scannen (oder `steuerung.html` öffnen und den 4-stelligen Code eingeben).
4. Auf dem Handy:
   - **Spieler**: Anzahl 1–10, Namen, Farbe, eigenes Foto/Logo (oder Meerestier).
   - **Fragen**: Bild hochladen + Text darunter. Reihenfolge ändern, bearbeiten, löschen.
   - **Spiel**: Start / Spielfeld / Schatzkammer umschalten, mit ◀ ▶ durch die Fragen blättern,
     Spieler-Kachel antippen = **+1 Muschel**, „Alle +1“, „Konfetti“.
   - **Mehr**: Titel, Töne, Jubel-Animation, Sicherung herunterladen/laden, Muscheln zurücksetzen.

## Die drei Ansichten auf dem Beamer

- **Start** – Titel, schwimmende Seepferdchen, alle Kinder mit Bild, QR-Code zum Verbinden.
- **Spielfeld** – in der Mitte Bild + gut lesbarer Text, links und rechts die Kinder mit ihren Muscheln.
  Bei jeder Muschel: Jubel mit Bild und Namen („Super gemacht, Lena!“), eine Muschel fliegt zur Karte, Konfetti, Ton.
- **Schatzkammer** (Abschluss) – bewusst **ohne Ranking**: Alle Kinder bleiben in ihrer festen Reihenfolge,
  jede*r bekommt ein Glas, das sich Muschel für Muschel füllt. Groß angezeigt wird die **gemeinsam** gesammelte Zahl,
  und am Ende bekommen **alle gleichzeitig** das „KI-Seepferdchen“-Abzeichen.

## PIN-Schutz 🔒

- Beim ersten Öffnen legt man auf dem Beamer und auf dem Handy eine **4-stellige PIN** fest (auf beiden Geräten dieselbe).
  Danach öffnet sich das Spiel nur mit dieser PIN.
- Nur Handys mit der richtigen PIN dürfen sich mit dem Beamer verbinden und bekommen die Daten. Nach 5 falschen Versuchen
  sperrt der Beamer neue Verbindungen für eine Minute.
- Die PIN steht **nicht im Code** – jedes Gerät speichert nur eine Prüfsumme davon.
- Ändern: Handy → *Mehr → PIN ändern* (gilt bei bestehender Verbindung auch für den Beamer).
- *PIN vergessen?* löscht die auf diesem Gerät gespeicherten Daten, danach kann eine neue PIN festgelegt werden.
  Eine heruntergeladene Sicherung lässt sich anschließend wieder laden.

## Gut zu wissen

- **Verbindung:** Handy und Beamer verbinden sich direkt per WebRTC (PeerJS). Für den Verbindungsaufbau
  wird kurz der kostenlose PeerJS-Vermittlungsserver genutzt → beide Geräte brauchen Internet.
  Am zuverlässigsten im **selben WLAN**. Bricht die Verbindung ab, verbindet sich das Handy automatisch neu.
- **Speicherung:** Der Beamer speichert alles (inkl. Bilder) im Browser – nach einem Neuladen ist der Stand wieder da.
  Das Handy speichert eine Kopie. Ist der Beamer leer (z. B. anderer Laptop), schickt das Handy beim Verbinden
  automatisch seine Fragen & Spieler hinüber. Man kann also **vorab auf dem Handy vorbereiten**.
- **Bilder** werden auf dem Handy automatisch verkleinert, damit die Übertragung schnell geht.
- **Notfall-Tastatur am Beamer-Laptop:** `→`/Leertaste weiter, `←` zurück, `1`…`0` Muschel für Spieler 1–10
  (`Shift` = abziehen), `A` alle +1, `K` Konfetti, `S`/`G`/`B` Start/Spielfeld/Schatzkammer, `F` Vollbild.
- **Testen an einem Rechner:** `beamer.html` und `steuerung.html?local=1` im selben Browser in zwei Fenstern öffnen.

Verwendete Bibliotheken (lokal in `js/vendor/`, MIT-Lizenz): [PeerJS](https://peerjs.com) 1.5.4,
[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4.
