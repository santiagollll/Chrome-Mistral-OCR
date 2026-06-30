# Chrome Mistral OCR

Mistral OCR के साथ दस्तावेज़ों और छवियों को ट्रांसक्राइब करने के लिए Chrome एक्सटेंशन। यह एक्सटेंशन के popup से चलता है, परिणामों को लोकल रूप से सहेजता है, और preview, edit, copy, Markdown export, image export और rendered preview से PDF output की सुविधा देता है।

## गोपनीयता

यह एक्सटेंशन उन दस्तावेज़ों, छवियों या फ़ाइलों को Mistral AI को भेजता है जिन्हें आप प्रोसेस करने के लिए चुनते हैं। इसका उपयोग करके आप स्वीकार करते हैं कि यह सामग्री Mistral AI की वर्तमान शर्तों और नीतियों के अनुसार संभाली जाएगी।

Mistral AI की शर्तें: https://mistral.ai/terms

महत्वपूर्ण नोट्स:

- यह एक्सटेंशन स्वतंत्र है और Mistral AI से संबद्ध नहीं है।
- आपकी API key Chrome के `chrome.storage.local` में सहेजी जाती है।
- यदि आप संवेदनशील दस्तावेज़ प्रोसेस करते हैं, तो पहले अपने Mistral AI प्लान की privacy conditions देखें।

## मुख्य सुविधाएँ

- `mistral-ocr-latest` के साथ OCR।
- कस्टम नामों के साथ दो API keys और popup में त्वरित selector।
- वैकल्पिक image extraction।
- ZIP या अलग-अलग फ़ाइलों के रूप में image export।
- Preview/Edit जिसमें Markdown editor, rendered view, वैकल्पिक autosave, copy, Markdown export और PDF export शामिल हैं।
- कम-confidence OCR शब्दों का highlighting।
- नाम, URL, SHA या type से खोजने योग्य saved transcriptions की पूरी सूची।
- Google Docs, Google Slides और Google Sheets का समर्थन।
- ब्राउज़र भाषा के अनुसार automatic localization, और fallback के रूप में English।

## पहली बार उपयोग

1. Mistral Console में API key बनाएँ: https://console.mistral.ai/
2. एक्सटेंशन खोलें और `Configure` पर क्लिक करें।
3. key को `API key 1` में पेस्ट करें।
4. वैकल्पिक रूप से `API key 2` सेट करें ताकि दो accounts या profiles के बीच switch कर सकें।
5. `Save` पर क्लिक करें।
6. Chrome में कोई compatible document या image खोलें।
7. `Mistral OCR` एक्सटेंशन खोलें।
8. ज़रूरत के अनुसार `Download images` को enable या disable करें।
9. `Transcribe (OCR)` पर क्लिक करें।

यदि current URL के लिए transcription पहले से मौजूद है, तो main button `Overwrite` में बदल जाएगा।

महत्वपूर्ण: `file://` वाले local PDFs या files के लिए `chrome://extensions` में इस extension के लिए `Allow access to file URLs` सक्षम करें।

## समर्थित फ़ॉर्मैट

मुख्य रूप से उन PDF दस्तावेज़ों का समर्थन करता है जिन्हें Chrome रेंडर करके दिखाता है।

Google Docs, Google Slides और Google Sheets डिफ़ॉल्ट रूप से PDF के रूप में एक्सपोर्ट किए जाते हैं। Google के native formats (docx; pptx; xlsx; csv) को Options से भी सक्षम किया जा सकता है। Native formats OCR की सटीकता बढ़ा सकते हैं, लेकिन वे मूल फ़ाइल में मौजूद छिपे हुए टेक्स्ट को भी उजागर कर सकते हैं।

इसके अतिरिक्त, यह एक्सटेंशन किसी भी ऐसी इमेज के साथ काम कर सकता है जिसे Chrome एक नई टैब में अलग से रेंडर करता है। इन फ़ॉर्मैट में शामिल हैं: jpg, jpeg, png, avif, gif, bmp और webp।

## समस्या निवारण

यदि OCR शुरू नहीं होता, तो जाँचें कि API key saved है और active tab में compatible resource है। यदि background OCR job पहले से चल रही है, तो उसके खत्म होने की प्रतीक्षा करें या उसे cancel करें।

यदि local files काम नहीं करतीं, तो `chrome://extensions` खोलें, इस extension की details खोलें, और `Allow access to file URLs` सक्षम करें।

## कानूनी

यह software स्वतंत्र और अनौपचारिक है। इसका Mistral AI से कोई संबंध नहीं है। प्रोजेक्ट में `LICENSE` में MIT license और `COPYRIGHT` में copyright notices शामिल हैं।
