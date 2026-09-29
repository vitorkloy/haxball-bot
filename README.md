# 🤖 Bot de Haxball

Bot inteligente de Haxball com controle de bola, posicionamento tático, visão de jogo, passes e defesa. Desenvolvido para treinamento e uso em salas privadas.

## ⚠️ Aviso Importante

**Este bot é destinado APENAS para uso em salas privadas/treinamento pessoal.**

🚫 **NÃO USE EM SALAS PÚBLICAS RANQUEADAS** - Você será banido! O uso de bots em salas públicas viola os termos de serviço do Haxball e resultará em banimento permanente da sua conta.

✅ **Uso permitido:**
- Salas privadas com senha
- Treinamento pessoal
- Jogos contra amigos (com consentimento)
- Desenvolvimento e testes

❌ **Uso proibido:**
- Salas públicas
- Ranked/competitivo
- Qualquer sala sem permissão explícita do host

## 🎯 Características

- ✅ Controle inteligente de bola e drible
- ✅ Posicionamento tático adaptativo
- ✅ Predição de trajetória da bola
- ✅ Sistema de decisão baseado em estados
- ✅ Defesa e ataque coordenados
- ✅ Passes para companheiros de time
- ✅ Avaliação de chances de gol
- ✅ 4 níveis de dificuldade configuráveis
- ✅ Comandos de chat para controle

## 📋 Requisitos

- **Node.js** >= 18.0.0
- **npm** (geralmente vem com Node.js)
- **Token headless** do Haxball (veja [Como Obter o Token](#-como-obter-o-token))

## 🚀 Instalação

1. Clone o repositório:
```bash
git clone https://github.com/vitorkloy/haxball-bot.git
cd haxball-bot
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

4. Edite o arquivo `.env` e adicione seu token (veja próxima seção):
```bash
nano .env  # ou use seu editor preferido
```

## 🔑 Como Obter o Token

O token headless é necessário para criar salas. Siga estes passos:

1. Acesse https://www.haxball.com/headlesstoken
2. Complete o captcha
3. Copie o token gerado (formato: `thr1.XXXXXXXXX`)
4. Cole no arquivo `.env` na variável `HEADLESS_TOKEN`

⚠️ **Importante:**
- Tokens expiram periodicamente (geralmente após alguns dias/semanas)
- Você precisará gerar um novo token quando o atual expirar
- NUNCA compartilhe seu token publicamente
- NUNCA commite o arquivo `.env` no git

## 🎮 Como Usar

### Iniciar o Bot

Execute o comando:
```bash
npm start
```

Você verá algo como:
```
🤖 Iniciando Bot de Haxball...

🔑 Gerando autenticação...
🏠 Criando sala...
✅ Sala criada com sucesso!
👤 Bot: HaxBot 🤖
🎮 Dificuldade: medium

🔗 Link da sala: https://www.haxball.com/play?c=XXXXXX

📋 Comandos disponíveis no chat:
   !help - Mostra ajuda
   !start - Inicia o jogo
   !pause - Pausa o jogo
   !bot on/off - Liga/desliga o bot
   !teams - Move jogadores para os times

⏳ Aguardando jogadores...
```

### Entrar na Sala

1. Copie o link exibido no terminal
2. Abra em seu navegador
3. Entre na sala
4. Use os comandos de chat para controlar o bot

### Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `!help` | Mostra lista de comandos |
| `!start` | Inicia a partida |
| `!pause` | Pausa/despausa o jogo |
| `!stop` | Para o jogo atual |
| `!bot on` | Ativa o bot |
| `!bot off` | Desativa o bot |
| `!teams` | Distribui jogadores nos times automaticamente |
| `!status` | Mostra status do bot |

## ⚙️ Configuração

Todas as configurações são feitas no arquivo `.env`. Principais opções:

### Configurações do Bot
```bash
BOT_NAME=HaxBot              # Nome do bot
BOT_AVATAR=🤖                # Avatar (emoji)
BOT_DIFFICULTY=medium        # Dificuldade: easy, medium, hard, insane
BOT_REACTION_TIME=50         # Tempo de reação em ms
BOT_PREDICTION_TICKS=30      # Ticks de predição da bola
BOT_AGGRESSION=0.5           # Agressividade (0.0 - 1.0)
```

### Configurações da Sala
```bash
ROOM_NAME=Sala de Treino     # Nome da sala
ROOM_PASSWORD=               # Senha (deixe vazio para sem senha)
ROOM_MAX_PLAYERS=4           # Máximo de jogadores
ROOM_PUBLIC=false            # Aparecer na lista pública (mantenha false!)
```

### Níveis de Dificuldade

| Nível | Descrição | Características |
|-------|-----------|----------------|
| **easy** | Iniciante | Reação lenta, predição curta, menos preciso |
| **medium** | Intermediário | Reação moderada, bom posicionamento |
| **hard** | Avançado | Reação rápida, predição longa, agressivo |
| **insane** | Expert | Reação instantânea, predição máxima, joga perfeitamente |

## 🧪 Testes

Execute os testes para verificar se tudo está funcionando:

```bash
# Todos os testes
npm test

# Apenas testes unitários
npm run test:unit

# Apenas testes end-to-end
npm run test:e2e
```

Saída esperada:
```
PASS src/__tests__/unit/physics.test.js
PASS src/__tests__/unit/ai.test.js
PASS src/__tests__/e2e/bot-integration.test.js

Test Suites: 3 passed, 3 total
Tests:       25 passed, 25 total
```

## 📊 Como o Bot Funciona

O bot utiliza um sistema de IA baseado em estados que analisa o jogo em tempo real:

1. **Análise do Estado**: A cada tick (60x por segundo), o bot analisa:
   - Posição e velocidade da bola
   - Posição de todos os jogadores
   - Distância aos gols
   - Companheiros e adversários

2. **Predição de Física**: Simula a trajetória da bola para prever onde ela estará

3. **Tomada de Decisão**: Escolhe uma ação baseada no estado:
   - **Interceptar**: Calcular ponto de interceptação e correr até lá
   - **Atacar**: Driblar em direção ao gol adversário
   - **Chutar**: Avaliar chance de gol e chutar
   - **Passar**: Encontrar melhor companheiro para passar
   - **Defender**: Posicionar entre bola e próprio gol

4. **Execução**: Converte a decisão em inputs de teclado (movimento + chute)

Para mais detalhes técnicos, veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## 🎯 Dicas de Uso

### Para Treinar Contra o Bot
1. Configure dificuldade `easy` ou `medium` no `.env`
2. Inicie o bot com `npm start`
3. Entre na sala pelo link
4. Use `!teams` para distribuir nos times
5. Use `!start` para começar
6. Jogue normalmente!

### Para Assistir Bot vs Bot
1. Configure o bot como acima
2. Entre na sala mas fique como espectador
3. Use `!start` - o bot jogará sozinho
4. Observe as estratégias e decisões

### Para Desenvolver/Testar
1. Modifique os parâmetros em `.env`
2. Reinicie o bot
3. Teste diferentes configurações de dificuldade
4. Use `!status` para ver o estado interno do bot
5. Execute `npm test` após mudanças no código

## 🐛 Solução de Problemas

### "Erro ao criar sala: invalid token"
- Seu token expirou ou é inválido
- Gere um novo em https://www.haxball.com/headlesstoken
- Atualize a variável `HEADLESS_TOKEN` no `.env`

### "HEADLESS_TOKEN não configurado"
- Você não configurou o token no arquivo `.env`
- Copie `.env.example` para `.env` e adicione o token

### Bot não se move
- Verifique se o jogo foi iniciado com `!start`
- Verifique se o bot está ativo: use `!bot on`
- Verifique se há jogadores em campo (mínimo 2)

### Bot joga muito mal/bem
- Ajuste a dificuldade em `.env` (easy, medium, hard, insane)
- Ajuste parâmetros individuais como `BOT_REACTION_TIME` e `BOT_AGGRESSION`

### Erros de instalação
```bash
# Limpe cache e reinstale
rm -rf node_modules package-lock.json
npm install
```

### Node.js muito antigo
```bash
# Verifique sua versão
node --version

# Atualize se for < 18.0.0
# Visite https://nodejs.org/ para baixar a versão mais recente
```

## 📚 Documentação Adicional

- [Arquitetura Técnica](docs/ARQUITETURA.md) - Detalhes de implementação, diagramas, estratégias de IA
- [API do node-haxball](https://github.com/wxyz-abcd/node-haxball) - Biblioteca usada para integração

## 🤝 Contribuindo

Contribuições são bem-vindas! Áreas de interesse:

- Melhoria da IA (novas estratégias, melhor posicionamento)
- Modo goleiro especializado
- Cálculo de bank shots (ricochetes)
- Sistema de memória/aprendizado
- Otimização de performance
- Mais testes e cobertura

Para contribuir:
1. Fork o repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Add: nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📝 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## 🙏 Agradecimentos

- [wxyz-abcd/node-haxball](https://github.com/wxyz-abcd/node-haxball) - Biblioteca fundamental para integração
- Comunidade Haxball - Por manter o jogo vivo e criar ferramentas incríveis
- Basro - Criador original do Haxball

## 📧 Contato

Para dúvidas, sugestões ou reportar problemas:
- Abra uma [Issue](https://github.com/vitorkloy/haxball-bot/issues)
- Pull Requests são sempre bem-vindos!

---

**Desenvolvido por Vitor Kloy** | **Use com responsabilidade** 🤖⚽
