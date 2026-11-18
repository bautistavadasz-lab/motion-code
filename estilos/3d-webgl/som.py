"""Desenho de som do episódio, todo em código, preso aos eventos da linha do tempo.

Uso: python3 som.py episodios/<slug>
Lê linha.json e audio/voz.wav; grava audio/efeitos.wav, audio/trilha.wav e audio/mix.wav (estéreo 48 kHz).
Nunca deixa silêncio digital: o drone e um tom de sala ficam por baixo do vídeo inteiro.
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
R = np.random.default_rng(17)


def ler(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def gravar(path, x):
    x = np.atleast_2d(x)
    if x.shape[0] == 1: x = np.vstack([x, x])
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x.T, -1, 1) * 32767).astype(np.int16).tobytes())


def tt(d): return np.arange(int(d * SR)) / SR


def lp(x, fc):  # passa-baixa de 1 polo, aplicado duas vezes
    a = np.exp(-2 * np.pi * fc / SR)
    for _ in range(2):
        y = np.empty_like(x); acc = 0.0
        # vetorizado por blocos via filtro IIR com lfilter caseiro
        y = _iir(x, a)
        x = y
    return x


def _iir(x, a):
    # y[n] = (1-a) x[n] + a y[n-1], em blocos com numpy (rápido o bastante para ~1 min)
    out = np.empty_like(x); b = 1 - a; prev = 0.0
    N = 4096
    pots = a ** np.arange(1, N + 1)
    for i in range(0, len(x), N):
        seg = x[i:i + N] * b
        n = len(seg)
        # convolução com o kernel exponencial dentro do bloco
        k = a ** np.arange(n)
        y = np.convolve(seg, k)[:n] + prev * pots[:n]
        out[i:i + n] = y; prev = y[-1]
    return out


def hp(x, fc): return x - lp(x, fc)


def bp(x, f1, f2): return lp(hp(x, f1), f2)


def reverb(x, seg=1.4, mix=0.3, cor=3000):
    n = int(seg * SR); ir = R.standard_normal(n) * np.exp(-np.arange(n) / SR * 6.9 / seg)
    ir = lp(ir.astype(np.float32), cor); ir /= np.sqrt((ir ** 2).sum()) + 1e-9
    m = len(x) + n; F = 1 << (m - 1).bit_length()
    w = np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[:len(x)]
    return x * (1 - mix) + w * mix * 0.6


def env(d, a=0.005, r=0.1):
    t = tt(d); e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / r); return e


def por(buf, t0, x, g=1.0):
    i = int(t0 * SR)
    if i >= len(buf) or i + len(x) <= 0: return
    a, b = max(0, i), min(len(buf), i + len(x))
    buf[a:b] += x[a - i:b - i] * g


# ---------- sons ----------
def vibracao(d):
    t = tt(d)
    zumbido = np.sign(np.sin(2 * np.pi * 172 * t)) * 0.5 + np.sin(2 * np.pi * 344 * t) * 0.3
    chocalho = R.standard_normal(len(t)) * (0.5 + 0.5 * np.sin(2 * np.pi * 86 * t))
    x = lp((zumbido + chocalho * 0.4).astype(np.float32), 1800)
    e = np.minimum(1, t / 0.02) * np.minimum(1, (d - t) / 0.03)
    return x * e * 0.35


def golpe():
    t = tt(0.9)
    x = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) * g for f, k, g in [(78, 18, 1), (128, 26, 0.7), (205, 38, 0.4), (410, 60, 0.15)])
    clique = lp(R.standard_normal(len(t)).astype(np.float32), 1200) * np.exp(-t * 90) * 0.8
    return reverb((x + clique).astype(np.float32), 0.9, 0.35, 2000) * 0.9


def respiracao(d, ini_fase=0.0):
    t = tt(d)
    fase = np.sin((t + ini_fase) * 2.1)
    e = np.maximum(0, fase) ** 2 * 0.9 + np.maximum(0, -fase) ** 3 * 0.5
    ruido = R.standard_normal(len(t)).astype(np.float32)
    x = bp(ruido, 500, 2600) * e
    chiado = bp(R.standard_normal(len(t)).astype(np.float32), 2000, 3800) * 0.04  # linha telefônica
    return (x * 0.5 + chiado).astype(np.float32)


def clique(freq=2400, d=0.04):
    t = tt(d); return (np.sin(2 * np.pi * freq * t) * np.exp(-t * 160) + lp(R.standard_normal(len(t)).astype(np.float32), 4000) * np.exp(-t * 300) * 0.5) * 0.5


def tu_tu():
    out = np.zeros(int(1.6 * SR), np.float32)
    for k in range(3):
        t = tt(0.22); b = np.sin(2 * np.pi * 425 * t) * np.minimum(1, t / 0.01) * np.minimum(1, (0.22 - t) / 0.01)
        por(out, k * 0.45, bp(b.astype(np.float32), 300, 3400) * 0.25)
    return out


def coracao(bpm, d):
    out = np.zeros(int(d * SR), np.float32); p = 60 / bpm; t0 = 0
    while t0 < d - 0.5:
        for dt, g in [(0, 1), (0.16, 0.7)]:
            t = tt(0.35); b = np.sin(2 * np.pi * (48 + 20 * np.exp(-t * 30)) * t) * np.exp(-t * 14) * g
            por(out, t0 + dt, b.astype(np.float32))
        t0 += p
    return out


def macaneta():
    d = 3.0; t = tt(d); out = np.zeros(len(t), np.float32)
    # rangido: ruído ressonante com frequência subindo devagar
    rang = np.zeros(int(1.1 * SR), np.float32); tr = tt(1.1)
    f = 900 + 500 * tr / 1.1
    car = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 38 * tr)))
    rang[:] = bp((car * R.standard_normal(len(tr)) * 0.5 + car * 0.3).astype(np.float32), 600, 3000) * np.minimum(1, tr / 0.2)
    por(out, 0, rang, 0.35)
    for k in range(8):  # trepidação do trinco
        por(out, 1.1 + k * 0.06, clique(1800 + 300 * (k % 3), 0.05), 0.5)
    por(out, 1.7, clique(1300, 0.08), 0.9)  # volta com estalo
    return reverb(out, 0.7, 0.25)


def notificacao():
    t = tt(0.9)
    x = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in [(1318, 5), (1976, 7), (2637, 10)])
    return (x * 0.12).astype(np.float32)


def toque_sinistro(d):
    """Toque do celular em caixinha de música desafinada (a mesma melodia de sempre, mas errada)."""
    notas = [76, 79, 83, 82, 76, 79, 83, 86, 85]
    out = np.zeros(int(d * SR), np.float32); p = 0.22; t0 = 0; i = 0
    while t0 < d:
        n = notas[i % len(notas)] - 0.35 * (i % 2)  # desafinada
        f = 440 * 2 ** ((n - 69) / 12); t = tt(1.0)
        b = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.01 * t) + 0.15 * np.sin(2 * np.pi * f * 3.98 * t)) * np.exp(-t * 4)
        por(out, t0, b.astype(np.float32) * 0.12)
        t0 += p * (2 if i % len(notas) == len(notas) - 1 else 1); i += 1
    return reverb(out, 1.2, 0.35, 5000)


def impacto_grave(d=2.5):
    t = tt(d); f = 55 * np.exp(-t * 1.5) + 30
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.8)
    ruido = lp(R.standard_normal(len(t)).astype(np.float32), 400) * np.exp(-t * 6) * 0.6
    return reverb((x + ruido).astype(np.float32), 2.0, 0.3, 1500) * 0.9


def sopro(d=0.6, sobe=True):
    t = tt(d); u = t / d
    e = np.sin(np.pi * u) ** 2
    x = bp(R.standard_normal(len(t)).astype(np.float32), 300 + 1500 * (u if sobe else 1 - u).mean(), 4000) * e
    return x * 0.25


def acorde_final(d=6.0):
    t = tt(d); x = np.zeros(len(t))
    for f in [116.5, 123.5, 138.6, 174.6, 233.1]:
        for dt in (-0.6, 0.0, 0.7):
            x += (2 * ((f + dt) * t % 1) - 1) * 0.08
    e = np.minimum(1, t / 0.08) * np.exp(-t * 0.35)
    return reverb(lp(x.astype(np.float32), 1400) * e, 2.5, 0.4, 2500)


def subida(d):
    t = tt(d); u = t / d
    f = 60 + 500 * u ** 2
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 2 * 0.25 + bp(R.standard_normal(len(t)).astype(np.float32), 800, 6000) * u ** 3 * 0.4
    return x.astype(np.float32)


def drone(dur, tensao):
    """Trilha: grave pulsando, ar de quarto, tensão que cresce com a curva dada (0..1)."""
    t = tt(dur); k = np.interp(t, *zip(*tensao))
    x = (np.sin(2 * np.pi * 41 * t) * 0.5 + np.sin(2 * np.pi * 41.7 * t) * 0.4 + np.sin(2 * np.pi * 61.5 * t + np.sin(t * 0.3)) * 0.25)
    agudo = (np.sin(2 * np.pi * 1975 * t) * 0.02 + np.sin(2 * np.pi * 1987 * t) * 0.02) * k ** 2  # zumbido fino de tensão
    ar = lp(R.standard_normal(len(t)).astype(np.float32), 300) * 0.6
    return ((x * (0.25 + 0.75 * k) + ar * (0.4 + 0.6 * k)) * 0.22 + agudo).astype(np.float32)


def main():
    ep = Path(sys.argv[1]).resolve(); au = ep / "audio"
    L = json.loads((ep / "linha.json").read_text())
    F = {f["id"]: f for f in L["falas"]}; E = L["eventos"]
    dur = L["dur"]; n = int(dur * SR)
    fx = np.zeros(n, np.float32)

    toque2 = F["l10"]["palavras"][-1]["ini"] - 0.1
    # vibração do celular (mesmo padrão do motor: 1,0 s ligado, 0,6 s desligado)
    def vibrar(a, b):
        t0 = a
        while t0 < b:
            ini = t0 - (t0 % 1.6) if t0 == a else t0
            d = min(1.0, b - t0); por(fx, t0, vibracao(d), 0.9); t0 += 1.6
    vibrar(0.12, E["atender"])
    por(fx, E["atender"], clique(2000), 0.8)
    por(fx, E["atender"] + 0.15, respiracao(E["desligar"] - E["atender"] - 0.15), 0.55)
    por(fx, E["desligar"], clique(1500), 0.7); por(fx, E["desligar"] + 0.1, tu_tu(), 0.8)
    golpes = [E["golpes"] + 0.35, E["golpes"] + 1.0, E["golpes"] + 1.65]
    for g in golpes: por(fx, g, golpe(), 1.0)
    por(fx, golpes[0] + 0.02, impacto_grave(1.5), 0.35)
    por(fx, E["golpes"] + 2.2, coracao(68, E["macaneta"] + 2.5 - E["golpes"] - 2.2), 0.55)
    por(fx, E["macaneta"], macaneta(), 0.9)
    f9 = F["l9"]["ini"] - 0.3
    por(fx, f9 + 0.2, notificacao(), 1); por(fx, f9 + 1.4, notificacao(), 0.8)
    por(fx, toque2 - 0.02, impacto_grave(), 1.0)
    vibrar(toque2, dur)
    por(fx, toque2, toque_sinistro(dur - toque2), 0.9)
    esc = F["l11"]["ini"] - 0.18
    por(fx, esc - 1.6, subida(1.6), 0.7)
    por(fx, esc, acorde_final(dur - esc), 1.0)
    por(fx, esc, impacto_grave(2.0), 0.6)
    por(fx, dur - 1.25, golpe(), 0.8)  # um último golpe na porta, já sobre a tela final
    # sopro baixo em cada corte de tomada
    for f in L["falas"][1:]:
        por(fx, f["ini"] - 0.45, sopro(0.5), 0.5)

    tensao = [(0, 0.15), (F["l3"]["ini"], 0.25), (F["l5"]["ini"], 0.55), (E["desligar"], 0.3), (E["golpes"], 0.75),
              (F["l9"]["ini"], 0.6), (toque2, 0.9), (dur, 1.0)]
    tr = drone(dur, tensao)
    # respiro antes do toque final: o drone quase some 1 s antes (nunca zero)
    t = tt(dur); tr *= 1 - 0.75 * np.exp(-((t - (toque2 - 0.5)) / 0.45) ** 2)

    voz = ler(au / "voz.wav")[:n]; voz = np.pad(voz, (0, n - len(voz)))
    for f, g in (("l5", 2.6), ("l8", 1.4)):  # susurro e voz atrás da porta sobem para ficar inteligíveis
        a, b = int(F[f]["ini"] * SR), int(F[f]["fim"] * SR) + int(0.4 * SR); voz[a:b] *= g
    sala = lp(R.standard_normal(n).astype(np.float32), 900) * 0.004  # tom de sala por baixo de tudo

    # mixagem: voz na frente, efeitos e trilha abaixo, com ducking da trilha sob a voz
    fala = np.convolve(np.abs(voz), np.ones(2400) / 2400, "same"); duck = 1 - 0.45 * np.clip(fala / (fala.max() * 0.25), 0, 1)
    estereo = lambda x, w=0.0: np.vstack([x * (1 - w), x * (1 + w)])
    trilha = estereo(tr * duck + sala)
    duckfx = 1 - 0.65 * np.clip(fala / (fala.max() * 0.2), 0, 1)  # efeitos abaixam ~9 dB sob a voz
    fx = fx * duckfx
    efeitos = np.vstack([fx * 1.0, fx * 0.92])
    vozes = estereo(voz * 1.25)
    gravar(au / "trilha.wav", trilha); gravar(au / "efeitos.wav", efeitos * 0.8); gravar(au / "voz-final.wav", vozes)
    gravar(au / "mix-bruto.wav", (vozes + efeitos * 0.8 + trilha) * 0.7)
    # loudness para redes: -14 LUFS, pico -1,5 dBTP
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(au / "mix-bruto.wav"),
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), str(au / "mix.wav")], check=True)
    print("som pronto:", au / "mix.wav")


if __name__ == "__main__":
    main()
