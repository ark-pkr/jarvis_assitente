# Histórico de versões

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
