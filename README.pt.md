# Chrome Mistral OCR

Extensão do Chrome para transcrever documentos e imagens com Mistral OCR. Ela funciona a partir do popup da extensão, salva os resultados localmente e permite visualizar, editar, copiar, exportar Markdown, exportar imagens e gerar saída em PDF a partir da visualização renderizada.

## Privacidade

Esta extensão envia para a Mistral AI os documentos, imagens ou arquivos que você escolher processar. Ao usá-la, você aceita que esses conteúdos sejam tratados de acordo com os termos e políticas atuais da Mistral AI.

Termos da Mistral AI: https://mistral.ai/terms

Notas importantes:

- Esta extensão é independente e não está associada à Mistral AI.
- Sua API key é armazenada em `chrome.storage.local` dentro do Chrome.
- Se você processar documentos sensíveis, revise primeiro as condições de privacidade do seu plano da Mistral AI.

## Principais recursos

- OCR com `mistral-ocr-latest`.
- Duas API keys com nomes personalizados e seletor rápido no popup.
- Extração opcional de imagens.
- Exportação de imagens como ZIP ou arquivos separados.
- Preview/Edit com editor Markdown, visualização renderizada, salvamento automático opcional, cópia, exportação Markdown e exportação PDF.
- Destaque para palavras de baixa confiança no OCR.
- Lista completa de transcrições salvas com busca por nome, URL, SHA ou tipo.
- Compatibilidade com Google Docs, Google Slides e Google Sheets.
- Localização automática conforme o idioma do navegador, com inglês como fallback.

## Primeiro uso

1. Crie uma API key no Mistral Console: https://console.mistral.ai/
2. Abra a extensão e clique em `Configurar`.
3. Cole a chave em `API key 1`.
4. Opcionalmente configure `API key 2` para alternar entre duas contas ou perfis.
5. Clique em `Salvar`.
6. Abra no Chrome um documento ou imagem compatível.
7. Abra a extensão `Mistral OCR`.
8. Ative ou desative `Baixar imagens` conforme necessário.
9. Clique em `Transcrever (OCR)`.

Se já existir uma transcrição para a URL atual, o botão principal mudará para `Sobrescrever`.

Importante: para usar PDFs ou arquivos locais com `file://`, ative `Permitir acesso a URLs de arquivos` para esta extensão em `chrome://extensions`.

## Formatos suportados

- PDF.
- Imagens: `jpg`, `jpeg`, `png`, `avif`, `tif`, `tiff`, `gif`, `heic`, `heif`, `bmp`, `webp`.
- Documentos/arquivos: `docx`, `doc`, `pptx`, `ppt`, `xlsx`, `csv`, `txt`, `epub`, `xml`, `rtf`, `odt`, `bib`, `fb2`, `ipynb`, `tex`, `opml`, `man`.
- Google Docs, Slides e Sheets exportam em PDF por padrão, com formatos nativos opcionais em Opções.

Os formatos nativos do Google podem melhorar a precisão, mas também podem expor texto oculto presente no arquivo original.

## Solução de problemas

Se o OCR não iniciar, verifique se existe uma API key salva e se a guia ativa contém um recurso compatível. Se já houver um OCR em segundo plano em execução, aguarde o término ou cancele.

Se arquivos locais não funcionarem, abra `chrome://extensions`, abra os detalhes desta extensão e ative `Permitir acesso a URLs de arquivos`.

## Legal

Este software é independente e não oficial. Não está associado à Mistral AI. O projeto inclui a licença MIT em `LICENSE` e avisos de copyright em `COPYRIGHT`.
