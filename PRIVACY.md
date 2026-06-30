# Privacy Policy for Chrome Mistral OCR

Last updated: 2026-06-28

Chrome Mistral OCR is an independent extension for transcribing, through OCR, documents, PDFs, images, and compatible files that the user chooses to process from Chrome, using the Mistral AI API.

## Data handled by the extension

The extension may handle the following data:

* Mistral API keys entered by the user.
* Documents, PDFs, images, compatible files, and exports from Google Docs, Google Slides, or Google Sheets that the user chooses to transcribe.
* OCR results, generated Markdown, extracted images, confidence scores, and transcription metadata.
* URL of the processed resource, document name, creation/update dates, file hash, and local extension preferences.

The extension does not collect the user’s full browsing history, does not monitor user activity in the background, and does not process pages that are unrelated to an OCR action initiated by the user.

## How data is used

The data is used to:

* Send the document, image, or file chosen by the user to Mistral AI in order to perform OCR.
* Authenticate the request to Mistral AI using the API key configured by the user.
* Display, edit, copy, export, and locally save transcriptions.
* Detect whether a resource has already been processed and avoid duplicates.
* Save local preferences, such as export options and API key selection.

## Who data is shared with

The extension sends to Mistral AI, via HTTPS, the documents or images that the user chooses to process and the API key required to authenticate the request. That processing is subject to Mistral AI’s terms and policies:

* https://mistral.ai/terms

The extension does not sell user data, does not share data with advertising platforms, data brokers, or information resellers, and does not use data for personalized advertising, retargeting, creditworthiness determination, or credit-related activities.

## Local storage

API keys, preferences, indexes, and metadata are stored in `chrome.storage.local`. OCR results and associated artifacts are stored locally in the browser’s IndexedDB. This data remains on the user’s device until the user deletes it from the extension, clears browser data, or uninstalls the extension.

## Security

Transmissions to Mistral AI are made over HTTPS. The extension does not execute remote code, does not load remote JavaScript, and does not use `eval()` to execute downloaded code.

## Limited use

The use of information received from Google APIs and Chrome permissions complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. The extension uses data only to provide or improve its single purpose: transcribing, through OCR, documents chosen by the user and locally managing the results.

## User control

The user can delete saved transcriptions from the extension. The user can also remove local data by uninstalling the extension or clearing the site/extension data from Chrome.

## Contact

For privacy or support inquiries, use the contact channel published in the extension’s Chrome Web Store listing.

--

# Politica de privacidad de Chrome Mistral OCR

Ultima actualizacion: 2026-06-28

Chrome Mistral OCR es una extension independiente para transcribir mediante OCR documentos, PDFs, imagenes y archivos compatibles que el usuario decide procesar desde Chrome, usando la API de Mistral AI.

## Datos que maneja la extension

La extension puede manejar los siguientes datos:

- Claves API de Mistral introducidas por el usuario.
- Documentos, PDFs, imagenes, archivos compatibles y exportaciones de Google Docs, Google Slides o Google Sheets que el usuario decide transcribir.
- Resultados OCR, Markdown generado, imagenes extraidas, puntuaciones de confianza y metadatos de transcripciones.
- URL del recurso procesado, nombre del documento, fechas de creacion/actualizacion, hash del archivo y preferencias locales de la extension.

La extension no recopila el historial completo de navegacion, no monitorea la actividad del usuario en segundo plano y no procesa paginas que no esten relacionadas con una accion de OCR iniciada por el usuario.

## Como se usan los datos

Los datos se usan para:

- Enviar a Mistral AI el documento, imagen o archivo elegido por el usuario para ejecutar OCR.
- Autenticar la solicitud ante Mistral AI con la clave API configurada por el usuario.
- Mostrar, editar, copiar, exportar y guardar localmente transcripciones.
- Detectar si un recurso ya fue procesado y evitar duplicados.
- Guardar preferencias locales, como opciones de exportacion y seleccion de clave API.

## Con quien se comparten los datos

La extension envia a Mistral AI, mediante HTTPS, los documentos o imagenes que el usuario decide procesar y la clave API necesaria para autenticar la solicitud. Ese procesamiento queda sujeto a las condiciones y politicas de Mistral AI:

- https://mistral.ai/terms

La extension no vende datos del usuario, no comparte datos con plataformas publicitarias, brokers de datos ni revendedores de informacion, y no usa datos para publicidad personalizada, retargeting, determinacion de solvencia ni actividades crediticias.

## Almacenamiento local

Las claves API, preferencias, indices y metadatos se guardan en `chrome.storage.local`. Los resultados OCR y artefactos asociados se guardan localmente en IndexedDB del navegador. Estos datos permanecen en el dispositivo del usuario hasta que el usuario los borra desde la extension, limpia los datos del navegador o desinstala la extension.

## Seguridad

Las transmisiones a Mistral AI se realizan por HTTPS. La extension no ejecuta codigo remoto, no carga JavaScript remoto y no usa `eval()` para ejecutar codigo descargado.

## Uso limitado

El uso de informacion recibida de APIs de Google y de permisos de Chrome cumple con la Politica de Datos de Usuario de Chrome Web Store, incluidos los requisitos de Uso Limitado. La extension usa los datos solamente para proporcionar o mejorar su proposito unico: transcribir mediante OCR documentos elegidos por el usuario y gestionar localmente los resultados.

## Control del usuario

El usuario puede borrar transcripciones guardadas desde la extension. Tambien puede eliminar los datos locales desinstalando la extension o borrando los datos del sitio/extension desde Chrome.

## Contacto

Para consultas de privacidad o soporte, usa el canal de contacto publicado en la ficha de Chrome Web Store de la extension.
