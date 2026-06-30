# Chrome Mistral OCR

Mistral OCR を使って文書や画像を文字起こしするための Chrome 拡張機能です。拡張機能のポップアップから操作でき、結果はローカルに保存され、プレビュー、編集、コピー、Markdown エクスポート、画像エクスポート、レンダリング済みプレビューからの PDF 出力ができます。

## プライバシー

この拡張機能は、処理対象として選択した文書、画像、またはファイルを Mistral AI に送信します。使用することで、それらの内容が Mistral AI の最新の利用規約およびポリシーに従って処理されることに同意したものとみなされます。

Mistral AI の利用規約: https://mistral.ai/terms

重要な注意:

- この拡張機能は独立したものであり、Mistral AI とは提携していません。
- API key は Chrome 内の `chrome.storage.local` に保存されます。
- 機密性の高い文書を処理する場合は、先に Mistral AI プランのプライバシー条件を確認してください。

## 主な機能

- `mistral-ocr-latest` による OCR。
- カスタム名付きの 2 つの API key と、ポップアップからの高速切り替え。
- 画像抽出のオン/オフ。
- ZIP または個別ファイルとしての画像エクスポート。
- Markdown エディタ、レンダリング表示、任意の自動保存、コピー、Markdown エクスポート、PDF エクスポートを備えた Preview/Edit。
- 信頼度の低い OCR 単語のハイライト。
- 名前、URL、SHA、タイプで検索できる保存済み文字起こし一覧。
- Google Docs、Google Slides、Google Sheets に対応。
- ブラウザ言語に応じた自動ローカライズ。英語がフォールバックです。

## 初回利用

1. Mistral Console で API key を作成します: https://console.mistral.ai/
2. 拡張機能を開いて `Configure` をクリックします。
3. `API key 1` にキーを貼り付けます。
4. 必要であれば `API key 2` を設定して、2 つのアカウントまたはプロファイルを切り替えます。
5. `Save` をクリックします。
6. Chrome で対応する文書または画像を開きます。
7. `Mistral OCR` 拡張機能を開きます。
8. 必要に応じて `Download images` をオン/オフします。
9. `Transcribe (OCR)` をクリックします。

現在の URL に対する文字起こしがすでに存在する場合、メインボタンは `Overwrite` に変わります。

重要: `file://` のローカル PDF やファイルを使うには、`chrome://extensions` でこの拡張機能の `Allow access to file URLs` を有効にしてください。

## 対応フォーマット

主に、Chrome によってレンダリング表示される PDF ドキュメントに対応しています。

Google Docs、Google Slides、Google Sheets はデフォルトで PDF としてエクスポートされます。Google ネイティブ形式（docx; pptx; xlsx; csv）も Options から有効にできます。ネイティブ形式は OCR の精度を向上させる可能性がありますが、元ファイルに含まれる非表示テキストを露出させる可能性もあります。

さらに、この拡張機能は、Chrome が新しいタブで個別にレンダリング表示する任意の画像にも対応できます。対応形式には、jpg、jpeg、png、avif、gif、bmp、webp が含まれます。

## トラブルシューティング

OCR が開始しない場合は、API key が保存されていること、およびアクティブなタブに対応するリソースがあることを確認してください。すでにバックグラウンド OCR が実行中なら、終了を待つかキャンセルしてください。

ローカルファイルが動作しない場合は、`chrome://extensions` を開き、この拡張機能の詳細から `Allow access to file URLs` を有効にしてください。

## 法的情報

このソフトウェアは独立した非公式のものです。Mistral AI とは関係ありません。プロジェクトには `LICENSE` の MIT ライセンスと `COPYRIGHT` の著作権表示が含まれています。
