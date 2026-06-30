# Chrome Mistral OCR

Extensión de Chrome para transcribir documentos e imágenes con Mistral OCR. Funciona desde el popup de la extensión, guarda los resultados localmente y permite previsualizar, editar, copiar, exportar Markdown, exportar imágenes y generar salida PDF desde la vista renderizada.

## Privacidad

Esta extensión envía a Mistral AI los documentos, imágenes o archivos que elijas procesar. Al usarla, aceptas que esos contenidos se gestionan de acuerdo con los términos y políticas vigentes de Mistral AI.

Términos de Mistral AI: https://mistral.ai/terms

Notas importantes:

- Esta extensión es independiente y no está asociada a Mistral AI.
- Tu API key se guarda en `chrome.storage.local` dentro de Chrome.
- Si procesas documentos sensibles, revisa primero las condiciones de privacidad de tu plan de Mistral AI.

## Funciones principales

- OCR con `mistral-ocr-latest`.
- Dos API keys con nombres personalizados y selector rápido en el popup.
- Extracción opcional de imágenes.
- Exportación de imágenes como ZIP o como archivos separados.
- Preview/Edit con editor Markdown, vista renderizada, guardado automático opcional, copia, exportación Markdown y exportación PDF.
- Resaltado de palabras OCR con baja confianza.
- Lista completa de transcripciones guardadas con búsqueda por nombre, URL, SHA o tipo.
- Compatibilidad con Google Docs, Google Slides y Google Sheets.
- Localización automática según el idioma del navegador, con inglés como fallback.

## Primer uso

1. Crea una API key en Mistral Console: https://console.mistral.ai/
2. Abre la extensión y haz clic en `Configurar`.
3. Pega la clave en `API key 1`.
4. Opcionalmente configura `API key 2` para alternar entre dos cuentas o perfiles.
5. Haz clic en `Guardar`.
6. Abre en Chrome un documento o imagen compatible.
7. Abre la extensión `Mistral OCR`.
8. Activa o desactiva `Descargar imágenes` según lo necesites.
9. Haz clic en `Transcribir (OCR)`.

Si ya existe una transcripción para la URL actual, el botón principal cambia a `Sobreescribir`.

Importante: para usar PDFs o archivos locales con `file://`, activa `Permitir el acceso a URLs de archivos` para esta extensión en `chrome://extensions`.

## Formatos soportados

Soporta principalmente documentos PDF que se muestren renderizados por Chrome.

Google Docs, Google Slides y Google Sheets se exportan como PDF por defecto. Los formatos nativos de Google (docx; pptx; xlsx; csv) también pueden activarse desde Opciones. Los formatos nativos pueden mejorar la precisión del OCR, pero también pueden exponer texto oculto contenido en el archivo original.

Adicionalmente, la extensión puede funcionar con cualquier imagen que Chrome renderice de forma individual en una nueva pestaña. Estos formatos incluyen: jpg, jpeg, png, avif, gif, bmp y webp.

## Solución de problemas

Si el OCR no inicia, verifica que haya una API key guardada y que la pestaña activa contenga un recurso compatible. Si ya hay un OCR en segundo plano en curso, espera a que termine o cancélalo.

Si los archivos locales no funcionan, abre `chrome://extensions`, entra a los detalles de esta extensión y activa `Permitir el acceso a URLs de archivos`.

## Legal

Este software es independiente y no oficial. No está asociado a Mistral AI. El proyecto incluye la licencia MIT en `LICENSE` y avisos de copyright en `COPYRIGHT`.
