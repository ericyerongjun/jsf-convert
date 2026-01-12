import express, { Request, Response } from "express";
import multer, { MulterError } from "multer";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const projectRoot = path.resolve(__dirname, "..", "..");
const inputDir = path.join(projectRoot, "src");
const outputDir = path.join(projectRoot, "outputs");
const frontendDir = path.join(projectRoot, "frontend");
const pythonScript = path.join(__dirname, "..", "converter.py");

for (const dir of [inputDir, outputDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const maxUploadMb = Number(process.env.MAX_UPLOAD_MB) || 20; // configurable size cap

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, inputDir),
  filename: (_req, file, cb) => {
    const base = path
      .parse(file.originalname)
      .name.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
    cb(null, `${base}.jsf`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".jsf") {
      return cb(new Error("Only .jsf files are accepted"));
    }
    cb(null, true);
  },
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
});

function convertWithPython(
  inputPath: string,
  outputPath: string,
  timeoutMs: number = 15000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [pythonScript, inputPath, outputPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      reject(new Error("Conversion timed out"));
    }, timeoutMs);

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Python converter exited with code ${code}`));
      }
    });
  });
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/api/files", (_req: Request, res: Response) => {
  const pdfs = fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.toLowerCase().endsWith(".pdf"))
    .map((dirent) => dirent.name);

  res.json({ files: pdfs });
});

app.get("/api/download/:name", (req: Request, res: Response) => {
  const safeName = path.basename(req.params.name);
  if (!safeName.toLowerCase().endsWith(".pdf")) {
    return res.status(400).json({ message: "Only pdf downloads are allowed" });
  }
  const candidate = path.join(outputDir, safeName);
  if (!fs.existsSync(candidate)) {
    return res.status(404).json({ message: "File not found" });
  }
  res.sendFile(candidate);
});

app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const inputPath = path.join(inputDir, req.file.filename);
  const pdfName = `${path.parse(req.file.filename).name}.pdf`;
  const outputPath = path.join(outputDir, pdfName);

  try {
    await convertWithPython(inputPath, outputPath);
    if (!fs.existsSync(outputPath)) {
      throw new Error("Conversion reported success but output file is missing");
    }
    res.json({
      message: "File converted",
      input: req.file.filename,
      output: pdfName,
    });
  } catch (err) {
    console.error("Conversion failed", err);
    res.status(500).json({ message: "Conversion failed", error: (err as Error).message });
  }
});

app.use(express.static(frontendDir));
app.use((req: Request, res: Response) => {
  if (req.method === "GET") {
    const indexPath = path.join(frontendDir, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  res.status(404).json({ message: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: () => void) => {
  if (err instanceof MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ message: err.message });
  }
  if (err instanceof Error && err.message === "Only .jsf files are accepted") {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: "Unexpected error" });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`JSF converter backend listening on port ${port}`);
});
