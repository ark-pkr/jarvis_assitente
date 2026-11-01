# Histórico de versões

## 1.4.1

**Velocidade**
- Perguntas simples: a primeira palavra do modelo caiu de cerca de 3,5 s para menos de 1 s.
- Cada pedido carrega só as ferramentas do assunto, em vez de todas, e usa um modelo mais leve; se algo faltar, o JARVIS abre o resto sozinho.
- A voz neural toca enquanto é gerada, com o primeiro som em cerca de 1 s em vez de 3 a 6 s, mantendo o tom em qualquer velocidade.
- A data e a hora acompanham cada pedido, sem consultar ferramenta.

## 1.4.0

**Presença**
- A esfera mostra o estado da conversa: encolhe e acompanha a voz ao ouvir, corre sinais ao pensar, varre as órbitas ao usar uma ferramenta e solta ondas ao falar. Agora obedece aos pedidos de cor.
- Cumprimento ao iniciar, com lembretes, tarefas, próximo passo e clima uma vez por dia, montado localmente, sem chamar o modelo.
- Abertura completa só na primeira vez; as seguintes levam cerca de 3 segundos em vez de 10.
- Opções “ativar sozinho ao abrir” e “bater palma para ativar” no aplicativo, ambas desligadas por padrão.
- Atalho global, Ctrl+Alt+J por padrão, e mini esfera flutuante enquanto a janela não está em foco.
- Confirmações trazem a janela de volta sozinhas e a devolvem como estava.

**Novos comandos**
- “Olha minha tela”: captura com confirmação a cada vez, sem a janela do JARVIS na frente.
- Clima pelo Open-Meteo, teclas de mídia e volume do Windows.

**Privacidade**
- Palavra de ativação local com Porcupine: com uma chave Picovoice, o que não vem depois de “Jarvis” não sai do computador, e dizer “Jarvis” interrompe uma resposta.

**Acabamento**
- Corrigidas sobreposições na tela principal, no boot e no HELIOS, que agora começa com o painel recolhido e entrega título e status à interface.
- Boot em português e dourado no modo Assistente, com etapas reais no lugar do texto inventado.
- Sugestões de comando visíveis ao iniciar e legenda ao vivo na tela, que nunca aparecia.
- Mensagens de erro e guia de gestos em português.
- `JARVIS_BRIDGE_PORT` passou a funcionar: a política de segurança da página seguia presa à porta 8787.

## 1.3.0

**Privacidade e segurança**
- O modo privacidade deixou de enviar registros pessoais ao modelo.
- Abrir uma URL que não veio do pedido nem da pesquisa passa a pedir confirmação.
- O serviço local escuta sempre em `127.0.0.1`.
- Dependências atualizadas, sem vulnerabilidades conhecidas em produção. O motor de voz Kokoro foi removido, o que reduz a interface de 68 MB para 46 MB.

**Velocidade e consumo**
- A primeira resposta não espera mais os servidores MCP externos, que conectam em paralelo.
- As instruções enviadas à IA agora variam por modo e assunto, com cerca de 8 mil caracteres em vez de 19 mil em uma pergunta simples.
- Cada turno registra tokens e tempos em `metrics.jsonl`, sem conteúdo.
- Pedidos como “continue” passam a aproveitar os resultados recentes das ferramentas.

**Manutenção**
- `npm test`, CI no Windows e falhas de ferramentas registradas com o motivo real.
- Os iniciadores `.ps1` foram removidos: o aplicativo é o caminho de uso, e `npm start` fica para desenvolvimento.
- Documentação reunida no README e neste histórico.

## 1.2.2

Reator HELIOS cinematográfico integrado, com controles de cor, brilho, velocidade, camadas, modo cinema e qualidade automática. Ele acompanha a fase e o áudio que o JARVIS já captura e aceita comandos de voz.

## 1.2.1

Esfera neural dourada em Canvas 2D no modo visual leve, com resposta à voz. Pausa quando a janela fica oculta e respeita o movimento reduzido do sistema.

## 1.2.0

Atalhos na Central para planejar projetos, bloco de foco, flashcards, revisão de textos, roteiros de apresentação e resumo de e-mails. Perfis de rotina Pessoal, Trabalho, Estudos e Descanso. Lembretes por contexto do aplicativo ativo. Modo privacidade.

## 1.1.0

Artigos pesquisados e com fontes, exibidos em uma lâmina de leitura. Conversa mais natural, com detalhe ajustado ao pedido.

## 1.0.9

Respostas em fluxo, faladas frase a frase. Confirmação breve quando a resposta demora mais de 650 ms. Mais raciocínio automático em pesquisas e análises. Comandos “resposta rápida” e “investigue melhor”. Pedido de repetição só do trecho incerto da transcrição.

## 1.0.8

Proteção de voz local com Picovoice. Prévia de organização de arquivos por projeto, com justificativas, confirmação e desfazer.

## 1.0.7

Atalho “Começar meu dia”, com tarefas, lembretes e notícias dos assuntos configurados. Pesquisa com fontes clicáveis e busca em pastas autorizadas.

## 1.0.3

Seletor Assistente, Professor e Desenvolvedor. Novo visual com núcleo vetorial, anéis segmentados e painéis leves.

## 1.0.2

Captura com pré-roll de 650 ms, WAV mono de 16 kHz, calibração de ruído e trechos de até 30 s. Transcrição pelo Gemini com vocabulário de programação. Seleção do microfone de entrada. Relógio real de Brasília.
