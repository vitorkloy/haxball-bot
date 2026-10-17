# IA do bot e como retreinar

## Como a IA decide (src/ai.js)

A IA trabalha num referencial em que o próprio time sempre ataca para +x (o time azul é espelhado)
e, a cada decisão, prevê a trajetória da bola (amortecimento 0.99, quiques nas paredes, na linha de
fundo e nas traves) por `predictTicks` ticks. Para cada jogador calcula o **tempo até a interceptação**
(primeiro ponto da trajetória que ele alcança a tempo, com aceleração 0.1 e amortecimento 0.96 do Haxball).

Papéis / estados:

- **INTERCEPT (recuperação)**: a trajetória prevista entra no nosso gol → vai ao primeiro ponto
  alcançável antes da bola cruzar a linha e afasta.
- **SHOOT**: há linha livre (nenhum adversário a menos de `shotClearance` do segmento bola→alvo)
  e a distância é menor que `shootRange` (ou muito perto, `closeShot`). Mira numa das traves
  (`aimPost`), com preferência pela trave longe (`farPostBias`).
- **PASS (2v2)**: companheiro mais à frente (`passAhead`) com linha livre (`passClearance`).
- **ATTACK (condução)**: chega por trás da bola em relação ao alvo (ponto de aproximação
  `behindDist`), contorna a bola se estiver do lado errado (`aroundDist`), empurra a bola com toques
  curtos (`pushDist`) e desvia para o lado de um defensor que está à frente (`dribbleAvoid`, `sidestep`).
- **DEFEND**: se o adversário chega antes na bola (`threatMargin`) e a bola está antes da linha de
  pressão (`pressLine`):
  - **antecipação do chute**: adversário em alcance da bola (`threatReach`) → a linha provável do
    chute é adversário→bola; se ela acerta o nosso gol, o bot se coloca nessa linha (`blockDist`);
  - **marcação**: senão, fica na linha bola(prevista em `guardLead` ticks)–gol, a `defendDist` da bola;
  - **afastar**: com a bola perto do nosso gol e adversário chegando (`clearZone`, `clearMargin`),
    chuta para a frente e para a lateral.
- **POSITION (apoio, 2v2)**: o jogador que não chega primeiro na bola fica atrás dela (`supportDist`).

O chute só é apertado quando a bola está ao alcance (raio do jogador + raio da bola + `kickReach`)
e o ângulo entre jogador→bola e a direção desejada é menor que `kickAngle` (o chute do Haxball sai
na direção centro do jogador → centro da bola). O movimento usa "steering" (velocidade desejada
menos a atual, `steerGain`/`deadzone`) para não passar do ponto.

Dificuldade (`src/config.js` / `web/config.js`): `reactionTime` (ms entre decisões) e `noise`
(erro angular do alvo, em radianos).

## Simulador

`scripts/sim.js` usa `Room.sandbox` do node-haxball, ou seja, **a física real do Haxball** com o
estádio Classic, rodando sem tempo real (~10 mil ticks de partida em poucos ms).

```bash
npm run match -- --mode 1v1 --red nova --blue antiga --matches 10 --minutes 3
npm run match -- --mode 2v2 --red nova --blue nova
npm run eval -- --matches 200            # IA nova vs IA antiga (src/ai-legacy.js)
```

## Retreinar

```bash
npm run train -- --gens 20 --pop 16 --matches 8
```

O treino é uma estratégia evolutiva (1+λ): a cada geração cria `pop` variações dos parâmetros atuais
(dentro das faixas de `PARAM_SPACE` em `src/ai.js`), cada uma joga `matches` partidas contra o melhor
atual e contra a IA antiga (1v1 e algumas 2v2), em paralelo usando todos os núcleos. O melhor
candidato só é aceito se confirmar a vantagem em mais partidas. No fim, os parâmetros são salvos em
`src/ai-params.json`, `src/ai-params.js` e `web/ai-params.js` (usado pela página).

Depois de mudar `src/ai.js` ou `src/bot-controller.js`, rode `npm run sync-web` para copiar para `web/`.
