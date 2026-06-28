# Chrome Mistral OCR

Chrome-Erweiterung zum Transkribieren von Dokumenten und Bildern mit Mistral OCR. Sie läuft über das Popup der Erweiterung, speichert Ergebnisse lokal und ermöglicht Vorschau, Bearbeitung, Kopieren, Markdown-Export, Bildexport und PDF-Ausgabe aus der gerenderten Ansicht.

## Datenschutz

Diese Erweiterung sendet die Dokumente, Bilder oder Dateien, die du verarbeiten möchtest, an Mistral AI. Mit der Nutzung akzeptierst du, dass diese Inhalte gemäß den aktuellen Bedingungen und Richtlinien von Mistral AI verarbeitet werden.

Mistral-AI-Bedingungen: https://mistral.ai/terms

Wichtige Hinweise:

- Diese Erweiterung ist unabhängig und nicht mit Mistral AI verbunden.
- Dein API-Schlüssel wird in `chrome.storage.local` innerhalb von Chrome gespeichert.
- Wenn du sensible Dokumente verarbeitest, prüfe zuerst die Datenschutzbedingungen deines Mistral-AI-Plans.

## Hauptfunktionen

- OCR mit `mistral-ocr-latest`.
- Zwei API-Schlüssel mit benutzerdefinierten Namen und schnellem Umschalter im Popup.
- Optionale Bildextraktion.
- Bildexport als ZIP oder als einzelne Dateien.
- Preview/Edit mit Markdown-Editor, gerenderter Ansicht, optionalem Autosave, Kopieren, Markdown-Export und PDF-Export.
- Hervorhebung von OCR-Wörtern mit geringer Zuverlässigkeit.
- Vollständige Liste gespeicherter Transkriptionen mit Suche nach Name, URL, SHA oder Typ.
- Unterstützung für Google Docs, Google Slides und Google Sheets.
- Automatische Lokalisierung nach Browsersprache mit Englisch als Fallback.

## Erste Schritte

1. Erstelle einen API-Schlüssel in der Mistral Console: https://console.mistral.ai/
2. Öffne die Erweiterung und klicke auf `Konfigurieren`.
3. Füge den Schlüssel in `API key 1` ein.
4. Optional kannst du `API key 2` konfigurieren, um zwischen zwei Konten oder Profilen zu wechseln.
5. Klicke auf `Speichern`.
6. Öffne in Chrome ein kompatibles Dokument oder Bild.
7. Öffne die Erweiterung `Mistral OCR`.
8. Aktiviere oder deaktiviere `Bilder herunterladen` nach Bedarf.
9. Klicke auf `Transkribieren (OCR)`.

Wenn für die aktuelle URL bereits eine Transkription vorhanden ist, wechselt die Hauptschaltfläche zu `Überschreiben`.

Wichtig: Um lokale PDFs oder Dateien mit `file://` zu verwenden, aktiviere `Zugriff auf Datei-URLs zulassen` für diese Erweiterung in `chrome://extensions`.

## Unterstützte Formate

- PDF.
- Bilder: `jpg`, `jpeg`, `png`, `avif`, `tif`, `tiff`, `gif`, `heic`, `heif`, `bmp`, `webp`.
- Dokumente/Dateien: `docx`, `doc`, `pptx`, `ppt`, `xlsx`, `csv`, `txt`, `epub`, `xml`, `rtf`, `odt`, `bib`, `fb2`, `ipynb`, `tex`, `opml`, `man`.
- Google Docs, Slides und Sheets exportieren standardmäßig als PDF; native Formate sind optional in den Optionen verfügbar.

Native Google-Formate können die Genauigkeit verbessern, aber auch versteckten Text aus der Originaldatei sichtbar machen.

## Fehlerbehebung

Wenn OCR nicht startet, prüfe, ob ein API-Schlüssel gespeichert ist und ob der aktive Tab eine kompatible Ressource enthält. Wenn bereits ein Hintergrund-OCR läuft, warte auf das Ende oder brich ihn ab.

Wenn lokale Dateien nicht funktionieren, öffne `chrome://extensions`, gehe zu den Details dieser Erweiterung und aktiviere `Zugriff auf Datei-URLs zulassen`.

## Rechtliches

Diese Software ist unabhängig und inoffiziell. Sie ist nicht mit Mistral AI verbunden. Das Projekt enthält die MIT-Lizenz in `LICENSE` sowie Copyright-Hinweise in `COPYRIGHT`.
