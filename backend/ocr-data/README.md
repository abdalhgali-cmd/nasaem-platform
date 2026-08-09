# OCR language data

Tesseract trained-data files (the "fast" variant), vendored here so passport
OCR (`src/modules/passport-ocr`) works without any network access at
runtime — Tesseract.js otherwise fetches these from a CDN on first use.

- `eng.traineddata.gz` — MRZ parsing (passport number, etc.). The MRZ is
  Latin-only by the ICAO 9303 standard on every passport, in every country,
  so this is the only language needed for that strictly-validated path.
- `ara.traineddata.gz` — best-effort extraction of the customer's printed
  Arabic name elsewhere on the passport's photo page, for the Umrah request
  form. Unlike the MRZ (which has check digits Tesseract's output is
  validated against), there's no way to verify an OCR'd name is correct, so
  this is only ever offered as an editable, reviewable suggestion — never
  auto-filled with confidence the way the passport number is.

Source: https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast/{eng,ara}.traineddata.gz
