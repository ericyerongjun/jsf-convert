# JSF to PDF Converter

Small utility that accepts `.jsf` uploads, stores them in `src/`, and produces PDFs of the same base name in `outputs/`. The TypeScript backend orchestrates the upload and dispatches a Python converter that renders the file contents into a PDF.

## Prerequisites
- Python 3.10+ with `pip`
- Node.js 18+

## Setup
```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
```

## Run the server
```sh
cd backend
npm run dev   # watches TypeScript
# or build + run
npm run build
npm start
```
The server defaults to port 3000.

## How it works
- Upload endpoint: `POST /api/upload` with multipart field `file` (expects `.jsf`). The server saves the file to `<project>/src/<name>.jsf` and calls the Python converter to write `<project>/outputs/<name>.pdf`.
- Listing endpoint: `GET /api/files` returns available PDFs.
- Download endpoint: `GET /api/download/<name>.pdf` streams the PDF.
- Frontend: served from `/frontend`, use `index.html` for a simple upload UI (no React).

## Notes
- The converter treats `.jsf` as plain text and writes it into the PDF with simple wrapping.
- Max upload size is 2 MB by default.
- Paths are relative to the repository root so that `src/` and `outputs/` at the top level hold user files.
