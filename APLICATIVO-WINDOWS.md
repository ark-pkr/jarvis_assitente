# JARVIS para Windows

O instalador de 64 bits fica em `release/JARVIS-Setup-1.2.2-x64.exe`. Ele contém o runtime Electron, a interface compilada e o serviço local; não exige Node, npm ou Chrome para conversar. A função de navegação continua usando o Chrome instalado. Word e VS Code precisam estar instalados para suas respectivas integrações.

## Reator HELIOS integrado 1.2.2

Em **Histórico e ajustes → Áudio → Visual holográfico**, escolha o reator HELIOS cinematográfico. Ele acompanha a fase e o nível de áudio que o JARVIS já captura, sem pedir uma segunda permissão de microfone. Os controles HELIOS permitem pausar, escolher cores, ajustar brilho, velocidade, separação das camadas, modo cinema e qualidade gráfica. A qualidade automática reduz os efeitos em computadores mais modestos. A abertura cinematográfica e as demais preferências podem ser ajustadas e são lembradas neste perfil do navegador/aplicativo.

Durante uma conversa, peça por voz ações como **“mude o HELIOS para azul”**, **“pause o reator”**, **“ative o modo cinema”** ou **“reproduza a abertura do HELIOS”**. O HELIOS é opcional; a esfera neural e o reator circular continuam disponíveis.

## Esfera neural dourada 1.2.1

O modo visual leve agora usa uma esfera animada de pontos e conexões douradas, com brilho central e resposta à atividade de voz. Em **Histórico e ajustes → Áudio → Visual holográfico**, escolha **Esfera neural dourada** ou volte ao **Reator circular**. A esfera usa Canvas 2D, acompanha o movimento reduzido do sistema e pausa quando a janela fica oculta.

## Produtividade, estudo e privacidade 1.2.0

A Central agora oferece atalhos para planejar projetos, iniciar um bloco de foco de 25 minutos, criar flashcards, revisar textos, preparar roteiros de apresentação e resumir e-mails. Os recursos usam ferramentas e materiais autorizados que já estejam disponíveis; a IA não envia e-mails, substitui arquivos ou inventa a criação de uma apresentação. Ações persistentes continuam exigindo confirmação. Flashcards e simulados devem usar material escolhido pelo usuário e apresentar uma pergunta por vez.

Os perfis de rotina **Pessoal**, **Trabalho**, **Estudos** e **Descanso** adaptam prioridades e tom. A conexão, integrações e registros de atividade continuam consultáveis na interface. Se o JARVIS entender algo errado, corrija diretamente na conversa; ele deve aproveitar o contexto sem pedir que você repita tudo.

Em **Histórico e ajustes → Central**, um lembrete pode ser associado a uma palavra de contexto, como **Word**, **VS Code** ou o nome do projeto. No desktop Windows, a opção **Aplicativo → Ativar lembretes pelo aplicativo ativo** permite comparar esse contexto com o aplicativo/janela em primeiro plano. Vem desligada por padrão; quando ligada, consulta os dados localmente a cada 20 segundos e não grava nem envia o título da janela à internet. Um lembrete contextual dispara uma vez.

O **Modo privacidade**, na Central, interrompe o microfone, omite a memória e o histórico da conversa enviados à IA e deixa de gravar novas conversas localmente. Pedidos digitados ainda dependem do serviço de IA configurado. No modo privacidade, pesquisas web e integrações remotas ficam indisponíveis para aquela solicitação.

## Artigos e conversa natural 1.1.0

Peça para escrever um artigo por voz ou texto, por exemplo: **“Escreva um artigo sobre energia solar”**. O JARVIS usa público geral, tom claro e informativo e extensão média quando você não especifica preferências; só pergunta se faltar o tema ou outro requisito essencial. Em pedidos factuais, pesquisa fontes atuais quando a busca está disponível, compara fontes independentes e inclui links reais, distinguindo fatos, análise e incertezas. Ele não deve afirmar que pesquisou quando não conseguiu fazê-lo.

No aplicativo desktop, o artigo completo aparece em uma lâmina de leitura rolável, com título, seções e fontes clicáveis, enquanto a resposta falada resume o resultado. O modo direto apresenta o artigo formatado na resposta. Respostas simples continuam concisas; pedidos de artigos recebem automaticamente raciocínio detalhado. A conversa usa linguagem mais natural e ajusta o nível de detalhe ao pedido.

## Conversa mais ágil e contextual 1.0.9

As respostas são recebidas em fluxo e faladas frase a frase enquanto o restante é gerado. Se uma resposta falada demorar mais de 650 ms para começar, o JARVIS confirma brevemente que entendeu; a confirmação usa a voz local para não esperar a síntese neural. Pesquisas, comparações, pedidos com várias perguntas e análises longas recebem mais raciocínio automaticamente. Diga **“resposta rápida”** ou **“investigue melhor”** para escolher o ritmo do pedido atual. A preferência de respostas rápidas em **Histórico e ajustes → Áudio** vale para perguntas simples.

Quando a transcrição identifica exatamente um trecho incerto, o JARVIS pede que você repita somente essa parte. O pedido fica suspenso até a repetição, o trecho é encaixado na frase original e nada é executado antes disso. Se não for possível localizar a dúvida com segurança, o JARVIS solicita que repita o pedido completo. A identificação de voz local, quando ativada, ocorre antes do envio do áudio ao serviço de transcrição; a transcrição e as respostas ainda exigem conexão e podem falhar.

O modo direto também recebe as preferências salvas e o contexto recente da conversa. Em **Histórico e ajustes → Memória**, você pode consultar, corrigir, apagar ou desativar o salvamento. A memória pessoal só é usada como contexto e nunca autoriza uma ação. Tarefas e ações continuam mostrando progresso e resultados verificáveis; editar, abrir ou mover conteúdo exige as confirmações já existentes.

## Assistente diário 1.0.7

O atalho **Começar meu dia** resume compromissos, tarefas e lembretes registrados. Em **Histórico e ajustes → Central**, informe os assuntos desejados para incluir notícias atuais no briefing. A pesquisa usa a janela e o perfil dedicados do JARVIS, não as abas pessoais do Chrome; as fontes aparecem como links clicáveis. Sem assuntos configurados, não pesquisa notícias. Tarefas, rotinas, lembretes e memória continuam editáveis pela Central; confirme ações antes de alterar dados ou abrir aplicativos.

O assistente pode pesquisar na web, comparar informações e apresentar fontes, além de localizar materiais somente nas pastas autorizadas. Verifique divergências e atualidade nas páginas citadas; resultados de busca não garantem cobertura completa.

## Voz e organização 1.0.8

Em **Histórico e ajustes → Áudio → Proteção de voz**, configure uma chave pessoal do Picovoice e cadastre seu perfil em ambiente silencioso. O reconhecimento ocorre localmente; o áudio de cadastro não é guardado e somente falas reconhecidas são encaminhadas para transcrição. A chave e o perfil são protegidos pelo armazenamento seguro do Windows. A ativação é opcional; depois do cadastro, habilite **Aceitar comandos por voz somente após reconhecer meu perfil**. Ajuste a sensibilidade se sua voz for recusada. **Espaço** oferece ativação manual por pedido. A identificação de voz não é infalível nem substitui autenticação de segurança. A chave Picovoice é separada da chave Gemini e precisa ser obtida na [Picovoice Console](https://console.picovoice.ai/). O SDK e o modelo Picovoice usados nesta versão são distribuídos com a licença Apache 2.0, incluída no [instalador](./licenses/PICOVOICE-APACHE-2.0.txt).

Em **Histórico e ajustes → Arquivos → Prévia por projeto**, o JARVIS analisa a estrutura listada de uma pasta autorizada e sugere caminhos com justificativas. Revise a lista antes de pedir aplicação. Movimentos pedem confirmação, não sobrescrevem nem apagam arquivos e podem ser desfeitos em **Ver alterações para desfazer**. Arquivos ocultos, credenciais, dependências, links e itens ambíguos devem permanecer fora da proposta. A prévia por tipo ou data continua disponível.

## Visual e modos 1.0.3

O seletor no topo alterna entre Assistente, Professor e Desenvolvedor e atualiza o perfil enviado à IA. O visual usa núcleo vetorial azul, anéis segmentados e painéis leves, mantendo a preferência de movimento reduzido.

- **Assistente:** núcleo central, relógio real de Brasília, nível real do microfone, conexões, atalhos e última atividade.
- **Professor:** PDF autorizado ou explicação à esquerda; exemplos, prática e anotações à direita. Escolher material abre a configuração de aula. A prévia só aceita PDF de até 20 MB em raiz autorizada. Imagens/vídeos mantêm as janelas específicas quando solicitados.
- **Desenvolvedor:** rascunho de código com linhas, propostas de revisão e atividades verificáveis. Pode explicar/revisar o rascunho ou solicitar gravação e abertura no VS Code em pasta autorizada. A gravação passa pela confirmação e controle de versão das ferramentas existentes. Não adiciona um executor de terminal: código escrito não é apresentado como executado.

Rascunho e anotações usam `jarvis.studio.v1` no perfil da interface, respeitando a opção de salvar histórico/memória. Eles não são enviados à IA ao digitar; o código é enviado apenas ao usar um botão de explicação/revisão/aplicação. As telas compactas reorganizam os painéis verticalmente.

Validação visual: `npm run test:modes` com a prévia Vite ativa. PDF e isolamento: `npm run test:studio`. Integração nativa: `node scripts/check-studio-electron.mjs`, após gerar o aplicativo e criar um PDF de teste com `npm run test:lessons`.

## Captura e compreensão 1.0.2

A captura mantém 650 ms anteriores ao início detectado da fala e usa WAV mono de 16 kHz, filtros de frequência, calibração do ruído e sensibilidade para fala mais baixa. A pausa configurada em Áudio é respeitada (padrão: 0,8 s; mínimo efetivo: 0,65 s). Trechos podem durar até 30 s. O próprio áudio do JARVIS não é capturado enquanto ele responde.

A transcrição principal usa Gemini 3.5 Transcribe com idioma pt-BR e vocabulário de aplicativos e programação. A interação é enviada com store=false. Quando esse modelo não está disponível, há fallback para a compreensão de áudio do Gemini 3.8 Flash, preservando negações e rejeitando interpretações incertas. Na versão 1.0.2 não existia perfil local; a partir da 1.0.8, a proteção opcional descrita acima pode filtrar a voz antes de enviar o áudio para transcrição. Isso não é uma garantia de reconhecimento perfeito de todo ambiente ou sotaque.

Diga **“Jarvis, que horas são?”** para obter uma resposta direta, consultando o relógio real de Brasília. Não há confirmação da transcrição nem limite mínimo de palavras. Após uma resposta, há 15 s para uma continuação sem repetir o nome. Espaço permite iniciar ou interromper um pedido. Abrir aplicativos, editar arquivos e outras ações continuam com a confirmação específica da ferramenta, mostrando a operação concreta. O início por palmas continua desativado no aplicativo para evitar ativações por ruído.

Escolha a entrada correta em **Histórico e ajustes → Áudio → Microfone de entrada** e aplique a escolha. A qualidade também depende do ambiente e do microfone.

## Instalar e usar

1. Execute o instalador e escolha a pasta. Ele instala para seu usuário e cria atalhos no menu Iniciar e na área de trabalho.
2. Abra JARVIS. Em **Histórico e ajustes → Aplicativo**, informe sua chave Gemini. Ela é criptografada pelo Windows para a conta atual; não vem dentro do instalador e não é retornada à interface.
3. Clique em **Iniciar JARVIS** e permita o microfone. A transcrição usa Gemini, pois o reconhecimento proprietário do Chrome não é usado pelo aplicativo. A síntese mantém a voz Gemini e o fallback do Windows. Respostas e transcrição dependem de internet e cota da API.

O detector de fala e a captura do microfone rodam localmente; o áudio é enviado ao Gemini para transcrição em português brasileiro. O aplicativo não depende de `SpeechRecognition`/`webkitSpeechRecognition` do Chromium. Falhas temporárias de rede ou do serviço são repetidas uma vez sem trocar para esse mecanismo incompatível, e não causam reinicializações enquanto há silêncio. O serviço local agora também impõe o prazo de transcrição, mesmo se o provedor não encerrar uma chamada cancelada, e retorna um erro 504 acionável em vez de deixar a interface expirar sem resposta. Para verificar o estado, pressione **D** e confira “recogniser restarts”, “transcription failures” e “error”. Se o microfone não abrir, confira também **Configurações do Windows → Privacidade e segurança → Microfone** e a entrada selecionada em **Histórico e ajustes → Áudio**.

Em **Histórico e ajustes → Áudio**, escolha entre as vozes Gemini Charon, Orus, Kore e Puck e ajuste a velocidade até 1,8× (1,25× é o padrão). O modo rápido vem ativado para reduzir a espera, e a fala neural usa ritmo ágil e pausas curtas. A pausa de captura de 0,8 s também pode ser ajustada em Áudio; reduzi-la demais pode cortar o fim de uma frase.
4. Fechar a janela a mantém na bandeja. Use **Sair do JARVIS** para encerrar o assistente. Aplicativos abertos por ele são solicitados ao Windows pelo Explorer para não dependerem da vida do processo Electron.

A inicialização com Windows pode ser ativada/desativada na seção Aplicativo. A instalação ainda não tem certificado de assinatura digital; o Windows pode exibir um aviso de aplicativo desconhecido. Não foram publicados atualizações automáticas ou serviços de nuvem próprios.

## Dados e versão anterior

A versão desktop guarda dados em `%APPDATA%\JARVIS\dados` e as configurações protegidas em `%APPDATA%\JARVIS\desktop-settings.json`. O histórico e as preferências da interface ficam no perfil Electron; a origem local permanece estável entre aberturas. Fechar/desinstalar não elimina automaticamente seus documentos do Word, projetos ou os registros pessoais.

Os dados da versão de desenvolvimento continuam em `.jarvis-data`, e o histórico anterior continua no perfil do Chrome. `npm run desktop:start` importa a chave do `.env.local` para armazenamento protegido e copia os dados de `.jarvis-data` uma única vez quando executado a partir do projeto. Esse arquivo de ambiente e os dados pessoais nunca são copiados para o pacote de instalação. Para usar a integração de seleção do VS Code com o aplicativo, configure **jarvis.snapshotDirectory** para `%APPDATA%\JARVIS\dados` (caminho absoluto).

Se a inicialização antiga por script já estiver configurada, desative-a com `scripts/install-dedicated.ps1 -RemoveStartup` antes de ativar a inicialização da nova versão. Isso evita duas instâncias diferentes ouvindo ao mesmo tempo.

Para preparar os dados existentes sem abrir a interface, execute `node scripts/migrate-desktop.mjs`. Após instalar em `%LOCALAPPDATA%\Programs\JARVIS`, `scripts/switch-to-desktop.ps1` encerra somente os serviços antigos identificados, remove a inicialização antiga e abre o novo aplicativo, preservando os outros aplicativos. Feche a janela antiga do Chrome se ela ainda estiver aberta.

## Compilar

```powershell
npm install
node node_modules/electron/install.js
npm run desktop:dist
```

O empacotamento usa uma pasta gerada `desktop-app`, com apenas as dependências do serviço. O executável Claude CLI de aproximadamente 300 MB é excluído, pois a versão desktop usa Gemini. Bibliotecas nativas e o script do Word ficam como arquivos acessíveis fora de ASAR. `desktop:dist` sempre recompila antes de empacotar.

## Verificação

- `npm run test:desktop-app`: sessão privada, arquivos estáticos e transcrição.
- `npm run test:gemini` e `npm run test:assistant`: integração das ferramentas e memória.
- `node scripts/check-electron.mjs`: janela real, credenciais protegidas, microfone simulado, áudio sintético transcrito pelo Gemini e abertura confirmada da Calculadora. Usa uma chave configurada e o WAV sintético de `.ui-check.local/transcription-check.wav`.
- `node scripts/check-electron-microphone.mjs`: primeira abertura sem chave e acesso ao microfone físico; nenhuma gravação é enviada nesse teste.
- Para testar o pacote final, defina `JARVIS_TEST_EXECUTABLE` com o caminho de `release\win-unpacked\JARVIS.exe` e execute `scripts/check-electron.mjs`.

Referências oficiais: [Electron UtilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [permissões da sessão](https://www.electronjs.org/docs/latest/api/session), [instalador NSIS](https://www.electron.build/v26/docs/nsis/) e [áudio no Gemini](https://ai.google.dev/gemini-api/docs/audio).
