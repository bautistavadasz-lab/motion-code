// Kit de perfil do canal "A o B · Historias" (várias histórias interativas; o 003 é só uma delas) (foto, banner do YouTube, capas de destaques), desenhado em canvas no Chromium.
// Uso: node marca/marca.mjs  (de dentro de estilos/3d-webgl) -> marca/saida/*.png
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const b64 = async (p) => (await readFile(p)).toString("base64");
const F = "node_modules/@fontsource/";
const fontes = {
  Anton: await b64(F + "anton/files/anton-latin-400-normal.woff2"),
  Elite: await b64(F + "special-elite/files/special-elite-latin-400-normal.woff2"),
  Inter: await b64(F + "inter/files/inter-latin-700-normal.woff2"),
};
const porta = "data:image/jpeg;base64," + await b64("marca/fundo-porta.jpg");
const celular = "data:image/jpeg;base64," + await b64("marca/fundo-celular.jpg");
await mkdir("marca/saida", { recursive: true });

const b = await chromium.launch();
const pg = await b.newPage();
await pg.setContent("<canvas id=c></canvas>");
await pg.evaluate(async (f) => {
  for (const [n, d] of Object.entries(f)) { const ff = new FontFace(n, `url(data:font/woff2;base64,${d})`); await ff.load(); document.fonts.add(ff); }
}, fontes);

const desenhar = (nome, w, h, fn, args) => pg.evaluate(async ({ w, h, fn, args }) => {
  const c = document.getElementById("c"); c.width = w; c.height = h; const g = c.getContext("2d");
  const img = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const grao = (a = 0.08) => { const im = g.getImageData(0, 0, w, h); let s = 7; for (let i = 0; i < im.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = ((s / 4294967296) - 0.5) * 255 * a; im.data[i] += v; im.data[i + 1] += v; im.data[i + 2] += v; } g.putImageData(im, 0, 0); };
  const glitch = (txt, x, y, px, cor = "#fff") => { // texto com sombra vermelha/ciano deslocada
    g.font = `${px}px Anton`; g.textAlign = "center"; g.textBaseline = "middle";
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(255,30,30,.85)"; g.fillText(txt, x - px * 0.025, y);
    g.fillStyle = "rgba(0,200,255,.45)"; g.fillText(txt, x + px * 0.02, y);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = cor; g.shadowColor = "rgba(255,40,40,.6)"; g.shadowBlur = px * 0.12; g.fillText(txt, x, y); g.shadowBlur = 0;
  };
  await eval(`(${fn})`)(g, w, h, { img, grao, glitch, args });
  return c.toDataURL("image/png").split(",")[1];
}, { w, h, fn: fn.toString(), args }).then((d) => writeFile(`marca/saida/${nome}.png`, Buffer.from(d, "base64")));

// foto de perfil: A e B separados por um corte diagonal vermelho, legível num círculo pequeno
await desenhar("perfil-1080", 1080, 1080, async (g, w, h, { grao, glitch }) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 620); r.addColorStop(0, "#1c0608"); r.addColorStop(1, "#030303");
  g.fillStyle = r; g.fillRect(0, 0, w, h);
  glitch("A", w * 0.33, h * 0.5, 470);
  glitch("B", w * 0.67, h * 0.5, 470, "#ff2b2b");
  g.save(); g.translate(w / 2, h / 2); g.rotate(0.32);
  g.shadowColor = "rgba(255,30,30,.9)"; g.shadowBlur = 40; g.fillStyle = "#e01f1f"; g.fillRect(-9, -330, 18, 660); g.restore();
  grao(0.06);
});

// banner do YouTube 2560x1440 (área segura central 1546x423)
await desenhar("banner-youtube-2560x1440", 2560, 1440, async (g, w, h, { img, grao, glitch, args }) => {
  const p = await img(args.porta), c = await img(args.celular);
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.7; g.filter = "blur(22px)"; g.drawImage(p, 0, -515, 1100, 1955); g.drawImage(c, w - 1100, -500, 1100, 1955); g.filter = "none"; g.globalAlpha = 1;
  const lat = g.createLinearGradient(0, 0, w, 0);
  lat.addColorStop(0, "rgba(0,0,0,.2)"); lat.addColorStop(0.3, "rgba(0,0,0,.92)"); lat.addColorStop(0.7, "rgba(0,0,0,.92)"); lat.addColorStop(1, "rgba(0,0,0,.2)");
  g.fillStyle = lat; g.fillRect(0, 0, w, h);
  glitch("A", w / 2 - 560, h / 2, 330); glitch("B", w / 2 - 330, h / 2, 330, "#ff2b2b");
  g.save(); g.translate(w / 2 - 445, h / 2); g.rotate(0.32); g.fillStyle = "#e01f1f"; g.shadowColor = "rgba(255,30,30,.9)"; g.shadowBlur = 30; g.fillRect(-6, -200, 12, 400); g.restore();
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.font = "92px Anton"; g.fillStyle = "#fff"; g.fillText("HISTORIAS QUE", w / 2 - 70, h / 2 - 40);
  g.fillStyle = "#e01f1f"; g.fillText("TÚ DECIDES", w / 2 - 70, h / 2 + 60);
  g.font = "34px Anton"; g.fillStyle = "#9aa3b5"; g.fillText("TERROR  ·  DRAMA  ·  MISTERIO", w / 2 - 70, h / 2 - 150);
  g.font = "38px Elite"; g.fillStyle = "#cfd6e6"; g.fillText("Comenta A o B · la más votada es la siguiente parte", w / 2 - 70, h / 2 + 130);
  grao(0.06);
}, { porta, celular });

// capas de destaques (Instagram): círculo, ícone grande
const destaques = [["votar", "A/B", "VOTAR"], ["historias", "#", "HISTORIAS"], ["finales", "?", "FINALES"], ["reglas", "!", "CÓMO JUGAR"]];
for (const [id, simbolo, rotulo] of destaques) {
  await desenhar(`destaque-${id}`, 1080, 1080, async (g, w, h, { grao, glitch, args }) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 560); r.addColorStop(0, "#2a0708"); r.addColorStop(1, "#050505");
    g.fillStyle = r; g.fillRect(0, 0, w, h);
    glitch(args.simbolo, w / 2, h * 0.46, args.simbolo.length > 2 ? 300 : 420);
    g.font = "70px Anton"; g.fillStyle = "#e01f1f"; g.textAlign = "center"; g.fillText(args.rotulo, w / 2, h * 0.8);
    grao(0.05);
  }, { simbolo, rotulo });
}
await b.close();
console.log("kit em marca/saida/");
