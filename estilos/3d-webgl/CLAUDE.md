# 3D WebGL

Curta 3D feito só em código (three.js no Chromium headless, sem Blender): cena montada em primitivas e texturas pintadas em canvas, luz com sombra, profundidade de campo, bloom, aberração cromática e grão; legenda palavra por palavra por cima, em 1080 de largura.

> Neste repositório o motor foi refeito do zero no episódio 003 (os 001 e 002 da tabela do estúdio não estavam aqui). Se os originais voltarem, comparar antes de juntar.

## Decisões

- **Formatos:** 9:16 testado (003); 16:9 e 1:1 a validar no motor novo (as câmeras usam `RW/RH`, a legenda é centralizada).
- **Render:** o 3D sai em 2/3 da resolução (`?q=0.6667`, 720×1280) e é ampliado no canvas 2D, onde texto e grão são desenhados em 1080×1920. ~0,8 s por quadro no SwiftShader; `--partes 3` divide entre 3 navegadores.
- **Voz:** Fish, uma voz por personagem no `roteiro.json` (`vozes`). Direção entre colchetes em inglês no começo da fala (`[whispering]`, `[scared, whispering]`) funciona no `s2.1-pro-free` e não é lida em voz alta (conferido com o transcritor).
- **Legenda:** tempos por palavra do faster-whisper (`small`, CPU) sobre cada fala; se o número de palavras não bater (números viram dígitos), distribui por caracteres dentro do trecho ouvido. Anton em caixa alta; `destaque` em vermelho; sussurro e voz atrás da porta em Special Elite.
- **Som:** tudo em `som.py`, preso aos eventos de `linha.json`. Efeitos abaixam ~9 dB sob a voz; trilha (drone) com ducking; mix em -14 LUFS, pico -1,5 dBTP; nunca silêncio digital (tom de sala por baixo).

## Arquivos

```
motor/pagina.html   importmap do three + fontes do @fontsource (node_modules local)
motor/cena.js       cena, câmeras por tomada (campo "tela" de cada fala), pós, legenda, sobreposições
motor/capturar.mjs  servidor local + Playwright; --still t1,t2 pasta para quadros soltos
narrar.py           falas no Fish (cache por fala), efeitos de voz, tempos por palavra -> linha.json + audio/voz.wav
som.py              efeitos, trilha e mix
fazer.sh            tudo junto, entrega em prontos/3d-webgl/<slug>/
```

Fluxo: `./fazer.sh episodios/<slug>`. Para mexer só na imagem: `node motor/capturar.mjs episodios/<slug> --still 5,20,40 /tmp/q`.

## Roteiro (`roteiro.json`)

Cada fala: `id`, `voz`, `texto`, `tela` (nome da tomada no `cena.js`), `destaque`, `antes`/`depois` (respiro em s), `direcao`, `sussurro`, `atras_da_porta`, `evento_inicio`/`evento_fim` (nomes que o motor e o som leem). `escolhas` A/B para o fim interativo.

## Episódios

| Ep | Título | Formato | Estado |
|---|---|---|---|
| 001 | skill 3D | 16:9 | entregue (fora deste repo) |
| 002 | Motion Code | 16:9 | entregue (fora deste repo) |
| 003 | La llamada de las 3:17 (terror, espanhol, parte 1 com escolha A/B nos comentários) | 9:16 | entregue (17/11/2026), 53 s; voz "locutor k" + "Colombiana IA" no Fish |
