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

### Drible (jogadas escolhidas pela posição e velocidade do defensor principal)

- **conduzir**: sem marcação na linha até o gol → carrega a bola com toques suaves do corpo (sem chute),
  bola um pouco à frente (`pushDist`), velocidade limitada (`carrySpeed`) quando há defensor por perto.
- **proteger**: defensor ao lado/atrás e perto (`shieldDist`) → leva a bola para longe dele, com o corpo
  entre a bola e o defensor (`shieldBlend` mistura "longe do defensor" com "rumo ao gol").
- **finta / mudança de ritmo**: defensor na frente e ainda longe (`engageDist`) → aproxima devagar
  (`slowSpeed`) alinhado como se fosse chutar...
- **corte**: ...e quando ele chega perto, muda de direção bruscamente para o lado livre (`cutSide`,
  `cutForward`) acelerando ao máximo.
- **autopasse**: defensor perto (`selfPassDist`) e vindo com tudo (`commitVel`) → toque curto no espaço
  ao lado/atrás dele (`selfPassLead`) e corre para pegar.

### Bola no pé: planejamento por lookahead (src/planner.js)

Desde o PR do lookahead, quando o bot está com a bola (a até `planDist` px do contato,
padrão 40, e com o corpo atrás/ao lado da bola) ele **não usa mais as jogadas fixas**
de drible. Em vez disso faz uma busca curta usando a física do Haxball — sem treino:

1. **Candidatos:** 9 direções (8 teclas + parado) × chutar ou não = 18 ações.
2. **Simulação:** cada ação é mantida por `plyA` = 5 ticks; depois, para as ações sem
   chute, testa-se a melhor continuação entre as 9 direções por mais `plyB` = 9 ticks
   (busca de 2 níveis, 18 × 9 rolagens por decisão, ~1 ms). O modelo usa os valores
   padrão da física: aceleração 0,1 (0,07 segurando o chute), amortecimento 0,96 do
   jogador e 0,99 da bola, raios 15/10, colisão jogador–bola com massas inversas 0,5/1
   e bCoef 0,5×0,5, chute de força 5 só quando a distância entre as bordas é < 4 px.
   O adversário é modelado correndo direto na bola.
3. **Avaliação escrita à mão** do estado final (`evaluate`, pesos em `DEFAULT_WEIGHTS`):
   - `progress`: quanto a bola avançou em direção ao gol;
   - `glue`: penaliza a bola longe do corpo (bola "colada");
   - `front`: bônus com a bola à frente do corpo (fácil conduzir e chutar);
   - `loose`: penaliza velocidade relativa bola–jogador (bola fugindo);
   - `race`: penaliza o adversário mais perto da bola do que nós (o corpo tem que
     ficar entre a bola e o defensor = proteção);
   - `pressure`/`safeDist`: penaliza a bola a menos de 40 px do defensor;
   - `lateral`: com o defensor à frente, bônus por tirar a bola da linha dele (empurrar
     para o lado oposto e trocar de lado quando ele se compromete);
   - `wall`: evita prender a bola na lateral;
   - `shot`: o chute só vale se a bola prevista entra no gol antes de qualquer adversário
     alcançá-la (chute de primeira/"apertar" a bola quando a chance aparece).
4. **Suavidade:** penalidade `keep` para trocar de tecla e `reverse` para inverter o
   sentido, e compromisso mínimo `holdMs` = 50 ms com a direção escolhida (exceto para
   chutar). A ação sai direto como teclas, sem o steering intermediário.

Fora da bola (aproximação, defesa, interceptação, apoio e passes no 2v2) a lógica
continua a mesma de antes, para não perder o que já funcionava. A versão anterior ao
lookahead está congelada em `scripts/baselines/ai-pr7.js` (+ `ai-params-pr7.js`) e é o
adversário padrão do `npm run eval`.

### Movimento suave

As teclas do Haxball são digitais (8 direções). Para não "tremer":
- **arrive**: em alvos de posição (defesa/apoio) a velocidade desejada cai perto do alvo (`arriveK`),
  então as teclas são soltas antes e o jogador desliza até parar;
- **posição prevista**: o alvo é visto a partir de onde o jogador estará em `lookahead` ticks;
- **histerese** por eixo (`deadzone` para apertar, `deadzone*hyst` para soltar) e **tempo mínimo**
  segurando uma direção (`holdMs`; inverter o sentido exige o tempo todo);
- parado perto do alvo (`nearDist`) não aperta nada.

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

## Métricas do simulador

- **Posse sob pressão:** segundos por partida em que só um time está com a bola colada
  (até 8 px do contato) e há um adversário a menos de 60 px da bola; **toques sob
  pressão** conta os contatos nessas condições. Substitui na prática a métrica de
  "dribles bem-sucedidos", que quase nunca dispara entre bots.

`npm run eval` mostra, além de vitórias e gols:
- **dribles bem-sucedidos por partida**: o jogador toca na bola com um defensor à frente (até 90 px,
  na faixa de 50 px) e, em até 2,5 s, volta a tocar na bola já depois do defensor sem que o adversário
  tenha tocado nela;
- **trocas de direção por segundo** (por jogador): quantas vezes as teclas de direção mudam — quanto
  menor, mais suave.

```bash
npm run eval -- --vs pr5 --matches 200        # contra a IA do PR #5 (scripts/baselines/)
npm run eval -- --vs pr5 --matches 100 --size 2
npm run eval -- --vs antiga                    # contra a primeira IA (src/ai-legacy.js)
```

## Retreinar: liga de self-play

```bash
npm run train            # 20 gerações
npm run train:loop       # contínuo, até Ctrl+C
npm run train:loop -- --minutes 480   # ex.: 8 horas
```

Como funciona (`scripts/train.js`):
- o **campeão** atual é `src/ai-params.json`; cada geração cria `--pop` variações dele;
- **triagem com parada antecipada**: cada candidato joga metade das partidas de triagem contra o campeão;
  se já está claramente pior (média + 1,64·erro padrão < 0), é descartado sem jogar o resto;
- **objetivo por partida** (candidato − adversário na mesma partida):
  `saldo de gols + 0,5·dribles − 0,05·trocas de direção/s` (pesos `--wDrib`, `--wKeys`);
- o melhor da triagem joga a **confirmação** (`--confirm` partidas 1v1 + 2v2) e só é **promovido** se
  `média − 1,64·erro padrão > 0` (≈95% de confiança) **e** não regride contra a IA do PR #5
  (≥48% dos pontos) nem contra os últimos campeões do **Hall da Fama**;
- cada promoção grava o checkpoint (`src/ai-params.json`, `src/ai-params.js`, `web/ai-params.js`),
  entra no Hall da Fama (`training/hall-of-fame.json`) e o log vai para `training/league-log.jsonl`
  (com a taxa de vitórias contra o campeão anterior). O campeão novo vira o adversário da próxima geração.

Ctrl+C para no fim da geração (o último checkpoint já está salvo).

### Deixar rodando mais tempo (ex.: a noite toda)

No PC ou num servidor (precisa de Node 18+; usa todos os núcleos):

```bash
git pull
npm ci
nohup npm run train:loop -- --minutes 600 > treino.log 2>&1 &   # 10 horas em segundo plano
tail -f treino.log                                              # acompanhar
```

De manhã, confira e publique:

```bash
npm run eval -- --vs pr5 --matches 200
npm test && npm run build
git checkout -b treino-noturno
git add src/ai-params.json src/ai-params.js web/ai-params.js training/
git commit -m "chore: parâmetros da IA após treino noturno"
git push -u origin treino-noturno    # e abra um PR
```

No Windows, use `npm run train:loop -- --minutes 600` num terminal que fique aberto.

### Opção com GitHub Actions (manual)

Dá para rodar a liga num runner do GitHub (até 6 h por job, 4 núcleos) com um workflow
`workflow_dispatch` que execute `npm ci && npm run train:loop -- --minutes 300` e abra um PR com os
arquivos alterados. Esse arquivo não foi incluído neste PR (o token usado não pode alterar workflows);
crie-o pela interface do GitHub se quiser.

Depois de mudar `src/ai.js` ou `src/bot-controller.js`, rode `npm run sync-web` para copiar para `web/`.

## Resultados do lookahead vs main (PR #7), simulador, dificuldade hard, partidas de 1 min

| Confronto | Partidas | V / E / D | Pontos | Gols | Posse sob pressão (nós x eles) |
|---|---|---|---|---|---|
| 1v1 (seed 424242) | 200 | 71 / 94 / 35 | 59,0% | 121 x 79 | 6,1 s x 10,3 s |
| 1v1 (seed 777) | 200 | 80 / 89 / 31 | 62,3% | 130 x 72 | 8,3 s x 9,3 s |
| 2v2 (seed 424242) | 100 | 26 / 50 / 24 | 51,0% | 46 x 42 | 9,7 s x 11,1 s |

Contra a IA do PR #5: 1v1, 100 partidas, 87,5% pontos (153 x 9).

Limitações conhecidas: o adversário no modelo só corre direto na bola; a busca não
considera companheiros (no 2v2 o planejador só entra sob pressão); o tempo de posse sob
pressão ficou menor que o do main (o bot solta/finaliza a bola mais cedo em vez de segurá-la).
