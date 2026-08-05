# OCR language data

`eng.traineddata.gz` is Tesseract's English trained-data file (the "fast"
variant), vendored here so passport OCR (`src/modules/passport-ocr`) works
without any network access at runtime — Tesseract.js otherwise fetches this
file from a CDN on first use.

Source: https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/eng.traineddata.gz
