# Chrome Mistral OCR

用于通过 Mistral OCR 转录文档和图像的 Chrome 扩展。它通过扩展弹窗运行，将结果保存在本地，并支持预览、编辑、复制、导出 Markdown、导出图片，以及从渲染后的预览生成 PDF 输出。

## 隐私

此扩展会将你选择处理的文档、图像或文件发送给 Mistral AI。使用本扩展即表示你接受这些内容将按照 Mistral AI 当前的条款和政策进行处理。

Mistral AI 条款: https://mistral.ai/terms

重要说明:

- 此扩展是独立项目，与 Mistral AI 无关联。
- 你的 API key 保存在 Chrome 的 `chrome.storage.local` 中。
- 如果你处理敏感文档，请先查看你的 Mistral AI 方案的隐私条件。

## 主要功能

- 使用 `mistral-ocr-latest` 进行 OCR。
- 支持两组 API key，自定义名称，并可在弹窗中快速切换。
- 可选图片提取。
- 图片可导出为 ZIP 或单独文件。
- Preview/Edit 支持 Markdown 编辑器、渲染视图、可选自动保存、复制、Markdown 导出和 PDF 导出。
- 高亮显示低置信度 OCR 单词。
- 完整的已保存转录列表，可按名称、URL、SHA 或类型搜索。
- 支持 Google Docs、Google Slides 和 Google Sheets。
- 根据浏览器语言自动本地化，英语作为后备语言。

## 首次使用

1. 在 Mistral Console 创建 API key: https://console.mistral.ai/
2. 打开扩展并点击 `Configure`。
3. 将密钥粘贴到 `API key 1`。
4. 如有需要，可配置 `API key 2` 以在两个账号或配置之间切换。
5. 点击 `Save`。
6. 在 Chrome 中打开兼容的文档或图像。
7. 打开 `Mistral OCR` 扩展。
8. 根据需要启用或禁用 `Download images`。
9. 点击 `Transcribe (OCR)`。

如果当前 URL 已存在转录结果，主按钮会变成 `Overwrite`。

重要: 若要处理 `file://` 的本地 PDF 或文件，请在 `chrome://extensions` 中为该扩展启用 `Allow access to file URLs`。

## 支持的格式

- PDF。
- 图像: `jpg`, `jpeg`, `png`, `avif`, `tif`, `tiff`, `gif`, `heic`, `heif`, `bmp`, `webp`。
- 文档/文件: `docx`, `doc`, `pptx`, `ppt`, `xlsx`, `csv`, `txt`, `epub`, `xml`, `rtf`, `odt`, `bib`, `fb2`, `ipynb`, `tex`, `opml`, `man`。
- Google Docs、Slides 和 Sheets 默认导出为 PDF，也可在 Options 中启用原生格式。

Google 原生格式可能提升精度，但也可能暴露原始文件中的隐藏文本。

## 故障排除

如果 OCR 无法启动，请确认已保存 API key，并且当前活动标签页包含兼容资源。如果后台 OCR 任务已经在运行，请等待其完成或先取消。

如果本地文件无法使用，请打开 `chrome://extensions`，进入该扩展的详情页面，并启用 `Allow access to file URLs`。

## 法律声明

该软件为独立的非官方项目，与 Mistral AI 无关联。项目包含 `LICENSE` 中的 MIT 许可证，以及 `COPYRIGHT` 中的版权声明。
