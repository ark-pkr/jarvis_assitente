# J.A.R.V.I.S.

Assistente pessoal por voz para Windows, em português do Brasil, com interface holográfica. Conversa, pesquisa na web, dá aulas a partir dos seus PDFs, escreve no Word, cria e revisa projetos e organiza arquivos. O cérebro é a API Gemini; toda ação que muda algo pede sua confirmação na tela, exceto música e volume, que seriam inúteis com uma pergunta na frente.

O histórico de cada versão está em [CHANGELOG.md](CHANGELOG.md).

## Instalar e usar

1. Execute `release/JARVIS-Setup-<versão>-x64.exe`. Ele instala para o seu usuário e não exige Node, npm nem permissão de administrador.
2. Crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey). A API tem cotas e pode exigir faturamento próprio.
3. Abra o JARVIS e informe a chave em **Histórico e ajustes → Aplicativo**. Ela é criptografada pelo Windows para a sua conta e nunca volta para a interface.
4. Clique em **Iniciar JARVIS**, permita o microfone e fale.

Fechar a janela (o **X**) encerra o JARVIS por completo, inclusive o mini JARVIS, igual a **Sair do JARVIS** na bandeja. Para deixá-lo por perto sem a janela na frente, minimize. A inicialização com o Windows pode ser ligada ou desligada em **Aplicativo**.

O instalador ainda não tem assinatura digital, então o Windows pode mostrar um aviso de aplicativo desconhecido.

**Atualização automática.** O JARVIS procura versões novas no GitHub ao abrir e a cada hora. A nova versão é baixada em segundo plano e instalada quando você fecha o JARVIS, então ele nunca reinicia no meio de uma conversa. A instalação leva cerca de 1 minuto, sem nada na tela: se você abrir o JARVIS antes, ele avisa que está sendo atualizado. Depois de atualizar, uma notificação conta o que mudou; a lista fica também em **O que mudou nesta versão**, na bandeja. Para instalar na hora, use **Reiniciar e atualizar** no menu da bandeja.

Requisitos opcionais: Chrome para navegar e pesquisar, Word e VS Code para as integrações, Docker Desktop para executar comandos de projetos.

### Conversar

| Comando | Efeito |
|---|---|
| Fale diretamente | A entrada por voz fica ativa, sem tempo limite |
| **“Oi Jarvis”** ou **Espaço** | Reativa o assistente em espera |
| **“Jarvis, pare”** ou **Espaço** | Interrompe uma resposta |
| **Esc** | Coloca em espera |
| **V** | Alterna a voz |
| **T** | Testa o som |
| **D** | Abre o painel de diagnóstico |
| **Ctrl+Alt+J** | Chama o JARVIS de dentro de qualquer programa (troque em **Aplicativo**) |

Ao iniciar, ele cumprimenta; uma vez por dia, o cumprimento traz lembretes, tarefas, o próximo passo e o clima, se houver cidade na **Central**. A abertura completa só toca na primeira vez, e **Áudio** tem a opção de repeti-la sempre.

Ele só atende quando ouve **“Jarvis”**, então conversas no ambiente não viram pedidos. Para ter 15 segundos depois de cada resposta sem repetir o nome, ligue a opção em **Histórico e ajustes → Áudio**. Diga **“resposta rápida”** ou **“investigue melhor”** para escolher o ritmo daquele pedido.

## O que o JARVIS faz

**Sempre por perto.** Em **Aplicativo** você encontra as opções abaixo. As duas primeiras vêm desligadas porque abrem o microfone sem ninguém clicar.

- **Ativar sozinho ao abrir:** liga sem clique. Ao entrar no Windows, sobe em segundo plano, com a janela fechada.
- **Bater palma para ativar:** o microfone fica aberto na tela inicial só para medir o som. Nada sai do computador até ele ligar.
- **Mini JARVIS:** quando a janela não está em foco, um pequeno buraco negro no canto mostra o que ele está fazendo. Clique nela para abrir a janela.
- **Atalho global:** funciona em qualquer programa.

**Palavra de ativação no computador.** Sem isso, tudo que o microfone capta vai ao Gemini para saber se você chamou o JARVIS. Com uma chave gratuita do [Picovoice](https://console.picovoice.ai/) em **Aplicativo**, ou a mesma da proteção de voz, “Jarvis” é detectado localmente e só o que vier depois sai do computador. Durante uma resposta, dizer “Jarvis” também o interrompe.

**Olhar a tela.** Diga “olha minha tela, que erro é esse?”. Cada captura pede sua confirmação e mostra o motivo. A janela do JARVIS sai da frente, a imagem da tela onde está o cursor vai ao Gemini e não fica salva. Só funciona no aplicativo. Feche antes o que não quiser mostrar.

**Contas e datas exatas.** Somas, porcentagens, juros, troco, médias e contas de calendário são feitas por uma calculadora, não pelo modelo: “quanto é 15% de 230?”, “que dia cai daqui a 45 dias?”, “quantos dias úteis até 25/12?”.

**Áudios e vídeos.** Com o arquivo numa pasta autorizada, diga “resume esse áudio” ou “o que foi decidido nessa gravação?”. Ele transcreve, resume, lista tarefas citadas e responde perguntas sobre o conteúdo. Aceita MP3, M4A, OGG/OPUS (áudio do WhatsApp), WAV, MP4, MOV e WEBM, até 150 MB. O arquivo vai ao Gemini e é apagado de lá logo depois.

**Rotina falada.** “Todo dia às 7h me fala o clima e a agenda”: no horário, ele fala o resumo do dia, com clima (da cidade em **Central**), compromissos, lembretes, tarefas e próximo passo.

**Clima, música e volume.** Pergunte o clima de qualquer cidade (dados do [Open-Meteo](https://open-meteo.com/), sem chave) e diga a cidade padrão em **Central**. “Pausa a música”, “próxima faixa” e “volume em trinta” funcionam sem confirmação. As teclas de mídia agem no player que o Windows considerar ativo.

**Modos.** O seletor no topo alterna entre Assistente, Professor e Desenvolvedor. Em **Aprender** também há análise de sistemas, nível, tempo diário e objetivo.

**Aulas com PDF.** Em **Aprender → Aula com PDF**, informe a pasta, o arquivo, o assunto e as páginas. O tutor lê até cinco páginas por etapa (PDF de até 20 MB), cita a página de cada ideia, separa o que está na fonte dos exemplos que ele criou e mostra o conteúdo no Word ou no VS Code. Depois diga “continue a aula”. Se a extração ficar ilegível, ele avisa em vez de adivinhar.

**Pesquisa e artigos.** Pesquisa pelo Chrome dedicado, compara fontes e mostra links clicáveis. Peça “escreva um artigo sobre energia solar”: o texto completo aparece em uma lâmina de leitura, e a fala traz só um resumo.

**Projetos.** Em **Arquivos**, autorize uma pasta. O JARVIS só lê e altera pastas autorizadas, ignora nomes conhecidos de credenciais e dependências e recusa links ou caminhos fora delas. Ele não detecta segredos escritos dentro do código, então escolha o que compartilhar.

Para criar um projeto, ele pergunta o que faltar, escolhe a tecnologia, pede aprovação do plano e, em outra confirmação, cria exatamente os arquivos aprovados, sem sobrescrever nada. Toda edição mostra o antes e depois, e `project_changes` e `project_undo` permitem desfazer.

**Execução com Docker.** `project_execute` nunca roda comandos direto no Windows. Requer Docker Desktop e a imagem já baixada, e cada comando pede aprovação. A rede fica desligada por padrão. Docker e a pasta montada continuam sendo fronteiras de confiança, não um sandbox absoluto: não execute código em que você não confia.

```powershell
docker pull node:22-bookworm-slim
docker pull python:3.13-slim
docker pull alpine/git:2.47.2
docker pull mcr.microsoft.com/dotnet/sdk:10.0
docker pull golang:1.24-alpine
docker pull rust:1.87-slim
```

**Word.** Lista documentos abertos, cria, lê com autorização, acrescenta texto ao final e salva como `.docx` em pasta autorizada. Cada operação pede confirmação. Inserir texto não salva sozinho, e **Ctrl+Z** desfaz. Não edita Excel nem PowerPoint.

**Aplicativos.** Abre VS Code, Word, Excel e outros, sempre com confirmação. Você pode cadastrar outro `.exe` em **Computador**. Não aceita terminais, instaladores nem argumentos livres, e abrir um aplicativo não dá controle sobre a janela dele.

**Assistente diário.** Em **Central**, registre perfil, projetos, estudos, diário, tarefas, lembretes e rotinas. Diga “onde eu parei?” ou “começar meu dia”. Lembretes com data aparecem como notificação do Windows mesmo depois de **Sair do JARVIS**: ele deixa uma tarefa no Agendador do Windows (“JARVIS Lembrete”) que o abre escondido na bandeja na hora certa. Clicar na notificação abre a janela. Se o computador estiver desligado, o aviso vem assim que ele ligar. Com **Acordar o computador para lembretes**, em **Aplicativo** (desligado por padrão), o Windows também o tira da suspensão na hora do lembrete. Lembretes por contexto comparam o aplicativo em primeiro plano; vêm desligados e não enviam o título da janela à internet.

**Biblioteca.** Busca texto nas pastas autorizadas com referência de página ou linha. Cada busca dura até 12 segundos, com limite de 30 arquivos, três níveis e dez páginas por PDF.

$1
$1
**Memória que aprende.** Ele guarda fatos que você conta sobre si e um resumo de cada conversa, em um arquivo neste computador. Lê só o que você disse, nunca páginas ou arquivos, e ignora senhas e documentos. Em **Histórico e ajustes → Memória** você vê, apaga ou desliga tudo. O que ele aprende é contexto e nunca autoriza uma ação. No modo privacidade, nada é lido nem guardado.

**Busca nos seus arquivos.** Diga “indexa a pasta de estudos” e, depois, pergunte “onde falei sobre juros?”. Ele acha o trecho pelo significado e cita o arquivo e a página. O índice fica neste computador, mas o texto dos arquivos vai ao Google para gerá-lo, por isso cada pasta pede confirmação. Use só nas pastas autorizadas.

**Prova de inteligência.** `npm run test:intelligence -- nome` mede as respostas em uma lista de pedidos reais, com dados temporários, e compara com a última medição. Onde uma palavra não basta para corrigir, outro modelo julga a resposta por um critério escrito. Com `--vezes=3`, cada pedido roda três vezes, para separar melhora de sorte. Acrescente seus pedidos em `scripts/eval-cases.mjs`. Cada rodada consome a cota do Gemini.

**Lembretes e timer.** Na hora marcada aparece a notificação do Windows e ele fala em voz alta, assim que terminar o que estiver dizendo. Lembretes de mais de dez minutos atrás ficam só na notificação. Podem se repetir: “me lembra toda segunda às sete”. “Foco de 25 minutos” mostra a contagem na tela e começa a pausa sozinho. O JARVIS precisa estar aberto.

**Prova oral.** Diga “me testa em banco de dados”. Ele procura o assunto nas pastas indexadas, ou no arquivo que você indicar, e faz uma pergunta por vez. Responda falando; “não sei” mostra a resposta, e “chega” encerra. O que você errar volta depois de um dia, depois três, depois uma semana. As perguntas e a correção são feitas pelo Gemini, a partir do trecho do material enviado a ele.

**Modo aula.** Diga “modo aula” e confirme. A sala é ouvida pelo microfone e o JARVIS fica calado. Diga “Jarvis, encerrar aula” ou use o botão no topo da tela, e ele entrega resumo, datas de prova, destaques e tarefas. As aulas ficam em **Aprender**, e “me testa na última aula” faz uma prova sobre ela. A cada minuto o áudio vai ao Google para virar texto; o áudio não é salvo e o texto fica neste computador. Grave só com autorização de quem estiver falando. Sem a chave Picovoice, ele não ouve o próprio nome durante a aula: use o botão ou a tecla de atalho.

**Pesquisa em segundo plano.** Diga “pesquisa os melhores notebooks até 4 mil e me avisa”. Você continua conversando, e ele avisa em voz alta quando terminar. Peça “qual foi o resultado?”. Só faz buscas: não compra, não envia e não altera nada. Fechar o JARVIS interrompe a pesquisa.

**Personalidade.** Formal, equilibrado, bem-humorado ou sarcástico, em **Áudio** ou dizendo “fica mais formal”.

**Conversa natural.** Ele fala como no dia a dia, escolhe quando você pede uma opinião e ajusta o tom da voz neural ao momento. Quando você conta algo com data, como “tenho prova na sexta”, ele guarda e pergunta como foi depois. Essa lista fica em **Memória**, e nada de saúde, luto ou dinheiro entra nela. Ele também pode puxar assunto, no máximo uma vez por dia, entre 9h e 21h. Em **Áudio**, a opção **Interromper só falando** dispensa o nome para cortá-lo; use com fone, porque em caixa de som a própria voz dele pode se interromper.

**Google Agenda.** Para conectar uma vez:

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Calendar API**.
2. Em **Tela de consentimento**, configure o app como **Externo** e adicione o seu e-mail como usuário de teste.
3. Em **Credenciais**, crie um **ID do cliente OAuth** do tipo **App para computador**.
4. Em **Histórico e ajustes → Aplicativo**, cole o ID e a chave e clique em **Conectar a Google Agenda**.

Depois disso, diga “o que tenho amanhã?” ou “marca dentista sexta às 15h”. Ler não pede confirmação; criar, alterar e excluir pedem. Com o app em modo de teste, o Google pode pedir para conectar de novo depois de sete dias.

**Voz.** Escolha entre Charon, Orus, Kore e Puck em **Áudio**, com velocidade até 1,8×. Ajuste a pausa de captura se o fim das frases for cortado. A proteção de voz opcional usa uma chave pessoal do [Picovoice](https://console.picovoice.ai/) e roda localmente, mas não substitui autenticação de segurança.

**Visual.** Em **Áudio → Visual holográfico**, escolha a esfera neural (padrão, mais leve), o reator circular ou o reator HELIOS. Peça “mude o HELIOS para azul” ou “ative o modo cinema”. A esfera mostra o estado da conversa: encolhe e acompanha sua voz ao ouvir, corre sinais azulados ao pensar, varre as órbitas ao usar uma ferramenta e solta ondas ao falar. “Deixe a interface azul” muda a esfera também.

**VS Code.** Instale a extensão local com `powershell -File scripts/install-vscode-extension.ps1` e recarregue a janela. Os comandos **JARVIS: Compartilhar seleção** e **JARVIS: Compartilhar diagnósticos** pedem confirmação, e os dados expiram em 15 minutos. Só são lidos se os arquivos estiverem em uma pasta autorizada.

**Outros servidores MCP.** O JARVIS lê `~/.claude.json`, se existir, com suporte a stdio, HTTP e SSE. Ações de servidores externos ficam bloqueadas até iniciar com `npm start -- --writes`.

## Visual

**Câmera viva**, **estrelas que reagem à voz**, **planetas em órbita**, **visual que acompanha a hora do dia** e **sons de interface** podem ser ligados ou desligados em **Áudio**. O **modo cinema** deixa só o buraco negro e a legenda em tela cheia: use a tecla **C**, o botão em **Áudio** ou diga “modo cinema”, e saia com **C** ou **Esc**. Com a janela principal fora de vista, um pequeno buraco negro fica no canto da tela mostrando o estado; clique nele para voltar.

## Privacidade e segurança

- **O que sai do computador:** sua fala vai ao Gemini para transcrição, ou só o que vier depois de “Jarvis” com a detecção local ligada. A imagem da tela vai quando você autoriza. Pedidos, as últimas 40 mensagens da conversa, suas preferências, até oito registros de perfil, projeto e estudo e os arquivos lidos também vão ao Gemini. Excluir dados locais não apaga registros mantidos pelo provedor.
- **Modo privacidade:** interrompe o microfone, não envia memória, registros nem histórico, não grava novas conversas e desliga pesquisa web e integrações remotas naquele pedido. Pedidos digitados ainda usam a IA.
- **Serviço local:** escuta somente em `127.0.0.1`. No aplicativo, cada sessão tem um token próprio.
- **Navegador:** o JARVIS usa um Chrome com perfil próprio, que não acessa suas abas pessoais. Senhas são digitadas por você. Clicar e preencher sempre pedem confirmação. Abrir uma URL que não veio do seu pedido nem da pesquisa também pede, para que uma página não induza o envio de dados a outro site.
- **Risco conhecido:** imagens e vídeos em painéis são buscados pelo serviço local sem confirmação. Uma página maliciosa poderia induzir a IA a exibir uma imagem cujo endereço carrega dados. Tenha cautela ao pesquisar em sites desconhecidos com páginas logadas abertas.
- **Dados locais:** ficam em `%APPDATA%\JARVIS`. Desinstalar não remove esses dados, seus documentos nem seus projetos.
- **Backup:** uma cópia automática por semana, e outra quando você pedir em **Memória**, vai para `Documentos\JARVIS Backups`. O arquivo não tem senha e contém conversas, memória e aulas; não contém chaves nem logins. Projetos gerados e o perfil do Chrome ficam de fora. Se Documentos sincroniza com a nuvem, as cópias vão junto.

## Problemas comuns

- **Não ouve você:** pressione **D** e confira “transcription failures” e “error”. Verifique a entrada em **Áudio → Microfone de entrada** e **Configurações do Windows → Privacidade e segurança → Microfone**.
- **Limite de uso:** a presença da chave não garante cota. Falhas reais aparecem ao enviar um pedido.
- **Voz muda de repente:** a cota de voz neural acabou. Frases curtas já faladas continuam com a voz neural, e o resto usa a voz do Windows até a cota voltar.
- **Logs:** ficam em `%APPDATA%\JARVIS\desktop.log`. Para relatar um problema, use **Conexões → Copiar diagnóstico**.
- **Consumo:** cada turno grava tokens e tempos, sem conteúdo, em `%APPDATA%\JARVIS\dados\metrics.jsonl`.
- **Respostas lentas:** `npm run metrics` mostra quanto ele demora até a primeira palavra e, nas respostas lentas, onde o tempo foi: no modelo, nas ferramentas ou esperando sua aprovação.

## Desenvolvimento

Requer Node 22 ou mais recente.

```powershell
npm install
npm run setup      # confere o ambiente
npm start          # serviço e interface em http://localhost:5173
```

Crie `.env.local` a partir de `.env.example` e preencha `GEMINI_API_KEY`, sem prefixo `VITE_`. Use `npm start` só para desenvolver. Para usar o JARVIS no dia a dia, instale o aplicativo: as duas formas ao mesmo tempo significam dois assistentes ouvindo.

```text
navegador ou Electron  ⇄  bridge/server.mjs (WebSocket e HTTP em 127.0.0.1)
  voz, interface             ├─ gemini.mjs    conversa e ferramentas
                             ├─ prompt.mjs    instruções por modo e assunto
                             ├─ policy.mjs    o que cada ferramenta pode fazer
                             ├─ browser.mjs   Chrome dedicado
                             ├─ daily.mjs     clima, música e volume
                             ├─ briefing.mjs  cumprimento ao iniciar
                             └─ media-routes / speech-routes
```

| Comando | Faz |
|---|---|
| `npm test` | Testes offline (precisa do Chrome instalado) |
| `npm run lint` | Lint |
| `npm run build` | Tipos e build da interface |
| `npm run test:ui`, `test:voice`, `test:assistant-ui` e outros `test:*` | Verificações com o app aberto; alguns consomem a API |
| `npm run test:presence` | Ativação sozinho, atalho, mini esfera e captura de tela no aplicativo real, sem usar a API |
| `npm run desktop:dist` | Gera o instalador em `release/` |
| `npm run desktop:release` | Gera o instalador e publica no GitHub Releases, de onde a atualização automática baixa. Antes, uma vez só, guarde o token (clássico, com `public_repo`) com `npm run release:token`: ele fica criptografado pelo Windows fora do projeto, e o JARVIS nunca o vê. Só publica com testes passando, sem mudanças pendentes e com o commit na `main` do GitHub. Se algo falhar no meio, sobra só um rascunho; é só rodar de novo |

| Variável | Padrão | Efeito |
|---|---|---|
| `JARVIS_PROVIDER` | `gemini` | `gemini` ou `claude` |
| `JARVIS_MODEL` | `gemini-3.5-flash` | Modelo de conversa |
| `JARVIS_LIGHT_MODEL` | `gemini-3.5-flash-lite` | Modelo das perguntas simples, que não usam ferramentas |
| `JARVIS_LIVE_ASR_MODEL` | `gemini-3.5-transcribe-live` | Modelo que transcreve enquanto você fala |
| `JARVIS_TTS_MODEL` | `gemini-3.1-flash-tts-preview` | Modelo de voz |
| `JARVIS_EFFORT` | `high` | Esforço de raciocínio no provedor Claude |
| `JARVIS_BRIDGE_PORT` | `8787` | Porta do serviço |
| `JARVIS_ALLOWED_ORIGINS` | origens locais | Origens adicionais do WebSocket |
| `JARVIS_FILE_ROOTS` | pasta pessoal e temporária | Raízes extras para imagens locais |
| `JARVIS_CHROME_PATH` | detectado | Caminho do Chrome |
| `JARVIS_PRICE_INPUT`, `JARVIS_PRICE_OUTPUT` | não definido | USD por milhão de tokens, para calcular custo por turno |
| `ELEVENLABS_API_KEY`, `JARVIS_VOICE_ID` | não definido | Voz e transcrição ElevenLabs |

O provedor `claude` usa o Claude Agent SDK e a sua sessão do Claude Code. Defina `JARVIS_PROVIDER=claude` e remova `JARVIS_MODEL`.

## Licença

MIT. O áudio em `public/audio/` acompanha o projeto para demonstração; se for comercializar algo baseado nele, a liberação desses direitos é sua responsabilidade. O SDK e o modelo Picovoice são distribuídos sob a [licença Apache 2.0](licenses/PICOVOICE-APACHE-2.0.txt).
