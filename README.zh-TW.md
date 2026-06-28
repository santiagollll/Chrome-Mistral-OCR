# Chrome Mistral OCR

用於透過 Mistral OCR 轉錄文件和圖片的 Chrome 擴充功能。它可從擴充功能彈窗操作，將結果儲存在本機，並支援預覽、編輯、複製、匯出 Markdown、匯出圖片，以及從渲染後的預覽產生 PDF 輸出。

## 隱私

此擴充功能會將你選擇處理的文件、圖片或檔案傳送給 Mistral AI。使用本擴充功能即表示你接受這些內容將依照 Mistral AI 目前的條款與政策進行處理。

Mistral AI 條款: https://mistral.ai/terms

重要說明:

- 此擴充功能是獨立專案，與 Mistral AI 無關。
- 你的 API key 會儲存在 Chrome 的 `chrome.storage.local` 中。
- 如果你處理敏感文件，請先查看你的 Mistral AI 方案的隱私條件。

## 主要功能

- 使用 `mistral-ocr-latest` 進行 OCR。
- 支援兩組 API key，可自訂名稱，並可在彈窗中快速切換。
- 可選的圖片擷取。
- 圖片可匯出為 ZIP 或獨立檔案。
- Preview/Edit 支援 Markdown 編輯器、渲染視圖、可選自動儲存、複製、Markdown 匯出與 PDF 匯出。
- 標示低信心 OCR 單字。
- 完整的已儲存轉錄列表，可依名稱、URL、SHA 或類型搜尋。
- 支援 Google Docs、Google Slides 與 Google Sheets。
- 依照瀏覽器語言自動本地化，並以英文作為後備語言。

## 首次使用

1. 在 Mistral Console 建立 API key: https://console.mistral.ai/
2. 開啟擴充功能並點擊 `Configure`。
3. 將金鑰貼到 `API key 1`。
4. 如有需要，可設定 `API key 2` 以在兩個帳號或設定之間切換。
5. 點擊 `Save`。
6. 在 Chrome 中開啟相容的文件或圖片。
7. 開啟 `Mistral OCR` 擴充功能。
8. 依需求啟用或停用 `Download images`。
9. 點擊 `Transcribe (OCR)`。

如果目前 URL 已有轉錄結果，主按鈕會變成 `Overwrite`。

重要: 若要使用 `file://` 的本機 PDF 或檔案，請在 `chrome://extensions` 中為此擴充功能啟用 `Allow access to file URLs`。

## 支援格式

- PDF。
- 圖片: `jpg`, `jpeg`, `png`, `avif`, `tif`, `tiff`, `gif`, `heic`, `heif`, `bmp`, `webp`。
- 文件/檔案: `docx`, `doc`, `pptx`, `ppt`, `xlsx`, `csv`, `txt`, `epub`, `xml`, `rtf`, `odt`, `bib`, `fb2`, `ipynb`, `tex`, `opml`, `man`。
- Google Docs、Slides 與 Sheets 預設匯出為 PDF，也可在 Options 中啟用原生格式。

Google 原生格式可能提升精準度，但也可能暴露原始檔中的隱藏文字。

## 疑難排解

如果 OCR 無法啟動，請確認已儲存 API key，且目前作用中的分頁包含相容資源。如果背景 OCR 工作已經在執行，請等待完成或先取消。

如果本機檔案無法使用，請打開 `chrome://extensions`，進入此擴充功能的詳細資訊，並啟用 `Allow access to file URLs`。

## 法律聲明

此軟體為獨立且非官方的專案，與 Mistral AI 無關。專案包含 `LICENSE` 中的 MIT 授權，以及 `COPYRIGHT` 中的版權聲明。
