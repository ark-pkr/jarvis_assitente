# Histórico de versões

## 1.9.0

**Visual**
- Câmera viva: o buraco negro acompanha o mouse, com profundidade.
- Estrelas que reagem à voz: sua fala puxa as estrelas para o disco, e a dele empurra para fora.
- Planetas em órbita do buraco negro, com lente gravitacional: atrás dele viram arcos, na frente viram silhuetas. Sua fala os puxa para perto, a dele os afasta, e cada um brilha com uma parte da voz. Enquanto ele pensa, aceleram e pegam a cor do raciocínio.
- Sons de interface discretos em botões, painéis e troca de modo.
- Modo cinema: tela cheia só com o buraco negro e a legenda. Tecla **C**, botão em **Áudio** ou “modo cinema” por voz. Sai com **C** ou **Esc**.
- Mini JARVIS: a bolinha do canto agora é só um pequeno buraco negro animado, sem fundo. Cliques fora dele passam para o que estiver atrás.

Câmera, estrelas, planetas e sons podem ser desligados em **Áudio**.

## 1.8.0

**Seus dados protegidos**
- Backup de conversas, memória, aprendizados, lembretes, aulas, provas e ajustes em **Memória**, com uma cópia automática por semana em `Documentos\JARVIS Backups`. As cinco últimas automáticas são mantidas.
- Restaurar salva antes uma cópia do estado atual e recusa arquivos danificados. Chaves e logins não entram no backup.

**Voz**
- Frases curtas que ele já falou são guardadas e repetidas sem gastar cota, mesmo sem internet.
- Sem nenhuma cota, ele vai direto para a voz do Windows, sem esperar a recusa do Google a cada frase.
- Se a voz neural não começar em 10 segundos, a voz do Windows assume.

**Suporte**
- **Copiar diagnóstico**, em **Conexões**: versão, estado da voz e últimos erros, sem chaves, e-mails ou conversas.

## 1.7.0

**Mais humano**
- Fala do dia a dia: respostas mais curtas, reações como “Boa!” e “Eita”, e nada de “Certamente” ou “Posso ajudar em algo mais?”. A personalidade formal continua como mordomo.
- Opinião própria: pedindo para escolher, ele escolhe uma opção e diz o motivo e o principal problema dela.
- Voz com emoção: animada com boas notícias, acolhedora com as ruins, calma quando você está estressado e baixa de madrugada.
- Cumprimento que muda: nota quando você some por dias e quando ainda está de pé de madrugada.
- Retoma o que você contou: “tenho prova na sexta” vira “E aí, como foi a prova?” depois do dia. Veja e apague em **Memória**.
- Puxa assunto: no máximo uma vez por dia, entre 9h e 21h, quando você estiver por perto. Desligue em **Memória** ou dizendo “para de puxar assunto”.
- Interromper só falando, sem dizer o nome: opção em **Áudio**, desligada por padrão, para usar com fone.

**Segurança**
- Autorizar agora exige segurar o botão por quase um segundo. Um clique solto, mesmo sem querer, não autoriza nada. A confirmação por voz continua igual.

**Correções**
- Quando a cota da voz principal acabava, cada frase demorava cerca de 20 segundos. A voz reserva agora responde em cerca de 1 segundo e também muda de tom.
- A rota de voz sem streaming falhava com a voz reserva.

## 1.6.0

**Estudos**
- Prova oral: “me testa em banco de dados” faz uma pergunta por vez a partir dos seus arquivos ou de uma aula, corrige a resposta falada e traz de volta depois o que você errou.
- Modo aula: “modo aula” ouve em silêncio e, ao dizer “encerrar aula”, entrega resumo, datas de prova, destaques do professor e tarefas. O áudio não fica salvo.
- Timer: “foco de 25 minutos” conta na tela, avisa em voz alta e começa a pausa sozinho.
- Lembretes que se repetem: todo dia, dias úteis, toda semana ou todo mês.

**Assistente**
- Pesquisa em segundo plano: “pesquisa isso e me avisa” libera a conversa e ele avisa quando terminar. Só pesquisa, nunca compra, envia ou altera nada.
- Personalidade: formal, equilibrado, bem-humorado ou sarcástico, em **Áudio** ou por voz. O humor nunca aparece em erros, confirmações ou más notícias.

**Visual**
- O buraco negro agora tem emoções: azul e lento no foco, violeta na aula, ciano na prova, verde num acerto e vermelho num alerta.

**Correção**
- Ferramentas citadas pelo nome nas instruções podiam falhar com “ferramenta indisponível”.

## 1.5.0

**Mais inteligente**
- Aprende sozinho com as conversas: nome, estudos, projetos e preferências, sempre a partir do que você disse. Veja, corrija e apague em **Memória**.
- Retoma assuntos: guarda um resumo de cada conversa, e “o que decidimos ontem?” funciona.
- Aprende com correções, inclusive nomes que a transcrição errava.
- Busca por significado nos seus arquivos: indexe uma pasta e “onde falei sobre juros?” encontra “taxa de rendimento”, citando arquivo e página.
- Agenda proativa: o cumprimento traz os compromissos do dia e avisa quando dois batem no horário, e ele fala 15 minutos antes de cada um.
- “Resume isso”: pode entender “isso” pelo programa aberto. Desligado por padrão.
- Contas, lógica e análises vão para um modelo mais forte. Levam alguns segundos a mais e erram menos.
- Depois de uma ação, ele só afirma o que o resultado comprova, e não insiste depois de um “não”.
- Prova de inteligência: `npm run test:intelligence` mede a qualidade das respostas.

## 1.4.7

**Assistente**
- Pesquisa rápida: placar, preço, cotação e notícia do dia em poucas frases, com a busca do Google, sem abrir o navegador.
- Google Agenda: consultar, criar, alterar e excluir eventos por voz. Mudanças pedem confirmação. A conexão fica em **Aplicativo**.
- Lembretes falados: na hora marcada ele fala em voz alta, sem interromper uma resposta.

**Voz**
- Uma frase que não toca na voz principal agora vai para a voz do sistema, em vez de ficar muda.
- Depois do nome, “chega”, “tá bom”, “já entendi” e “obrigado” também interrompem.
- O botão **Autorizar** só responde 1,2 segundo depois que o cartão aparece, para um clique que já ia acontecer não autorizar nada.

**Visual**
- Céu novo atrás do buraco negro: nebulosa discreta e mais estrelas, curvadas pela gravidade.
- Painéis de vidro: o disco aparece desfocado por trás, com reflexo da sua luz.

## 1.4.6

**Confirmação por voz**
- Antes de uma ação sensível, o JARVIS lê o que vai fazer e pergunta se pode seguir. Responda “sim” ou “não”; o cartão com os detalhes e os botões continua na tela.
- “Não” sempre vence, e uma frase longa com “sim” no meio não autoriza nada.

**Removido**
- Controle por gestos: tecla G, mão na tela e o rastreamento pela câmera. A câmera continua disponível para o JARVIS olhar quando você pedir.

## 1.4.4

**Visual**
- O núcleo agora é um buraco negro calculado por traçado de raios na tela inteira: a luz é curvada pela gravidade de verdade, e o disco de gás fica mais brilhante do lado que gira na sua direção.
- A voz move a cena: os graves acendem o disco, os médios mandam ondas de luz e os agudos realçam o gás. Ao pensar, o disco esfria para azul; com ferramentas, fica verde.
- A nitidez se ajusta sozinha ao computador. Sem suporte, ou se a placa falhar, volta à esfera simples; a opção fica em Histórico e ajustes.

## 1.4.3

**Visual**
- A esfera virou um holograma de até 60 mil partículas, desenhado pela placa de vídeo, com núcleo de luz, filamentos internos e fagulhas saindo da superfície.
- O holograma reage às frequências da voz: os graves incham o corpo, os médios correm em ondas e os agudos acendem pontos.
- Cada estado tem sua própria animação: pensar cruza a esfera com frentes de luz azul e usar uma ferramenta a varre em verde.
- A qualidade se ajusta sozinha ao computador. Sem suporte, ou se a placa falhar, volta à esfera simples; a opção fica em Histórico e ajustes.

**Voz**
- Se a cota diária do modelo de voz acabar, o JARVIS passa sozinho para um modelo reserva em vez de cair na voz do Windows.

## 1.4.2

**Velocidade**
- A fala é transcrita enquanto você fala: o texto fica pronto em cerca de 0,4 s depois do fim da fala, em vez de 1,4 s. Se esse caminho falhar, o JARVIS usa a transcrição anterior sozinho.
- Um som curto confirma que ele entendeu, cerca de 1 s depois que você termina.
- Em pedidos naturalmente demorados, como clima, pesquisa e leitura da tela, uma frase curta toca logo depois da transcrição.

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
