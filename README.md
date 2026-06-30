# Chrome Mistral OCR

Chrome extension for transcribing documents and images with Mistral OCR. It runs from the extension popup, stores results locally, and lets you preview, edit, copy, export Markdown, export images, and generate PDF output from the rendered preview.

## Privacy

This extension sends the documents, images, or files you choose to process to Mistral AI. By using it, you accept that those contents are handled according to Mistral AI's current terms and policies.

Mistral AI terms: https://mistral.ai/terms

Important notes:

- This extension is independent and is not associated with Mistral AI.
- Your API key is stored in `chrome.storage.local` inside Chrome.
- If you process sensitive documents, review your Mistral AI plan's privacy conditions first.

## Main Features

- OCR with `mistral-ocr-latest`.
- Two API keys with custom labels and a quick selector in the popup.
- Optional image extraction.
- Image export as ZIP or separate files.
- Preview/Edit with Markdown editor, rendered view, optional autosave, copy, Markdown export, and PDF export.
- Low-confidence OCR word highlighting.
- Full saved-transcriptions list with search by name, URL, SHA, or type.
- Google Docs, Google Slides, and Google Sheets support.
- Browser-language localization with English fallback.

## First Use

1. Create an API key in Mistral Console: https://console.mistral.ai/
2. Open the extension and click `Configure`.
3. Paste the key into `API key 1`.
4. Optionally configure `API key 2` to switch between two accounts or profiles.
5. Click `Save`.
6. Open a compatible document or image in Chrome.
7. Open the `Mistral OCR` extension.
8. Enable or disable `Download images` as needed.
9. Click `Transcribe (OCR)`.

If a transcription already exists for the current URL, the main button changes to `Overwrite`.

Important: to use local PDFs or files with `file://`, enable `Allow access to file URLs` for this extension in `chrome://extensions`.

## Supported Formats

Primarily supports PDF documents that are rendered by Chrome.

Google Docs, Google Slides, and Google Sheets are exported as PDF by default. Native Google formats (docx; pptx; xlsx; csv) can also be enabled from Options. Native formats may improve OCR accuracy, but they can also expose hidden text contained in the original file.

Additionally, the extension can work with any image that Chrome renders individually in a new tab. These formats include: jpg, jpeg, png, avif, gif, bmp, and webp.

## Troubleshooting

If OCR does not start, verify that an API key is saved and the active tab contains a compatible resource. If a background OCR job is already running, wait for it to finish or cancel it.

If local files do not work, open `chrome://extensions`, open this extension's details, and enable `Allow access to file URLs`.

## Legal

This software is independent and unofficial. It is not associated with Mistral AI. The project includes the MIT license in `LICENSE` and copyright notices in `COPYRIGHT`.
