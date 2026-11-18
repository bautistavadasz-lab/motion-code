"""Narração do 3D WebGL: gera cada fala no Fish (cache por fala), monta a faixa de voz e a linha do tempo.

Uso: python3 narrar.py episodios/<slug> [--provisorio]
  --provisorio  sem chave: durações estimadas, voz muda (só para montar a cena)
Saídas em episodios/<slug>/: audio/voz.wav e linha.json (falas, palavras com tempo, eventos, duração).
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[1]))
from nucleo import voz  # noqa: E402

SR = voz.SR
INICIO = 0.7  # o vídeo abre com o celular vibrando antes da primeira palavra


def gerar(fala, roteiro, pasta):
    p = roteiro["vozes"][fala["voz"]]
    texto = (fala.get("direcao", "") + " " + fala["texto"]).strip()
    h = hashlib.sha1(f"{p['voz']}|{texto}".encode()).hexdigest()[:10]
    arq = pasta / f"{fala['id']}-{h}.mp3"
    if not arq.exists():
        print("  Fish:", fala["id"], fala["texto"][:50])
        voz.falar({"input": texto, "response_format": "mp3", "_p": p}, arq)
    return voz.decode(arq)


def atras_da_porta(x):
    """Voz abafada atrás da porta: passa-baixa, um pouco de corpo de madeira e sala."""
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
         "-af", "lowpass=f=1100,lowpass=f=1600,highpass=f=140,equalizer=f=320:t=q:w=1.2:g=4,"
                "aecho=0.8:0.6:23|41:0.35|0.2,volume=1.6",
         "-f", "f32le", "-"], input=x.astype(np.float32).tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def sussurro(x):
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
         "-af", "aecho=0.8:0.5:60|110:0.25|0.15,highpass=f=90",
         "-f", "f32le", "-"], input=x.astype(np.float32).tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def palavras_por_pausa(clip, texto):
    """Tempo de cada palavra: grupos separados por pontuação caem nos trechos de fala entre pausas;
    dentro do grupo, proporcional ao tamanho da palavra. Sem transcritor, mas preso às pausas reais."""
    ws = texto.split()
    grupos, g = [], []
    for w in ws:
        g.append(w)
        if re.search(r"[,.:?!…]$", w) or w.endswith("..."):
            grupos.append(g); g = []
    if g:
        grupos.append(g)
    hop = int(0.01 * SR)
    rms = np.sqrt(np.convolve(clip ** 2, np.ones(hop * 3) / (hop * 3), "same")[::hop])
    fala = rms > max(0.012, rms.max() * 0.06)
    # trechos de fala separados por pausa >= 140 ms
    trechos, ini, sil = [], None, 0
    for i, f in enumerate(fala):
        if f:
            if ini is None: ini = i
            sil = 0; fim = i
        elif ini is not None:
            sil += 1
            if sil >= 14:
                trechos.append([ini, fim]); ini = None
    if ini is not None:
        trechos.append([ini, fim])
    trechos = [[a * 0.01, (b + 1) * 0.01] for a, b in trechos] or [[0, len(clip) / SR]]
    peso = lambda w: len(re.sub(r"\W", "", w)) + 2
    # junta trechos até bater com o número de grupos (une os de menor pausa entre eles)
    while len(trechos) > len(grupos):
        gaps = [trechos[i + 1][0] - trechos[i][1] for i in range(len(trechos) - 1)]
        i = int(np.argmin(gaps)); trechos[i] = [trechos[i][0], trechos[i + 1][1]]; del trechos[i + 1]
    if len(trechos) < len(grupos):  # menos pausas que grupos: um trecho só, proporcional
        trechos = [[trechos[0][0], trechos[-1][1]]]; grupos = [ws]
    out = []
    for (a, b), g in zip(trechos, grupos):
        tot = sum(peso(w) for w in g); t = a
        for w in g:
            d = (b - a) * peso(w) / tot
            out.append({"w": w, "ini": round(t, 3), "fim": round(t + d, 3)}); t += d
    return out


_W = None
def palavras_whisper(clip, texto):
    """Tempo de cada palavra pelo transcritor (faster-whisper); as palavras do roteiro herdam os tempos
    na ordem. Se o número de palavras não bater, volta para a divisão por pausas."""
    global _W
    try:
        from faster_whisper import WhisperModel
        import os; os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
        _W = _W or WhisperModel("small", device="cpu", compute_type="int8")
    except Exception:
        return None
    x16 = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-f", "f32le", "-ar", "16000", "-"],
                         input=clip.astype(np.float32).tobytes(), capture_output=True, check=True).stdout
    segs, _ = _W.transcribe(np.frombuffer(x16, np.float32), language="es", word_timestamps=True)
    reco = [w for s in segs for w in s.words]
    ws = texto.split()
    ouvido = " ".join(w.word.strip() for w in reco)
    print("    ouvido:", ouvido)
    if len(reco) != len(ws):
        # números viram dígitos ("tres y diecisiete" -> "3 y 17"): distribui por caracteres dentro do trecho reconhecido
        if not reco: return None
        a, b = reco[0].start, reco[-1].end
        peso = [len(re.sub(r"\W", "", w)) + 2 for w in ws]; tot = sum(peso); t = a; out = []
        for w, pz in zip(ws, peso):
            d = (b - a) * pz / tot; out.append({"w": w, "ini": round(t, 3), "fim": round(t + d, 3)}); t += d
        return out
    return [{"w": w, "ini": round(r.start, 3), "fim": round(r.end, 3)} for w, r in zip(ws, reco)]


def main():
    ep = Path(sys.argv[1]).resolve()
    prov = "--provisorio" in sys.argv
    roteiro = json.loads((ep / "roteiro.json").read_text())
    audio = ep / "audio"; audio.mkdir(exist_ok=True)
    pedacos, t = [], INICIO
    pedacos.append(np.zeros(int(INICIO * SR), np.float32))
    falas, eventos = [], {}
    for f in roteiro["falas"]:
        antes = f.get("antes", 0)
        if antes:
            pedacos.append(np.zeros(int(antes * SR), np.float32)); t += antes
        if prov:
            n = len(f["texto"].split())
            clip = np.zeros(int((n / 2.5 + 0.3) * SR), np.float32)
            pal = [{"w": w, "ini": i / 2.5, "fim": (i + 1) / 2.5} for i, w in enumerate(f["texto"].split())]
        else:
            clip = gerar(f, roteiro, audio)
            pal = palavras_whisper(clip, f["texto"]) or palavras_por_pausa(clip, f["texto"])
            if f.get("atras_da_porta"):
                clip = atras_da_porta(clip)
            elif f.get("sussurro"):
                clip = sussurro(clip)
        d = len(clip) / SR
        falas.append({**{k: f[k] for k in ("id", "voz", "texto", "tela")}, "destaque": f.get("destaque", []),
                      "sussurro": f.get("sussurro", False), "porta": f.get("atras_da_porta", False),
                      "ini": round(t, 3), "fim": round(t + d, 3),
                      "palavras": [{**p, "ini": round(t + p["ini"], 3), "fim": round(t + p["fim"], 3)} for p in pal]})
        if f.get("evento_inicio"):
            eventos[f["evento_inicio"]] = round(t, 3)
        pedacos.append(clip); t += d
        if f.get("evento_fim"):
            eventos[f["evento_fim"]] = round(t, 3)
        pedacos.append(np.zeros(int(f.get("depois", 0.4) * SR), np.float32)); t += f.get("depois", 0.4)
    faixa = np.concatenate(pedacos)
    dur = len(faixa) / SR
    # tela de cada fala começa um pouco antes da voz (corte antecipa a fala)
    linha = {"dur": round(dur, 3), "fps": 30, "falas": falas, "eventos": eventos,
             "escolhas": roteiro["escolhas"], "titulo": roteiro["titulo"], "provisorio": prov}
    (ep / "linha.json").write_text(json.dumps(linha, ensure_ascii=False, indent=1))
    import wave
    with wave.open(str(audio / "voz.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(faixa, -1, 1) * 32767).astype(np.int16).tobytes())
    print(f"linha.json: {dur:.1f} s, {len(falas)} falas, eventos {eventos}")


if __name__ == "__main__":
    main()
