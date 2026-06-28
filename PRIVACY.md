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
