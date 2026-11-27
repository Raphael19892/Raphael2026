#!/bin/sh
# Rebuild index.html (standalone PWA page) from app.html (page body used for the published artifact).
# Rebuild book.json from the PDF: pdftotext -layout book.pdf book.txt && python3 build_data.py book.txt data.js
cd "$(dirname "$0")"
{ printf '<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#23477a">\n<link rel="manifest" href="manifest.json">\n<link rel="icon" href="icon.svg">\n<link rel="apple-touch-icon" href="icon.svg">\n'
  sed -n '1,/^<\/style>/p' app.html
  printf '</head>\n<body>\n'
  sed -n '/^<\/style>/,$p' app.html | tail -n +2
  printf '</body>\n</html>\n'; } > index.html
