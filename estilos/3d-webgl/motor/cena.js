// 3D WebGL · motor do episódio "La llamada de las 3:17" (quarto de noite, celular, porta).
// Contrato: window.iniciar(linha) prepara tudo; window.quadro(t) desenha o instante t no canvas #c.
// Tudo é função de t (sem Math.random): o mesmo quadro sai igual em qualquer captura.
import * as THREE from "three";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const W = 1080, H = 1920;
const P = new URLSearchParams(location.search);
const Q = +(P.get("q") || 0.6667);            // fração da resolução do 3D (o texto sai sempre em 1080)
const RW = Math.round(W * Q / 2) * 2, RH = Math.round(H * Q / 2) * 2;
const TW = window.TWEAKS || {};
const tw = (k) => (TW[k] ?? 1);

// ---------- utilidades ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const easeOut = (u) => 1 - Math.pow(1 - clamp(u), 3);
const easeInOut = (u) => { u = clamp(u); return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function ruido(x, s = 0) { // ruído 1D suave e determinístico
  const i = Math.floor(x), f = x - i, h = (n) => { const v = Math.sin((n + s * 57.1) * 127.1) * 43758.5453; return v - Math.floor(v); };
  const u = f * f * (3 - 2 * f); return lerp(h(i), h(i + 1), u) * 2 - 1;
}
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- estado ----------
let L, renderer, scene, rtCena, rtDof, bloom, quadDof, quadFinal, matDof, matFinal, camA, camB, c2d, ctx;
const M = {}; // malhas animadas
let legendas = [];
let grainCv;

// ---------- texturas pintadas em canvas ----------
function cv(w, h, f) { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); return c; }
function texDe(c, rep = [1, 1], cor = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep);
  if (cor) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function madeira() {
  return cv(1024, 1024, (g, w, h) => {
    const r = rng(7); g.fillStyle = "#3a2618"; g.fillRect(0, 0, w, h);
    const tabuas = 6;
    for (let i = 0; i < tabuas; i++) {
      const x0 = i * w / tabuas, tom = 40 + r() * 22;
      g.fillStyle = `hsl(24, 38%, ${tom * 0.5}%)`; g.fillRect(x0, 0, w / tabuas, h);
      for (let k = 0; k < 90; k++) { // veios
        g.strokeStyle = `rgba(${20 + r() * 30},${10 + r() * 15},5,${0.15 + r() * 0.25})`; g.lineWidth = 1 + r() * 2.5;
        g.beginPath(); const xx = x0 + r() * w / tabuas; g.moveTo(xx, 0);
        for (let y = 0; y <= h; y += 32) g.lineTo(xx + Math.sin(y * 0.01 + k) * 6 * r(), y); g.stroke();
      }
      g.fillStyle = "rgba(0,0,0,.65)"; g.fillRect(x0, 0, 3, h);
      const corte = r() * h; g.fillRect(x0, corte, w / tabuas, 3);
    }
  });
}
function papelParede() {
  return cv(512, 512, (g, w, h) => {
    const r = rng(11); g.fillStyle = "#5d6470"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(x, 0, 30, h); }
    g.strokeStyle = "rgba(30,30,40,.18)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) { // florzinha gasta
      g.beginPath(); for (let a = 0; a < 6; a++) { const aa = a / 6 * Math.PI * 2; g.ellipse(x + 64 + Math.cos(aa) * 14, y + 64 + Math.sin(aa) * 14, 9, 4, aa, 0, Math.PI * 2); } g.stroke();
    }
    for (let i = 0; i < 26; i++) { // manchas de umidade
      const x = r() * w, y = r() * h, rr = 20 + r() * 90, gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, `rgba(40,35,25,${0.08 + r() * 0.12})`); gr.addColorStop(1, "rgba(40,35,25,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  });
}
function cobertor() {
  return cv(512, 512, (g, w, h) => {
    g.fillStyle = "#6b3f3a"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
      if (((x + y) / 64) % 2 === 0) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, y, 64, 64); }
    }
    g.strokeStyle = "rgba(230,200,170,.18)"; g.lineWidth = 3;
    for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  });
}
function ceuNoite() {
  return cv(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#0a1630"); gr.addColorStop(1, "#1e3555");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const lua = g.createRadialGradient(330, 150, 0, 330, 150, 200);
    lua.addColorStop(0, "rgba(220,235,255,1)"); lua.addColorStop(0.12, "rgba(210,228,255,.95)"); lua.addColorStop(0.16, "rgba(160,190,240,.35)"); lua.addColorStop(1, "rgba(60,90,150,0)");
    g.fillStyle = lua; g.fillRect(0, 0, w, h);
    g.fillStyle = "#050a14"; // galhos de uma árvore lá fora
    g.strokeStyle = "#050a14"; g.lineCap = "round";
    const galho = (x, y, a, l, e) => { if (e < 1) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; g.lineWidth = e; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); galho(x2, y2, a - 0.45, l * 0.72, e * 0.62); galho(x2, y2, a + 0.38, l * 0.7, e * 0.6); };
    galho(40, h + 10, -1.25, 170, 22);
  });
}
function fotoFamilia() { // retrato pintado: mãe e filho, sépia
  return cv(400, 500, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#c9b08a"); gr.addColorStop(1, "#7d6446");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "#3d2b1c";
    g.beginPath(); g.ellipse(150, 170, 52, 62, 0, 0, 7); g.fill(); // cabeça mãe
    g.beginPath(); g.moveTo(60, h); g.quadraticCurveTo(70, 250, 150, 240); g.quadraticCurveTo(235, 250, 245, h); g.fill();
    g.beginPath(); g.ellipse(150, 140, 70, 70, 0, Math.PI, 0); g.fill(); // cabelo
    g.fillStyle = "#4a3523";
    g.beginPath(); g.ellipse(270, 300, 38, 44, 0, 0, 7); g.fill(); // cabeça filho
    g.beginPath(); g.moveTo(205, h); g.quadraticCurveTo(215, 350, 270, 345); g.quadraticCurveTo(330, 350, 340, h); g.fill();
    g.fillStyle = "rgba(255,240,210,.25)"; g.beginPath(); g.ellipse(160, 160, 18, 24, 0, 0, 7); g.fill();
    const v = g.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, 330); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(30,15,0,.6)");
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
}

// ---------- tela do celular ----------
const TELA = { w: 540, h: 1160 };
let telaCv, telaG, telaTex;
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function desenharTela(modo, t, lt) {
  const g = telaG, w = TELA.w, h = TELA.h;
  g.save(); g.clearRect(0, 0, w, h);
  if (modo === "off") { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.restore(); telaTex.needsUpdate = true; return; }
  const rojo = modo === "llamada2";
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, rojo ? "#2a0606" : "#0d1a2c"); bg.addColorStop(1, rojo ? "#0a0000" : "#04070d");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff"; g.font = "600 30px Inter"; g.textAlign = "left";
  const hora = modo === "mensaje" ? "3:19" : modo.startsWith("llamada") && rojo ? "3:21" : "3:17";
  g.fillText(hora, 40, 56);
  g.textAlign = "right"; g.fillText("▮▮▮  ◔ 23%", w - 34, 56);
  g.textAlign = "center";
  if (modo === "llamada" || modo === "numero" || modo === "llamada2") {
    g.font = "400 34px Inter"; g.fillStyle = "rgba(255,255,255,.75)";
    g.fillText(rojo ? "llamada entrante · otra vez" : "llamada entrante", w / 2, 190);
    // avatar
    const pul = 1 + 0.06 * Math.sin(t * 7);
    g.fillStyle = rojo ? "rgba(255,60,60,.18)" : "rgba(120,170,255,.16)";
    g.beginPath(); g.arc(w / 2, 330, 95 * pul, 0, 7); g.fill();
    g.fillStyle = rojo ? "#5a1414" : "#2c3e5a"; g.beginPath(); g.arc(w / 2, 330, 80, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = "700 70px Inter"; g.fillText("YO", w / 2, 355);
    g.font = "700 62px Inter"; g.fillText("Mi número", w / 2, 500);
    g.font = "400 34px Inter"; g.fillStyle = rojo ? "#ff6b6b" : "rgba(255,255,255,.7)";
    const glitch = rojo && Math.sin(t * 31) > 0.6;
    g.fillText(glitch ? "+54 9 11 ▒▒▒▒-0317" : "+54 9 11 4823-0317", w / 2, 552);
    if (modo === "numero") {
      g.fillStyle = "rgba(255,80,80,.95)"; g.font = "600 30px Inter";
      g.fillText("móvil · ESTE TELÉFONO", w / 2, 610);
    }
    // botões
    const b = (x, cor, s) => { g.fillStyle = cor; g.beginPath(); g.arc(x, h - 200, 62, 0, 7); g.fill(); g.fillStyle = "#fff"; g.font = "700 46px Inter"; g.fillText(s, x, h - 184); };
    b(w * 0.28, "#e5383b", "✕");
    const sobe = Math.sin(t * 5) * 10;
    g.save(); g.translate(0, sobe); b(w * 0.72, "#2bb24c", "✆"); g.restore();
    g.font = "400 28px Inter"; g.fillStyle = "rgba(255,255,255,.6)";
    g.fillText("Rechazar", w * 0.28, h - 100); g.fillText("Contestar", w * 0.72, h - 100);
  } else if (modo === "atendido") {
    g.font = "700 58px Inter"; g.fillStyle = "#fff"; g.fillText("Mi número", w / 2, 250);
    const s = Math.max(0, Math.floor(lt));
    g.font = "400 40px Inter"; g.fillStyle = "#3ddc6a"; g.fillText(`00:${String(s).padStart(2, "0")}`, w / 2, 310);
    // forma de onda: respiração
    const resp = Math.max(0, Math.sin(lt * 2.1)) ** 2;
    g.fillStyle = "rgba(120,200,255,.9)";
    for (let i = 0; i < 26; i++) {
      const a = (0.15 + resp * 0.85) * (0.35 + 0.65 * Math.abs(ruido(i * 0.7 + lt * 9, 3)));
      const bh = 8 + a * 180; rrect(g, 60 + i * 16.5, 560 - bh / 2, 9, bh, 4); g.fill();
    }
    const icon = (x, y, s, cor = "rgba(255,255,255,.12)") => { g.fillStyle = cor; g.beginPath(); g.arc(x, y, 56, 0, 7); g.fill(); g.fillStyle = "#fff"; g.font = "400 34px Inter"; g.fillText(s, x, y + 12); };
    icon(w * 0.25, 800, "🔇"); icon(w * 0.5, 800, "⌨"); icon(w * 0.75, 800, "🔊");
    icon(w * 0.5, h - 200, "✕", "#e5383b");
  } else if (modo === "colgado") {
    g.font = "700 58px Inter"; g.fillStyle = "#fff"; g.fillText("Mi número", w / 2, 250);
    g.font = "400 38px Inter"; g.fillStyle = "#e5383b"; g.fillText("Llamada finalizada", w / 2, 310);
    g.fillStyle = `rgba(0,0,0,${clamp(lt / 1.2)})`; g.fillRect(0, 0, w, h);
  } else if (modo === "mensaje") {
    g.fillStyle = "#fff"; g.font = "300 150px Inter"; g.fillText("3:19", w / 2, 300);
    g.font = "400 34px Inter"; g.fillStyle = "rgba(255,255,255,.75)"; g.fillText("martes, 17 de noviembre", w / 2, 360);
    const ap = (k) => easeOut((lt - k) / 0.5);
    const card = (y, k, tit, cuerpo, hora, icone) => {
      const a = ap(k); if (a <= 0) return;
      g.save(); g.globalAlpha = a; g.translate(0, (1 - a) * 40);
      g.fillStyle = "rgba(255,255,255,.16)"; rrect(g, 28, y, w - 56, 200, 34); g.fill();
      g.fillStyle = "#fff"; g.textAlign = "left"; g.font = "700 30px Inter"; g.fillText(icone + "  " + tit, 60, y + 56);
      g.textAlign = "right"; g.font = "400 26px Inter"; g.fillStyle = "rgba(255,255,255,.6)"; g.fillText(hora, w - 60, y + 56);
      g.textAlign = "left"; g.fillStyle = "#fff"; g.font = "400 32px Inter";
      cuerpo.forEach((l, i) => g.fillText(l, 60, y + 108 + i * 42)); g.restore(); g.textAlign = "center";
    };
    card(470, 0.2, "Mamá", ["Buenas noches, hijo. Ya me", "acosté. Te quiero ❤"], "23:04", "💬");
    card(700, 1.4, "Ubicación", ["Mamá está en: Casa", "a 300 km de ti"], "ahora", "📍");
  }
  g.restore(); telaTex.needsUpdate = true;
}

// ---------- luz sob a porta (fresta + mancha no chão, com a sombra dos pés) ----------
let frestaCv, frestaTex, manchaCv, manchaTex;
function desenharLuzPorta(pes, flick) {
  const ap = (g, w, h) => {};
  { // fresta: faixa quente com dois vãos escuros onde estão os pés
    const g = frestaCv.getContext("2d"), w = frestaCv.width, h = frestaCv.height;
    g.clearRect(0, 0, w, h); g.fillStyle = `rgba(255,190,110,${flick})`; g.fillRect(0, 0, w, h);
    if (pes.a > 0) {
      g.fillStyle = `rgba(0,0,0,${0.92 * pes.a})`;
      g.fillRect(w * (0.32 + pes.dx), 0, w * 0.13, h); g.fillRect(w * (0.55 + pes.dx * 0.7), 0, w * 0.13, h);
    }
    frestaTex.needsUpdate = true;
  }
  { // mancha no chão: leque de luz que sai da fresta e some depressa; os pés cortam duas sombras longas
    const g = manchaCv.getContext("2d"), w = manchaCv.width, h = manchaCv.height;
    g.clearRect(0, 0, w, h);
    const x0 = w * 0.2, x1 = w * 0.8;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `rgba(255,170,90,${0.75 * flick})`); gr.addColorStop(0.12, `rgba(255,150,70,${0.3 * flick})`); gr.addColorStop(0.55, `rgba(255,130,60,${0.06 * flick})`); gr.addColorStop(1, "rgba(255,120,50,0)");
    g.fillStyle = gr; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, 0); g.lineTo(w * 0.98, h); g.lineTo(w * 0.02, h); g.closePath(); g.fill();
    g.globalCompositeOperation = "destination-in"; // laterais somem
    const lat = g.createLinearGradient(0, 0, w, 0);
    lat.addColorStop(0, "rgba(0,0,0,0)"); lat.addColorStop(0.3, "rgba(0,0,0,1)"); lat.addColorStop(0.7, "rgba(0,0,0,1)"); lat.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = lat; g.fillRect(0, 0, w, h);
    if (pes.a > 0) {
      g.globalCompositeOperation = "destination-out";
      for (const xf of [0.32 + pes.dx, 0.55 + pes.dx * 0.7]) {
        const xa = x0 + (x1 - x0) * xf, xb = x0 + (x1 - x0) * (xf + 0.13);
        g.fillStyle = `rgba(0,0,0,${0.97 * pes.a})`;
        g.beginPath(); g.moveTo(xa, 0); g.lineTo(xb, 0); g.lineTo(xb + (xb - w / 2) * 1.4, h); g.lineTo(xa + (xa - w / 2) * 1.4, h); g.closePath(); g.fill();
      }
    }
    g.globalCompositeOperation = "source-over";
    manchaTex.needsUpdate = true;
  }
}

// ---------- cena ----------
function std(c, o = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o }); }
function caixa(w, h, d, mat, x, y, z, sombra = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
  m.castShadow = sombra; m.receiveShadow = true; scene.add(m); return m;
}
function plano(w, h, mat, pos, rot) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.copy(pos); m.rotation.set(...rot);
  m.receiveShadow = true; scene.add(m); return m;
}

function montar() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010204);
  scene.fog = new THREE.FogExp2(0x0b1220, 0.07);

  const madeiraT = texDe(madeira(), [3, 4]);
  const paredeT = texDe(papelParede(), [4, 1.6]);
  const parede = std(0x8a93a3, { map: paredeT, roughness: 0.95 });
  const piso = std(0xffffff, { map: madeiraT, roughness: 0.55 });

  // chão, teto
  plano(4.2, 5.8, piso, v3(0, 0, -2.3), [-Math.PI / 2, 0, 0]);
  plano(4.2, 5.8, std(0x4b5058), v3(0, 2.7, -2.3), [Math.PI / 2, 0, 0]);
  // parede do fundo (porta): x de -2 a 2, buraco da porta em x 0.1..1.0, y 0..2.07
  const zP = -5;
  const pf = (w, h, x, y) => { const m = plano(w, h, parede, v3(x, y, zP), [0, 0, 0]); m.castShadow = true; return m; };
  pf(2.1, 2.7, -0.95, 1.35); pf(1.0, 2.7, 1.5, 1.35); pf(0.9, 0.63, 0.55, 2.385);
  // parede direita, parede de trás
  plano(5.8, 2.7, parede, v3(2, 1.35, -2.3), [0, -Math.PI / 2, 0]);
  plano(4.2, 2.7, parede, v3(0, 1.35, 0.6), [0, Math.PI, 0]);
  // parede esquerda com janela (x=-2, janela z -3.3..-1.7, y 0.9..2.2)
  const pe = (w, h, z, y) => { const m = plano(w, h, parede, v3(-2, y, z), [0, Math.PI / 2, 0]); m.castShadow = true; return m; };
  pe(1.7, 2.7, -4.15, 1.35); pe(2.3, 2.7, -0.55, 1.35); pe(1.6, 0.9, -2.5, 0.45); pe(1.6, 0.5, -2.5, 2.45);
  // rodapé
  const rod = std(0x2a2420);
  caixa(4, 0.1, 0.02, rod, 0, 0.05, zP + 0.01, false); caixa(0.02, 0.1, 5.6, rod, 1.99, 0.05, -2.2, false);
  // céu lá fora + persiana
  const ceu = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ map: texDe(ceuNoite()), fog: false }));
  ceu.position.set(-3.2, 1.6, -2.5); ceu.rotation.y = Math.PI / 2; scene.add(ceu);
  const moldura = std(0xd8d4cc, { roughness: 0.6 });
  caixa(0.08, 0.05, 1.7, moldura, -1.97, 0.88, -2.5); caixa(0.08, 0.05, 1.7, moldura, -1.97, 2.22, -2.5);
  caixa(0.08, 1.36, 0.05, moldura, -1.97, 1.55, -3.33); caixa(0.08, 1.36, 0.05, moldura, -1.97, 1.55, -1.67);
  M.lamelas = [];
  const lam = std(0xcfc8bb, { roughness: 0.5 });
  for (let i = 0; i < 15; i++) {
    const l = caixa(0.07, 0.006, 1.6, lam, -1.93, 0.95 + i * 0.085, -2.5); l.rotation.z = 0.45; M.lamelas.push(l);
  }
  // luz da lua pela persiana
  const lua = new THREE.SpotLight(0x8fb2ff, 140, 14, 0.5, 0.3, 1.2);
  lua.position.set(-4.6, 3.1, -2.2); lua.target.position.set(0.6, 0.0, -2.9);
  lua.castShadow = true; lua.shadow.mapSize.set(1536, 1536); lua.shadow.bias = -0.0004; lua.shadow.radius = 2;
  lua.shadow.camera.near = 1; lua.shadow.camera.far = 12;
  scene.add(lua, lua.target); M.lua = lua;
  scene.add(new THREE.HemisphereLight(0x3a4c78, 0x120e0a, 1.1));
  const preenche = new THREE.SpotLight(0x7f9be0, 38, 9, 0.6, 0.8, 1.4); // rebote da lua na parede da porta
  preenche.position.set(-0.8, 2.4, -1.0); preenche.target.position.set(0.6, 0.9, -5); scene.add(preenche, preenche.target);

  // porta (dobradiça à esquerda em x=0.1)
  const pivo = new THREE.Group(); pivo.position.set(0.1, 0, zP + 0.02); scene.add(pivo); M.portaPivo = pivo;
  const corPorta = std(0x8a5a3a, { roughness: 0.6, map: texDe(madeira(), [0.6, 1]) });
  const folha = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.04, 0.045), corPorta); folha.position.set(0.45, 0.02 + 1.02, 0);
  folha.castShadow = folha.receiveShadow = true; pivo.add(folha);
  for (const [y, hh] of [[1.5, 0.75], [0.55, 0.75]]) { // almofadas da porta
    const al = new THREE.Mesh(new THREE.BoxGeometry(0.62, hh, 0.012), std(0x6e4529, { roughness: 0.6, map: corPorta.map })); al.position.set(0.45, y, 0.028);
    al.castShadow = al.receiveShadow = true; pivo.add(al);
  }
  // batente
  const bat = std(0xd8d4cc, { roughness: 0.55 });
  caixa(0.07, 2.12, 0.06, bat, 0.07, 1.06, zP + 0.02); caixa(0.07, 2.12, 0.06, bat, 1.03, 1.06, zP + 0.02); caixa(1.03, 0.07, 0.06, bat, 0.55, 2.1, zP + 0.02);
  // maçaneta (alavanca) com giro próprio
  const mac = new THREE.Group(); mac.position.set(0.82, 1.0, 0.035); pivo.add(mac); M.macaneta = mac;
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9b07a, metalness: 0.9, roughness: 0.28 });
  const roseta = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 24), metal); roseta.rotation.x = Math.PI / 2; mac.add(roseta);
  const alav = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.022), metal); alav.position.set(-0.06, 0, 0.035); mac.add(alav);
  const esp = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 12), metal); esp.rotation.x = Math.PI / 2; esp.position.z = 0.02; mac.add(esp);
  const fech = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 16), std(0x111111)); fech.rotation.x = Math.PI / 2; fech.position.set(0, -0.14, -0.002); mac.add(fech);
  // fresta de luz sob a porta e mancha no chão
  frestaCv = cv(256, 8, () => {}); frestaTex = new THREE.CanvasTexture(frestaCv); frestaTex.colorSpace = THREE.SRGBColorSpace;
  const fr = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.02), new THREE.MeshBasicMaterial({ map: frestaTex, color: 0xffffff, transparent: true, fog: false }));
  fr.position.set(0.55, 0.01, zP + 0.046); scene.add(fr); M.fresta = fr; fr.material.color.setScalar(6);
  manchaCv = cv(256, 256, () => {}); manchaTex = new THREE.CanvasTexture(manchaCv); manchaTex.colorSpace = THREE.SRGBColorSpace;
  const mc = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), new THREE.MeshBasicMaterial({ map: manchaTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  mc.rotation.x = -Math.PI / 2; mc.position.set(0.55, 0.003, zP + 0.66); mc.material.color.setScalar(0.8); scene.add(mc); M.mancha = mc;
  const luzPorta = new THREE.PointLight(0xffa860, 0.3, 3, 1.4); luzPorta.position.set(0.55, 0.06, zP + 0.12); scene.add(luzPorta); M.luzPorta = luzPorta;

  // cama (câmera deitada nela, olhando para a porta)
  const lencol = std(0xb8b2a8, { roughness: 0.95 });
  caixa(1.7, 0.28, 2.6, std(0x3b2a1f, { roughness: 0.6 }), 0.25, 0.14, -0.95);
  caixa(1.66, 0.22, 2.56, lencol, 0.25, 0.39, -0.95);
  caixa(1.76, 0.55, 0.06, std(0x3b2a1f, { roughness: 0.6, map: texDe(madeira(), [1, 0.4]) }), 0.25, 0.42, -2.28);
  { // cobertor com dobras
    const geo = new THREE.PlaneGeometry(1.86, 2.0, 60, 60); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const borda = Math.max(0, Math.abs(x) - 0.83) / 0.1;
      let y = 0.03 * Math.sin(x * 7 + z * 2) + 0.02 * Math.sin(z * 9 + x * 3) + 0.05 * Math.exp(-((x + 0.2) ** 2 + (z - 0.6) ** 2) * 3);
      if (borda > 0) y -= Math.min(borda, 1) * 0.28; // cai pelas laterais
      p.setY(i, y);
    }
    geo.computeVertexNormals();
    const cb = new THREE.Mesh(geo, std(0xffffff, { map: texDe(cobertor(), [3, 3]), side: THREE.DoubleSide })); cb.position.set(0.25, 0.52, -1.25); cb.castShadow = cb.receiveShadow = true; scene.add(cb);
  }
  // criado-mudo com celular, retrato, copo
  const mov = std(0x2f2219, { roughness: 0.5, map: texDe(madeira(), [0.5, 0.5]) });
  caixa(0.5, 0.58, 0.45, mov, 1.5, 0.29, -0.55); caixa(0.52, 0.03, 0.47, mov, 1.5, 0.595, -0.55);
  caixa(0.42, 0.012, 0.02, std(0x0b0806), 1.5, 0.45, -0.32, false);
  const ret = new THREE.Group(); ret.position.set(1.62, 0.61, -0.68); ret.rotation.y = -0.5; scene.add(ret);
  { const fm = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.18, 0.015, 2, 0.004), std(0x1a1410, { roughness: 0.4 })); fm.position.y = 0.09; fm.rotation.x = -0.12; ret.add(fm);
    const ft = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.15), std(0xffffff, { map: texDe(fotoFamilia()), roughness: 0.3 })); ft.position.set(0, 0.09, 0.009); ft.rotation.x = -0.12; ret.add(ft); M.retrato = ft; }
  const vidro = new THREE.MeshStandardMaterial({ color: 0xbcd6ff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 });
  const copo = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.11, 24, 1, true), vidro); copo.position.set(1.35, 0.665, -0.72); scene.add(copo);
  // celular deitado
  const cel = new THREE.Group(); cel.position.set(1.47, 0.616, -0.48); cel.rotation.y = 0.35; scene.add(cel); M.cel = cel;
  const corpoCel = new THREE.Mesh(new RoundedBoxGeometry(0.074, 0.009, 0.158, 3, 0.004), std(0x0c0c0e, { roughness: 0.25, metalness: 0.4 }));
  corpoCel.castShadow = true; cel.add(corpoCel);
  telaCv = cv(TELA.w, TELA.h, () => {}); telaG = telaCv.getContext("2d"); telaTex = new THREE.CanvasTexture(telaCv); telaTex.colorSpace = THREE.SRGBColorSpace; telaTex.anisotropy = 8;
  const telaM = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.146), new THREE.MeshBasicMaterial({ map: telaTex, fog: false }));
  telaM.rotation.x = -Math.PI / 2; telaM.position.y = 0.0047; cel.add(telaM); M.tela = telaM;
  const luzCel = new THREE.PointLight(0x9cc4ff, 0, 2.6, 1.8); luzCel.position.set(0, 0.12, 0); cel.add(luzCel); M.luzCel = luzCel;

  // guarda-roupa entreaberto na parede direita
  const gr = std(0x2a1f18, { roughness: 0.55, map: texDe(madeira(), [0.6, 1.2]) });
  caixa(0.6, 2.1, 1.2, gr, 1.68, 1.05, -3.6);
  const portaGR = caixa(0.03, 2.0, 0.58, gr, 1.37, 1.05, -3.31); portaGR.rotation.y = 0.35; portaGR.position.x = 1.33;
  caixa(0.02, 2.0, 0.04, std(0x000000), 1.375, 1.05, -3.6, false);
  // cadeira com roupas no canto (silhueta que parece gente)
  const cad = new THREE.Group(); cad.position.set(-1.45, 0, -4.25); cad.rotation.y = 0.7; scene.add(cad);
  const cm = std(0x241a13, { roughness: 0.6 });
  const pc = (w, h, d, x, y, z, m = cm) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; cad.add(b); return b; };
  pc(0.45, 0.04, 0.42, 0, 0.45, 0); pc(0.45, 0.5, 0.04, 0, 0.72, -0.2);
  for (const [x, z] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) pc(0.035, 0.45, 0.035, x, 0.225, z);
  const roupa = std(0x1c1d22, { roughness: 1 });
  const blob = (sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), roupa); b.scale.set(sx, sy, sz); b.position.set(x, y, z); b.castShadow = true; cad.add(b); };
  blob(0.24, 0.3, 0.16, 0, 0.78, -0.12); blob(0.1, 0.12, 0.1, 0, 1.12, -0.16); blob(0.26, 0.08, 0.24, 0, 0.52, 0.02); blob(0.06, 0.25, 0.06, 0.2, 0.62, 0.05);
  // quadro na parede direita
  const qd = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.52), std(0xffffff, { map: texDe(fotoFamilia()), roughness: 0.4 }));
  qd.position.set(1.985, 1.6, -1.2); qd.rotation.y = -Math.PI / 2; scene.add(qd);
  caixa(0.02, 0.58, 0.48, std(0x15100c), 1.995, 1.6, -1.2, false);
  // tapete
  plano(1.4, 0.9, std(0x3a1c22, { roughness: 1 }), v3(0.4, 0.004, -3.0), [-Math.PI / 2, 0, 0]);

  // poeira suspensa
  const n = 900, pos = new Float32Array(n * 3), r = rng(5);
  for (let i = 0; i < n; i++) { pos[i * 3] = -1.9 + r() * 3.6; pos[i * 3 + 1] = 0.1 + r() * 2.4; pos[i * 3 + 2] = -4.8 + r() * 4.6; }
  const gp = new THREE.BufferGeometry(); gp.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  M.poeira = new THREE.Points(gp, new THREE.PointsMaterial({ color: 0x9fb8ff, size: 0.008, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  M.poeiraBase = pos.slice(); scene.add(M.poeira);
}

// ---------- pós: profundidade de campo, bloom, grão e cor ----------
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const DOF = `
precision highp float; varying vec2 vUv;
uniform sampler2D tCor; uniform sampler2D tProf; uniform float near, far, focoA, focoB, abertura, divide; uniform vec2 res;
float dist(vec2 uv){ float d = texture2D(tProf, uv).x; return near*far / (far - d*(far-near)); }
float coc(vec2 uv){ float z = dist(uv); float f = (divide > .5 && uv.y < .5) ? focoB : focoA; return clamp(abs(z - f) / z * abertura, 0., 1.); }
void main(){
  float c = coc(vUv); vec3 acc = texture2D(tCor, vUv).rgb; float wsum = 1.;
  float raio = c * 0.018;
  for (int i = 0; i < 24; i++) {
    float fi = float(i); float a = fi * 2.39996; float r = sqrt((fi + .5) / 24.);
    vec2 o = vec2(cos(a), sin(a)) * r * raio * vec2(res.y / res.x, 1.);
    vec2 uv = vUv + o;
    if (divide > .5 && (uv.y < .5) != (vUv.y < .5)) continue;
    float cs = coc(uv); float w = mix(.15, 1., step(r * .98, cs + .02));
    acc += texture2D(tCor, uv).rgb * w; wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, 1.);
}`;
const FINAL = `
precision highp float; varying vec2 vUv;
uniform sampler2D tCor; uniform float tempo, vinheta, grao, aberr, flash, flashVermelho, exposicao, apagar; uniform vec2 res;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
void main(){
  vec2 d = vUv - .5;
  float ab = aberr * (0.002 + dot(d, d) * 0.012);
  vec3 c;
  c.r = texture2D(tCor, vUv + d * ab * 4.).r; c.g = texture2D(tCor, vUv).g; c.b = texture2D(tCor, vUv - d * ab * 4.).b;
  c *= exposicao;
  c = aces(c);
  // grade: sombras azul-petróleo, luzes âmbar
  float l = dot(c, vec3(.299, .587, .114));
  c = mix(c, c * vec3(.82, .95, 1.12), (1. - l) * .55);
  c = mix(c, c * vec3(1.08, 1., .9), l * .4);
  c = pow(c, vec3(1./2.2));
  c += flash * vec3(1.) + flashVermelho * vec3(.6, 0., 0.);
  float v = smoothstep(.95, .2, length(d * vec2(1., 1.25)));
  c *= mix(1., v, vinheta);
  float g = h(vUv * res + fract(tempo * 7.31) * 100.) - .5;
  c += g * grao * (0.6 + (1. - l) * .6);
  c *= (1. - apagar);
  gl_FragColor = vec4(c, 1.);
}`;

function montarPos() {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1); renderer.setSize(RW, RH, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = "gl"; document.body.appendChild(renderer.domElement);
  const op = { type: THREE.HalfFloatType, samples: 4 };
  rtCena = new THREE.WebGLRenderTarget(RW, RH, { ...op, depthTexture: new THREE.DepthTexture(RW, RH) });
  rtCena.depthTexture.type = THREE.UnsignedIntType;
  rtDof = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType });
  bloom = new UnrealBloomPass(new THREE.Vector2(RW, RH), 0.55, 0.6, 0.82);
  const tri = new THREE.PlaneGeometry(2, 2);
  matDof = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DOF, depthTest: false, depthWrite: false,
    uniforms: { tCor: { value: null }, tProf: { value: null }, near: { value: 0.05 }, far: { value: 30 }, focoA: { value: 2 }, focoB: { value: 2 }, abertura: { value: 1 }, divide: { value: 0 }, res: { value: new THREE.Vector2(RW, RH) } } });
  matFinal = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FINAL, depthTest: false, depthWrite: false,
    uniforms: { tCor: { value: null }, tempo: { value: 0 }, vinheta: { value: 0.75 }, grao: { value: 0.06 }, aberr: { value: 1 }, flash: { value: 0 }, flashVermelho: { value: 0 }, exposicao: { value: 1 }, apagar: { value: 0 }, res: { value: new THREE.Vector2(RW, RH) } } });
  quadDof = new THREE.Mesh(tri, matDof); quadFinal = new THREE.Mesh(tri, matFinal);
  M.cenaQuad = new THREE.Scene(); M.camQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  camA = new THREE.PerspectiveCamera(40, RW / RH, 0.05, 30);
  camB = new THREE.PerspectiveCamera(40, RW / (RH / 2), 0.05, 30);
}
function passarQuad(mesh, alvo) { M.cenaQuad.children.length = 0; M.cenaQuad.add(mesh); renderer.setRenderTarget(alvo); renderer.render(M.cenaQuad, M.camQuad); }

// ---------- linha do tempo ----------
const fala = (id) => L.falas.find((f) => f.id === id);
const ev = (k) => L.eventos[k] ?? 1e9;
function palavraT(id, i) { const f = fala(id); return f.palavras[Math.min(i, f.palavras.length - 1)].ini; }
function tomadas() { // cada fala abre sua tomada um pouco antes da voz
  const lead = 0.18, out = [];
  L.falas.forEach((f, i) => out.push({ tela: f.tela, id: f.id, ini: i === 0 ? 0 : f.ini - lead - (f.id === "l7" ? 2.3 : 0), fim: i + 1 < L.falas.length ? L.falas[i + 1].ini - lead - (L.falas[i + 1].id === "l7" ? 2.3 : 0) : L.dur + 1 }));
  return out;
}
let TOMADAS;

function estadoCelular(t) { // modo da tela, brilho, vibração
  const a = ev("atender"), d = ev("desligar"), f10 = fala("l10"), f9 = fala("l9");
  const toque2 = f10.palavras[f10.palavras.length - 1].ini - 0.1;
  if (t >= toque2) return { modo: "llamada2", lt: t - toque2, brilho: 1.3, vibra: true };
  if (t >= f9.ini - 0.3) return { modo: "mensaje", lt: t - (f9.ini - 0.3), brilho: 1, vibra: false };
  if (t >= d + 1.6) return { modo: "off", lt: 0, brilho: 0, vibra: false };
  if (t >= d) return { modo: "colgado", lt: t - d, brilho: 1 - clamp((t - d) / 1.6), vibra: false };
  if (t >= a) return { modo: "atendido", lt: t - a, brilho: 1, vibra: false };
  const n = fala("l2");
  if (t >= n.ini - 0.2 && t < fala("l3").ini) return { modo: "numero", lt: t, brilho: 1, vibra: true };
  return { modo: "llamada", lt: t, brilho: t < 0.12 ? 0 : 1, vibra: true };
}
function vibracao(t, on) { if (!on) return 0; const ciclo = (t % 1.6); return ciclo < 1.0 ? 1 : 0; }

function pesPorta(t) {
  const g = ev("golpes");
  const a = smooth((t - (g + 0.15)) / 0.5);
  const dx = 0.02 * Math.sin(t * 0.9) + (t > ev("macaneta") ? 0.03 * smooth((t - ev("macaneta")) / 1) : 0);
  return { a, dx };
}
function tempoGolpes() { const g = ev("golpes"); return [g + 0.35, g + 1.0, g + 1.65]; }
function impacto(t) { // tremor a cada golpe na porta
  let s = 0; for (const k of tempoGolpes()) if (t >= k) s += Math.exp(-(t - k) * 9) * (t - k < 0.6 ? 1 : 0); return s;
}
function giroMacaneta(t) {
  const m = ev("macaneta"); if (t < m) return 0;
  const u = (t - m);
  return -0.55 * smooth(u / 1.1) + (u > 1.1 && u < 1.6 ? 0.04 * Math.sin(u * 60) : 0) + 0.55 * smooth((u - 1.7) / 0.25) * (u < 3.2 ? 1 : 0) - (u > 3.4 ? 0.55 * smooth((u - 3.4) / 1.4) : 0);
}

// câmeras: cada tomada devolve posição, alvo, fov e foco
function camCelular(dist, alt, ang, t, foco = null) {
  const c = M.cel.position, a = M.cel.rotation.y + ang;
  const pos = v3(c.x + Math.sin(a) * dist, c.y + alt, c.z + Math.cos(a) * dist);
  return { pos, alvo: c.clone().add(v3(0, 0.005, 0)), fov: 32, foco: foco ?? pos.distanceTo(c) };
}
const PORTA = v3(0.55, 1.02, -5);
function tomada(nome, u, t, sh) {
  switch (nome) {
    case "celular_llamada": { const c = camCelular(lerp(0.36, 0.2, easeOut(u)), lerp(0.42, 0.28, easeOut(u)), -0.35 + u * 0.25, t); c.fov = 30; return c; }
    case "celular_numero": { const c = camCelular(lerp(0.09, 0.06, u), lerp(0.22, 0.17, u), 0.02 + u * 0.08, t); c.fov = 30; return c; }
    case "cuarto": {
      const ini = sh.ini, k = clamp((t - ini) / 2.4);
      const look = v3(lerp(1.3, 0.55, easeInOut(k)), lerp(0.7, 1.0, easeInOut(k)), lerp(-1.2, -5, easeInOut(k)));
      return { pos: v3(0.15, 1.02, 0.1 - u * 0.15), alvo: look, fov: 52, foco: lerp(1.6, 4.8, easeInOut(k)) };
    }
    case "celular_atendido": { const c = camCelular(lerp(0.26, 0.18, u), lerp(0.3, 0.24, u), 0.6 - u * 0.5, t); c.fov = 34; return c; }
    case "porta_aproxima": {
      const k = easeInOut(u);
      return { pos: v3(lerp(0.3, 0.52, k), lerp(1.08, 1.0, k), lerp(-0.6, -3.1, k)), alvo: v3(0.55, lerp(1.0, 0.6, k), -5), fov: lerp(46, 36, k), foco: lerp(4.4, 1.95, k) };
    }
    case "cuarto_porta": {
      const f = fala("l6"), corte = f.palavras[1] ? f.palavras[1].ini - 0.05 : f.ini + 0.6;
      if (t < corte) { const c = camCelular(0.16, 0.24, 0.3, t); c.fov = 32; return c; }
      const k = clamp((t - corte) / 6);
      return { pos: v3(0.45, 1.05, lerp(-1.6, -2.3, easeOut(k))), alvo: PORTA.clone(), fov: 44, foco: lerp(3.4, 2.7, easeOut(k)) };
    }
    case "porta_baixo": {
      const k = easeOut(u);
      return { pos: v3(lerp(0.75, 0.6, k), lerp(0.32, 0.2, k), lerp(-3.3, -3.9, k)), alvo: v3(0.55, 0.05, -5), fov: 38, foco: lerp(1.75, 1.15, k) };
    }
    case "macaneta": {
      const k = easeInOut(u);
      return { pos: v3(lerp(0.45, 0.62, k), lerp(1.08, 1.03, k), lerp(-4.0, -4.45, k)), alvo: v3(0.92, 1.0, -4.95), fov: 36, foco: lerp(1.0, 0.62, k) };
    }
    case "celular_mensagem": { const c = camCelular(lerp(0.12, 0.09, u), lerp(0.26, 0.2, u), -0.15 + u * 0.12, t); c.fov = 30; return c; }
    case "celular_de_novo": {
      const f = fala("l10"), toque = f.palavras[f.palavras.length - 1].ini - 0.1;
      if (t < toque) { const c = camCelular(0.09, 0.2, -0.03, t); c.fov = 30; return c; }
      const k = easeOut((t - toque) / 1.2); const c = camCelular(lerp(0.4, 0.17, k), lerp(0.5, 0.24, k), 0.1, t); c.fov = 32; return c;
    }
    default: return { pos: v3(0.2, 1.05, 0), alvo: PORTA.clone(), fov: 50, foco: 4.5 };
  }
}
function aplicarCam(cam, c, t, tremor) {
  const amp = 0.004 + tremor * 0.03;
  cam.position.copy(c.pos).add(v3(ruido(t * 0.7, 1) * amp, ruido(t * 0.8, 2) * amp, ruido(t * 0.6, 3) * amp));
  const alvo = c.alvo.clone().add(v3(ruido(t * 0.5, 4) * amp * 2, ruido(t * 0.55, 5) * amp * 2, 0));
  cam.fov = c.fov; cam.updateProjectionMatrix(); cam.lookAt(alvo);
  cam.rotateZ(ruido(t * 0.4, 6) * 0.006 + tremor * ruido(t * 30, 7) * 0.02);
}

// ---------- legenda palavra por palavra ----------
function montarLegendas() {
  legendas = [];
  for (const f of L.falas) {
    let bloco = [];
    const fechar = () => { if (bloco.length) legendas.push({ fala: f, palavras: bloco }); bloco = []; };
    for (const p of f.palavras) {
      bloco.push(p);
      const lim = f.sussurro || f.porta ? 4 : 3;
      if (/[.,:?!]$/.test(p.w) || bloco.length >= lim) fechar();
    }
    fechar();
  }
  legendas.forEach((b, i) => { b.ini = b.palavras[0].ini - 0.05; const prox = legendas[i + 1]; b.fim = Math.min(prox ? prox.palavras[0].ini - 0.05 : b.fala.fim + 0.6, b.palavras[b.palavras.length - 1].fim + 0.7); });
}
const limpa = (w) => w.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
function desenharLegenda(t, y0) {
  if (window.SEM_LEGENDA) return;
  const b = legendas.find((l) => t >= l.ini && t < l.fim); if (!b) return;
  const f = b.fala, dest = new Set(f.destaque.map(limpa));
  ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  let fonte, cor = "#fff", caixaAlta = true, tam = 104;
  if (f.sussurro) { fonte = "Special Elite"; tam = 70; caixaAlta = false; cor = "#dfe7ff"; }
  else if (f.porta) { fonte = "Special Elite"; tam = 74; caixaAlta = false; cor = "#ffc98a"; }
  else fonte = "Anton";
  ctx.font = `${tam}px "${fonte}"`;
  const pal = b.palavras.map((p) => { const txt = caixaAlta ? p.w.toUpperCase() : p.w; return { ...p, txt, larg: ctx.measureText(txt).width }; });
  const esp = tam * 0.36, maxL = W - 140;
  const linhas = [[]]; let lx = 0;
  for (const p of pal) { if (lx + p.larg > maxL && linhas[linhas.length - 1].length) { linhas.push([]); lx = 0; } linhas[linhas.length - 1].push(p); lx += p.larg + esp; }
  linhas.forEach((ln, li) => {
    const larg = ln.reduce((s, p) => s + p.larg, 0) + esp * (ln.length - 1);
    let x = (W - larg) / 2; const y = y0 + li * tam * 1.12;
    for (const p of ln) {
      const vis = t >= p.ini - 0.02;
      if (vis) {
        const k = clamp((t - p.ini) / 0.12), pop = 1 + 0.08 * (1 - easeOut(k));
        const tremor = f.sussurro ? ruido(t * 14, p.ini * 10) * 2.5 : 0;
        ctx.save(); ctx.translate(x + p.larg / 2 + tremor, y - tam * 0.35 + tremor); ctx.scale(pop, pop); ctx.translate(-p.larg / 2, tam * 0.35);
        ctx.globalAlpha = f.sussurro ? 0.4 + 0.6 * k : 0.3 + 0.7 * k;
        ctx.lineJoin = "round"; ctx.lineWidth = tam * 0.14; ctx.strokeStyle = "rgba(0,0,0,.9)";
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 18; ctx.strokeText(p.txt, 0, 0); ctx.shadowBlur = 0;
        const d = dest.has(limpa(p.w));
        ctx.fillStyle = d ? "#ff2b2b" : cor;
        if (d) { ctx.shadowColor = "rgba(255,30,30,.7)"; ctx.shadowBlur = 26; }
        ctx.fillText(p.txt, 0, 0); ctx.restore();
      }
      x += p.larg + esp;
    }
  });
  ctx.restore();
}

// ---------- sobreposições ----------
function desenharTitulo(t) {
  ctx.save(); ctx.textAlign = "center";
  // selo PARTE 1 (sempre), título nos primeiros segundos
  const a = clamp(t / 0.3);
  ctx.globalAlpha = a; ctx.fillStyle = "#e01f1f"; ctx.beginPath(); ctx.roundRect(W / 2 - 110, 128, 220, 62, 8); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = '44px "Anton"'; ctx.fillText("PARTE 1", W / 2, 176);
  const tt = clamp((t - 0.25) / 0.4) * (1 - clamp((t - 3.4) / 0.5));
  if (tt > 0) { ctx.globalAlpha = tt; ctx.font = '40px "Special Elite"'; ctx.fillStyle = "#e8e8f0"; ctx.shadowColor = "#000"; ctx.shadowBlur = 12; ctx.fillText("La llamada de las 3:17", W / 2, 250); }
  ctx.restore();
}
function desenharEscolha(t, ini) {
  const u = t - ini;
  ctx.save(); ctx.textAlign = "center";
  // faixa central
  const a = easeOut(u / 0.4);
  ctx.fillStyle = `rgba(0,0,0,${0.82 * a})`; ctx.fillRect(0, H / 2 - 6, W, 12);
  ctx.fillStyle = "#e01f1f"; ctx.fillRect(0, H / 2 - 3, W * a, 6);
  const etiqueta = (letra, txt, y, k) => {
    const e = easeOut((u - k) / 0.45); if (e <= 0) return;
    ctx.save(); ctx.globalAlpha = e; ctx.translate(W / 2, y); ctx.scale(0.8 + 0.2 * e, 0.8 + 0.2 * e);
    ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.beginPath(); ctx.roundRect(-410, -110, 820, 200, 26); ctx.fill();
    ctx.fillStyle = "#e01f1f"; ctx.beginPath(); ctx.arc(-300, -10, 72, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = '108px "Anton"'; ctx.fillText(letra, -300, 28);
    ctx.textAlign = "left"; ctx.font = '62px "Anton"'; ctx.fillText(txt[0], -200, -14); ctx.fillText(txt[1], -200, 58);
    ctx.restore();
  };
  const A = L.escolhas.A.split(" "), B = L.escolhas.B.split(" ");
  const pw = fala("l11").palavras, em = (i) => pw[Math.min(i, pw.length - 1)].ini - ini;
  etiqueta("A", [A.slice(0, 1).join(" "), A.slice(1).join(" ")], H * 0.3, em(2));
  etiqueta("B", [B.slice(0, 1).join(" "), B.slice(1).join(" ")], H * 0.8, em(6));
  // chamada para comentar
  const c = easeOut((u - em(9)) / 0.3);
  if (c > 0) {
    const pul = 1 + 0.04 * Math.sin(u * 6);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(pul * (0.85 + 0.15 * c), pul * (0.85 + 0.15 * c)); ctx.globalAlpha = c;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(-380, -62, 760, 124, 62); ctx.fill();
    ctx.fillStyle = "#111"; ctx.font = '76px "Anton"'; ctx.fillText("COMENTA  A  O  B  👇", 0, 27);
    ctx.restore();
  }
  const fim = L.dur - 2.4;
  const p2 = easeOut((t - fim) / 0.4);
  if (p2 > 0) { ctx.globalAlpha = p2; ctx.fillStyle = "#fff"; ctx.font = '46px "Anton"'; ctx.shadowColor = "#000"; ctx.shadowBlur = 16; ctx.fillText("LA MÁS VOTADA DECIDE LA PARTE 2", W / 2, H / 2 + 120); }
  ctx.restore();
}

// ---------- quadro ----------
function quadro(t) {
  // estado do mundo
  const cel = estadoCelular(t);
  desenharTela(cel.modo, t, cel.lt);
  const vib = vibracao(t, cel.vibra);
  M.cel.position.x = 1.47 + (vib ? Math.sin(t * 190) * 0.0012 : 0);
  M.cel.position.z = -0.48 + (vib ? Math.cos(t * 170) * 0.0012 : 0) + (cel.vibra ? t * 0.0004 : 0);
  M.luzCel.intensity = 0.55 * cel.brilho * (cel.modo === "llamada2" ? 1 + 0.4 * Math.sin(t * 12) : 1);
  M.luzCel.color.set(cel.modo === "llamada2" ? 0xff5a5a : 0x9cc4ff);
  M.tela.material.color.setScalar(1.25 * Math.max(cel.brilho, cel.modo === "off" ? 0 : 0.2));
  const imp = impacto(t);
  const g = ev("golpes");
  let flick = 1;
  if (t > g) flick = 0.85 + 0.15 * ruido(t * 8, 9);
  if (t > g && t < g + 2.2) flick *= 1 - 0.5 * imp;
  if (t > ev("macaneta") - 0.5) flick *= 0.8 + 0.2 * (ruido(t * 22, 2) > -0.6 ? 1 : 0.1);
  desenharLuzPorta(pesPorta(t), flick);
  M.luzPorta.intensity = 0.3 * flick * (1 - 0.4 * pesPorta(t).a);
  M.portaPivo.rotation.y = -imp * 0.004;
  M.portaPivo.position.z = -4.98 + imp * 0.004;
  M.macaneta.rotation.z = giroMacaneta(t);
  // poeira
  const pp = M.poeira.geometry.attributes.position, base = M.poeiraBase;
  for (let i = 0; i < pp.count; i++) {
    pp.array[i * 3] = base[i * 3] + Math.sin(t * 0.13 + i) * 0.05;
    pp.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.09 + i * 1.7) * 0.06 - ((t * 0.01 + i * 0.001) % 0.3);
    pp.array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.11 + i * 0.3) * 0.05;
  }
  pp.needsUpdate = true;
  M.lua.intensity = 140 * tw("lua") * (1 - 0.05 * Math.sin(t * 0.3));

  // tomada
  const sh = TOMADAS.find((s) => t >= s.ini && t < s.fim) || TOMADAS[TOMADAS.length - 1];
  const u = clamp((t - sh.ini) / (sh.fim - sh.ini));
  const divide = sh.tela === "escolha";
  let fA, fB;
  if (divide) {
    const k = clamp((t - sh.ini) / 8);
    const ca = { pos: v3(0.5, 0.95, lerp(-2.5, -2.85, k)), alvo: v3(0.56, 0.85, -5), fov: 50, foco: 2.3 };
    const cb = camCelular(lerp(0.2, 0.15, k), lerp(0.2, 0.17, k), 0.15, t); cb.fov = 34;
    camA.aspect = RW / (RH / 2); camB.aspect = RW / (RH / 2);
    aplicarCam(camA, ca, t, imp); aplicarCam(camB, cb, t + 13, imp); fA = ca.foco; fB = cb.foco;
  } else {
    const c = tomada(sh.tela, u, t, sh);
    camA.aspect = RW / RH; aplicarCam(camA, c, t, imp + (cel.modo === "llamada2" && sh.tela === "celular_de_novo" ? 0.3 : 0)); fA = c.foco;
  }

  // render
  renderer.setRenderTarget(rtCena); renderer.setClearColor(0x000000, 1); renderer.clear();
  if (divide) {
    rtCena.scissorTest = true;
    rtCena.viewport.set(0, RH / 2, RW, RH / 2); rtCena.scissor.set(0, RH / 2, RW, RH / 2);
    renderer.setRenderTarget(rtCena); renderer.render(scene, camA);
    rtCena.viewport.set(0, 0, RW, RH / 2); rtCena.scissor.set(0, 0, RW, RH / 2);
    renderer.setRenderTarget(rtCena); renderer.render(scene, camB);
    rtCena.scissorTest = false; rtCena.viewport.set(0, 0, RW, RH); rtCena.scissor.set(0, 0, RW, RH);
  } else renderer.render(scene, camA);
  Object.assign(matDof.uniforms, {});
  matDof.uniforms.tCor.value = rtCena.texture; matDof.uniforms.tProf.value = rtCena.depthTexture;
  matDof.uniforms.focoA.value = fA; matDof.uniforms.focoB.value = fB ?? fA; matDof.uniforms.divide.value = divide ? 1 : 0;
  matDof.uniforms.abertura.value = 1.1 * tw("desfoque");
  passarQuad(quadDof, rtDof);
  bloom.strength = 0.6 * tw("bloom");
  bloom.render(renderer, null, rtDof, 0, false);
  const f8 = fala("l8"), f10 = fala("l10");
  const toque2 = f10.palavras[f10.palavras.length - 1].ini - 0.1;
  Object.assign(matFinal.uniforms.tempo, { value: t });
  matFinal.uniforms.tCor.value = rtDof.texture;
  matFinal.uniforms.vinheta.value = (sh.tela === "porta_aproxima" || sh.tela === "macaneta" ? 0.95 : 0.75) * tw("vinheta");
  matFinal.uniforms.grao.value = 0.07 * tw("grao");
  matFinal.uniforms.aberr.value = 1 + imp * 6 + (t > toque2 && t < toque2 + 0.35 ? 8 : 0);
  matFinal.uniforms.flash.value = 0;
  matFinal.uniforms.flashVermelho.value = (t > toque2 && t < toque2 + 0.25 ? 0.35 * (1 - (t - toque2) / 0.25) : 0) + imp * 0.06;
  matFinal.uniforms.exposicao.value = 1.15 * tw("exposicao");
  // cortes: piscada preta curta entre tomadas
  const dCorte = Math.min(...TOMADAS.map((s) => Math.abs(t - s.ini)).filter((x) => x >= 0));
  matFinal.uniforms.apagar.value = (t < 0.15 ? 1 - t / 0.15 : 0) + (dCorte < 0.035 ? 0.5 : 0) + (t > L.dur - 0.6 ? clamp((t - (L.dur - 0.6)) / 0.6) * 0.0 : 0);
  passarQuad(quadFinal, null);

  // composição 2D (texto sempre em 1080)
  ctx.drawImage(renderer.domElement, 0, 0, W, H);
  desenharTitulo(t);
  if (divide) {
    desenharEscolha(t, sh.ini);
    if (t < fala("l11").palavras[9].ini) desenharLegenda(t, H / 2 + 175);
  } else {
    desenharLegenda(t, H * 0.64);
  }
  // grão fino em resolução cheia
  ctx.save(); ctx.globalAlpha = 0.07 * tw("grao"); ctx.globalCompositeOperation = "overlay";
  const ox = Math.floor(ruido(t * 50, 1) * 200 + 200), oy = Math.floor(ruido(t * 50, 2) * 200 + 200);
  ctx.drawImage(grainCv, -ox, -oy); ctx.restore();
}

async function carregarFontes() {
  const base = "../node_modules/@fontsource/";
  const fs = [["Anton", "anton/files/anton-latin-400-normal.woff2", "400"], ["Special Elite", "special-elite/files/special-elite-latin-400-normal.woff2", "400"],
    ["Inter", "inter/files/inter-latin-300-normal.woff2", "300"], ["Inter", "inter/files/inter-latin-400-normal.woff2", "400"], ["Inter", "inter/files/inter-latin-700-normal.woff2", "700"], ["Inter", "inter/files/inter-latin-700-normal.woff2", "600"]];
  for (const [n, f, w] of fs) { const ff = new FontFace(n, `url(${base}${f})`, { weight: w }); await ff.load(); document.fonts.add(ff); }
}

window.iniciar = async (linha) => {
  L = linha;
  await carregarFontes();
  c2d = document.getElementById("c"); c2d.width = W; c2d.height = H; ctx = c2d.getContext("2d");
  if (P.get("tela") === "metade") { c2d.style.width = W / 2 + "px"; }
  grainCv = cv(W + 400, H + 400, (g, w, h) => {
    const im = g.createImageData(w, h), r = rng(3);
    for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0);
  });
  montarPos(); montar(); montarLegendas(); TOMADAS = tomadas();
  quadro(0);
  return { dur: L.dur, fps: L.fps, tomadas: TOMADAS.map((s) => [s.tela, +s.ini.toFixed(2)]) };
};
window.quadro = (t) => { quadro(t); };
window.jpeg = (t, q = 0.9) => { quadro(t); return c2d.toDataURL("image/jpeg", q).split(",")[1]; };
// portada: o quadro t com o título grande por cima (miniatura das redes)
window.portada = (t, linhas = ["ME LLAMA", "MI PROPIO", "NÚMERO"]) => {
  window.SEM_LEGENDA = true; quadro(t); window.SEM_LEGENDA = false;
  ctx.save(); ctx.textAlign = "center";
  const g = ctx.createLinearGradient(0, H * 0.5, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.35, "rgba(0,0,0,.8)"); g.addColorStop(1, "rgba(0,0,0,.9)");
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.5, W, H * 0.5);
  linhas.forEach((l, i) => {
    ctx.font = '170px "Anton"'; ctx.lineJoin = "round"; ctx.lineWidth = 22; ctx.strokeStyle = "#000"; ctx.strokeText(l, W / 2, 1240 + i * 175);
    ctx.fillStyle = i === 2 ? "#ff2b2b" : "#fff"; if (i === 2) { ctx.shadowColor = "rgba(255,30,30,.8)"; ctx.shadowBlur = 40; }
    ctx.fillText(l, W / 2, 1240 + i * 175); ctx.shadowBlur = 0;
  });
  ctx.font = '64px "Anton"'; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 12;
  ctx.strokeText("A LAS 3:17 · ¿A O B?", W / 2, 1745); ctx.fillText("A LAS 3:17 · ¿A O B?", W / 2, 1745);
  ctx.restore();
  return c2d.toDataURL("image/jpeg", 0.92).split(",")[1];
};
