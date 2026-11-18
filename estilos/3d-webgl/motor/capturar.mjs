// Captura quadro a quadro no Chromium headless (Playwright) e entrega o mp4 mudo.
// Uso: node motor/capturar.mjs episodios/<slug> saida.mp4 [--q 0.6667] [--de s] [--ate s] [--still t1,t2 pasta] [--partes N]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const ep = resolve(args[0]);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const Q = opt("--q", "0.6667");
const linha = JSON.parse(await readFile(join(ep, "linha.json"), "utf8"));
const tweaks = JSON.parse(await readFile(join(ep, "tweaks.json"), "utf8").catch(() => "{}"));
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff" };
const srv = createServer(async (req, res) => {
  try { const p = join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname)); const d = await readFile(p); res.writeHead(200, { "content-type": TIPOS[extname(p)] || "application/octet-stream" }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, "127.0.0.1");
await new Promise((r) => srv.once("listening", r));
const URLP = `http://127.0.0.1:${srv.address().port}/motor/pagina.html?q=${Q}`;

async function abrir() {
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
  const pg = await b.newPage({ viewport: { width: 540, height: 960 } });
  pg.on("console", (m) => { if (m.type() === "error") console.error("[página]", m.text()); });
  pg.on("pageerror", (e) => console.error("[página]", e.message));
  await pg.addInitScript((tw) => { window.TWEAKS = tw; }, tweaks);
  await pg.goto(URLP);
  await pg.waitForFunction(() => window.iniciar);
  const info = await pg.evaluate((l) => window.iniciar(l), linha);
  return { b, pg, info };
}

if (args.includes("--portada")) {
  const { b, pg } = await abrir(); const t = +opt("--portada", 6);
  await writeFile(resolve(args[1]), Buffer.from(await pg.evaluate((t) => window.portada(t), t), "base64"));
  console.log("portada:", args[1]); await b.close(); srv.close(); process.exit(0);
}
const still = opt("--still");
if (still) {
  const pasta = resolve(args[args.indexOf("--still") + 2] || join(ep, "quadros"));
  await mkdir(pasta, { recursive: true });
  const { b, pg, info } = await abrir();
  console.log("tomadas", JSON.stringify(info.tomadas));
  for (const t of still.split(",").map(Number)) {
    const t0 = Date.now(); const j = await pg.evaluate((t) => window.jpeg(t, 0.9), t);
    const f = join(pasta, `q-${t.toFixed(2)}.jpg`); await writeFile(f, Buffer.from(j, "base64"));
    console.log(relative(process.cwd(), f), Date.now() - t0, "ms");
  }
  await b.close(); srv.close(); process.exit(0);
}

const saida = resolve(args[1]);
const fps = linha.fps, de = +opt("--de", 0), ate = +opt("--ate", linha.dur);
const n0 = Math.round(de * fps), n1 = Math.round(ate * fps);
const partes = +opt("--partes", 2);
// divide os quadros em N navegadores, cada um grava um pedaço; no fim junta
const fatias = Array.from({ length: partes }, (_, i) => [n0 + Math.floor((n1 - n0) * i / partes), n0 + Math.floor((n1 - n0) * (i + 1) / partes)]);
const t0 = Date.now(); let feitos = 0;
await Promise.all(fatias.map(async ([a, z], i) => {
  const { b, pg } = await abrir();
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", `${saida}.parte${i}.mp4`], { stdio: ["pipe", "inherit", "inherit"] });
  for (let n = a; n < z; n++) {
    const j = await pg.evaluate((t) => window.jpeg(t, 0.93), n / fps);
    if (!ff.stdin.write(Buffer.from(j, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
    if (++feitos % 60 === 0) { const s = (Date.now() - t0) / 1000; console.log(`${feitos}/${n1 - n0} quadros · ${(feitos / s).toFixed(2)} q/s · faltam ${((n1 - n0 - feitos) / (feitos / s) / 60).toFixed(1)} min`); }
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r)); await b.close();
}));
const lista = fatias.map((_, i) => `file '${saida}.parte${i}.mp4'`).join("\n");
await writeFile(`${saida}.lista.txt`, lista);
await new Promise((r) => spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${saida}.lista.txt`, "-c", "copy", saida], { stdio: "inherit" }).on("close", r));
const { unlink } = await import("node:fs/promises");
for (let i = 0; i < partes; i++) await unlink(`${saida}.parte${i}.mp4`); await unlink(`${saida}.lista.txt`);
console.log("vídeo:", saida, ((Date.now() - t0) / 60000).toFixed(1), "min");
srv.close();
