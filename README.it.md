# Chrome Mistral OCR

Estensione Chrome per trascrivere documenti e immagini con Mistral OCR. Funziona dal popup dell'estensione, salva i risultati localmente e consente anteprima, modifica, copia, esportazione Markdown, esportazione immagini e generazione di output PDF dalla preview renderizzata.

## Privacy

Questa estensione invia a Mistral AI i documenti, le immagini o i file che scegli di elaborare. Usandola, accetti che questi contenuti vengano trattati secondo i termini e le policy correnti di Mistral AI.

Termini di Mistral AI: https://mistral.ai/terms

Note importanti:

- Questa estensione è indipendente e non è associata a Mistral AI.
- La tua API key è salvata in `chrome.storage.local` dentro Chrome.
- Se elabori documenti sensibili, controlla prima le condizioni di privacy del tuo piano Mistral AI.

## Funzionalità principali

- OCR con `mistral-ocr-latest`.
- Due API key con nomi personalizzati e selettore rapido nel popup.
- Estrazione immagini opzionale.
- Esportazione immagini come ZIP o file separati.
- Preview/Edit con editor Markdown, vista renderizzata, autosave opzionale, copia, esportazione Markdown ed esportazione PDF.
- Evidenziazione delle parole OCR a bassa confidenza.
- Elenco completo delle trascrizioni salvate con ricerca per nome, URL, SHA o tipo.
- Compatibilità con Google Docs, Google Slides e Google Sheets.
- Localizzazione automatica in base alla lingua del browser, con inglese come fallback.

## Primo utilizzo

1. Crea una API key in Mistral Console: https://console.mistral.ai/
2. Apri l'estensione e fai clic su `Configura`.
3. Incolla la chiave in `API key 1`.
4. Facoltativamente configura `API key 2` per alternare tra due account o profili.
5. Fai clic su `Salva`.
6. Apri in Chrome un documento o un'immagine compatibile.
7. Apri l'estensione `Mistral OCR`.
8. Attiva o disattiva `Download images` secondo necessità.
9. Fai clic su `Transcribe (OCR)`.

Se esiste già una trascrizione per l'URL corrente, il pulsante principale cambia in `Overwrite`.

Importante: per usare PDF o file locali con `file://`, abilita `Allow access to file URLs` per questa estensione in `chrome://extensions`.

## Formati supportati

- PDF.
- Immagini: `jpg`, `jpeg`, `png`, `avif`, `tif`, `tiff`, `gif`, `heic`, `heif`, `bmp`, `webp`.
- Documenti/file: `docx`, `doc`, `pptx`, `ppt`, `xlsx`, `csv`, `txt`, `epub`, `xml`, `rtf`, `odt`, `bib`, `fb2`, `ipynb`, `tex`, `opml`, `man`.
- Google Docs, Slides e Sheets esportano in PDF per impostazione predefinita, con formati nativi opzionali da Opzioni.

I formati nativi Google possono migliorare la precisione, ma possono anche esporre testo nascosto presente nel file originale.

## Risoluzione dei problemi

Se l'OCR non parte, verifica che una API key sia salvata e che la scheda attiva contenga una risorsa compatibile. Se è già in corso un OCR in background, attendi che termini oppure annullalo.

Se i file locali non funzionano, apri `chrome://extensions`, entra nei dettagli di questa estensione e abilita `Allow access to file URLs`.

## Legale

Questo software è indipendente e non ufficiale. Non è associato a Mistral AI. Il progetto include la licenza MIT in `LICENSE` e gli avvisi di copyright in `COPYRIGHT`.
