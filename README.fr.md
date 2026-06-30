# Chrome Mistral OCR

Extension Chrome pour transcrire des documents et des images avec Mistral OCR. Elle fonctionne depuis le popup de l'extension, enregistre les résultats localement et permet de prévisualiser, modifier, copier, exporter en Markdown, exporter les images et générer une sortie PDF depuis la vue rendue.

## Confidentialité

Cette extension envoie à Mistral AI les documents, images ou fichiers que vous choisissez de traiter. En l'utilisant, vous acceptez que ces contenus soient traités conformément aux conditions et politiques en vigueur de Mistral AI.

Conditions de Mistral AI : https://mistral.ai/terms

Notes importantes :

- Cette extension est indépendante et n'est pas associée à Mistral AI.
- Votre clé API est stockée dans `chrome.storage.local` à l'intérieur de Chrome.
- Si vous traitez des documents sensibles, vérifiez d'abord les conditions de confidentialité de votre offre Mistral AI.

## Fonctionnalités principales

- OCR avec `mistral-ocr-latest`.
- Deux clés API avec noms personnalisés et sélecteur rapide dans le popup.
- Extraction d'images optionnelle.
- Export des images en ZIP ou en fichiers séparés.
- Preview/Edit avec éditeur Markdown, vue rendue, sauvegarde automatique optionnelle, copie, export Markdown et export PDF.
- Mise en évidence des mots OCR à faible confiance.
- Liste complète des transcriptions enregistrées avec recherche par nom, URL, SHA ou type.
- Compatibilité avec Google Docs, Google Slides et Google Sheets.
- Localisation automatique selon la langue du navigateur, avec l'anglais comme fallback.

## Première utilisation

1. Créez une clé API dans Mistral Console : https://console.mistral.ai/
2. Ouvrez l'extension puis cliquez sur `Configurer`.
3. Collez la clé dans `API key 1`.
4. Vous pouvez aussi configurer `API key 2` pour alterner entre deux comptes ou profils.
5. Cliquez sur `Enregistrer`.
6. Ouvrez dans Chrome un document ou une image compatible.
7. Ouvrez l'extension `Mistral OCR`.
8. Activez ou désactivez `Télécharger les images` selon vos besoins.
9. Cliquez sur `Transcrire (OCR)`.

Si une transcription existe déjà pour l'URL actuelle, le bouton principal devient `Remplacer`.

Important : pour utiliser des PDF ou des fichiers locaux avec `file://`, activez `Autoriser l'accès aux URL de fichiers` pour cette extension dans `chrome://extensions`.

## Formats pris en charge

Prend principalement en charge les documents PDF affichés sous forme rendue par Chrome.

Google Docs, Google Slides et Google Sheets sont exportés en PDF par défaut. Les formats Google natifs (docx; pptx; xlsx; csv) peuvent également être activés dans les Options. Les formats natifs peuvent améliorer la précision de l’OCR, mais ils peuvent aussi révéler du texte masqué contenu dans le fichier d’origine.

De plus, l’extension peut fonctionner avec toute image que Chrome rend individuellement dans un nouvel onglet. Ces formats incluent : jpg, jpeg, png, avif, gif, bmp et webp.

## Dépannage

Si l'OCR ne démarre pas, vérifiez qu'une clé API est enregistrée et que l'onglet actif contient une ressource compatible. Si un OCR en arrière-plan est déjà en cours, attendez sa fin ou annulez-le.

Si les fichiers locaux ne fonctionnent pas, ouvrez `chrome://extensions`, ouvrez les détails de cette extension et activez `Autoriser l'accès aux URL de fichiers`.

## Légal

Ce logiciel est indépendant et non officiel. Il n'est pas associé à Mistral AI. Le projet inclut la licence MIT dans `LICENSE` et les mentions de copyright dans `COPYRIGHT`.
