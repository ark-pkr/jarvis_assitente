# JARVIS com Gemini

Esta cópia usa Gemini API por padrão, sem instalar ou autenticar o Claude Code.

1. Crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey).
2. Abra `.env.local` na raiz do projeto e preencha `GEMINI_API_KEY`.
3. Execute `npm start` e abra http://localhost:5173 no Chrome ou Edge.
4. Clique em INITIALISE e permita o microfone.

Configuração do servidor (reinicie após editar):

```dotenv
JARVIS_PROVIDER=gemini
GEMINI_API_KEY=cole_sua_chave_aqui
JARVIS_MODEL=gemini-3.5-flash
```

A chave fica no servidor Node, fora do frontend. Não use prefixo `VITE_` na chave. `.env.local` é ignorado pelo Git. Variáveis do terminal têm prioridade. A API tem cotas e pode exigir faturamento próprio.

## Recursos

SDK oficial `@google/genai`, streaming, histórico por conexão, interrupção e chamadas de ferramentas. Painéis, interface, câmera e Chrome são expostos via MCP sem iniciar o Claude CLI.

### Navegação sem extensão do Claude

Os comandos `chrome_*` usam `playwright-core` e o Chrome instalado. Ao pedir "Jarvis, abra https://example.com", abre-se uma janela dedicada ao JARVIS. O perfil fica em `.browser-profile/`, ignorado pelo Git, e guarda os logins entre execuções. Ele não controla abas nem reutiliza logins do seu Chrome pessoal. Faça login manualmente nessa janela se necessário; alguns sites podem restringir navegadores automatizados.

Navegar, pesquisar, ler páginas e capturar imagens estão disponíveis no modo padrão. Em pesquisas, o JARVIS pode mostrar links das fontes para consulta e comparação. Cliques e preenchimento mostram uma confirmação com página, alvo e conteúdo antes da execução. Cancelar, interromper ou deixar a confirmação expirar impede a ação. Se a página ou o elemento mudar enquanto a confirmação estiver aberta, a ação é recusada e precisa ser solicitada novamente. Senhas devem ser preenchidas manualmente. Para uma instalação do Chrome em outro caminho, configure `JARVIS_CHROME_PATH` em `.env.local`. Não é necessário baixar outro navegador.

MCPs externos são lidos de `~/.claude.json`, se existir. Há suporte a stdio, HTTP e SSE. OAuth interativo precisa de configuração adicional. As ferramentas próprias do Claude Code, como Bash e Read, não são fornecidas: configure MCPs equivalentes se precisar delas. O bloqueio de ações externas continua aplicado antes da exposição e execução de ferramentas. `npm start -- --writes` habilita ações de outros MCPs; não é necessário para clicar no Chrome com confirmação.

Reconhecimento e síntese de voz continuam separados do Gemini; ElevenLabs é opcional. Capturas solicitadas da câmera são enviadas ao Gemini. O reconhecimento usa português do Brasil e a voz prioriza `pt-BR`. Diga "Oi Jarvis" ou pressione Espaço para falar. Pressione V para alternar entre as vozes portuguesas disponíveis.

### Controles de conversa

Após clicar em **INICIAR JARVIS** e permitir o microfone, a entrada por voz permanece ativa, sem tempo limite de inatividade. O painel inferior de botões e digitação foi removido. Fale diretamente em português; a conversa aparece na tela. **Esc** coloca o assistente em espera; **Espaço** ou “Oi Jarvis” reativa. **T** testa o som e **V** alterna a voz. Confirmações de alterações continuam sendo feitas na tela.

### Histórico, memória e áudio

Abra **Histórico e ajustes** no canto superior direito. No histórico, crie, pesquise, retome ou exclua conversas, repita pedidos e exporte os dados em JSON. A memória guarda preferências escritas por você. Também é possível dizer "Lembre-se de que…": o JARVIS oferece uma confirmação antes de salvar a nota.

Histórico e memória ficam no `localStorage` deste perfil do navegador, sem sincronização entre perfis. O histórico completo permanece na interface; as últimas 40 mensagens da conversa selecionada e as preferências são enviadas ao Gemini em cada pedido. Você pode desativar o salvamento ou apagar os dados no painel. Excluir dados locais não apaga eventuais registros mantidos pelo provedor da API.

Em **Áudio**, ajuste música, volume e velocidade da próxima fala. O modo rápido usa `thinkingLevel: LOW` em modelos Gemini 3, conforme a [documentação do Google](https://ai.google.dev/gemini-api/docs/thinking). Em **Conexões**, veja servidor, chave configurada, microfone e Chrome. A presença da chave não garante cota disponível; falhas reais são mostradas ao enviar um pedido.

O **modo visual leve** vem ativado: mostra a esfera neural dourada de pontos e conexões, inspirada na referência visual do JARVIS, usando Canvas 2D sem iniciar WebGL ou filtros de pós-processamento. Em **Áudio → Visual holográfico**, escolha também o reator circular anterior. Os efeitos completos só são carregados quando você desativa o modo visual leve. A esfera responde à atividade de voz, respeita a preferência por movimento reduzido e pausa quando a aba fica oculta.

A interface mantém as informações e controles do HUD sobre a visualização. A configuração atual prioriza voz a 100%, música a 4% e efeitos mais baixos. O navegador não permite amplificar a voz nativa acima de 100%; se necessário, ajuste o volume do Chrome no mixer do Windows. Em **Áudio**, use **Ouvir teste de voz**, veja o sinal do microfone e ajuste a pausa de captura entre 0,6 e 2,5 segundos. O padrão de 0,8 segundo responde mais rápido; aumente a pausa se notar que o fim das frases está sendo cortado.

O modo rápido vem ativado por padrão: Gemini 3 usa raciocínio `LOW` para reduzir a espera, com explicações proporcionais à pergunta e sem teto artificial de duas frases. Desative-o para usar raciocínio `MEDIUM` quando preferir respostas mais cuidadosas.

### Voz natural e respostas completas

A opção **Áudio → Voz neural natural do Gemini** usa o modelo `gemini-2.5-flash-preview-tts` com a mesma chave Gemini já configurada. Ela gera fala em português do Brasil com instruções de ritmo de conversa, converte PCM em WAV e normaliza a amplitude sem saturação. Consome a cota de áudio da API e pode acrescentar espera antes da primeira fala; se houver falha, o aplicativo volta temporariamente à voz do navegador. O modelo pode ser substituído por `JARVIS_TTS_MODEL` no servidor por outro compatível com a mesma API de geração de áudio.

Durante uma resposta, ruídos e palavras comuns não interrompem mais a reprodução. Para interromper, diga **“Jarvis, pare”**, pressione **Espaço** para falar ou **Esc** para colocar em espera. Fora das respostas, a escuta continua ativa. As frases curtas podem ser agrupadas para preservar a entonação. Cancelar uma fala encerra também o áudio e as solicitações pendentes.

### Projetos, análise de sistemas e estudos

Em **Histórico e ajustes → Aprender**, escolha entre assistente geral, desenvolvimento, análise de sistemas e tutor. Ajuste nível, tempo por dia e objetivo. A trilha cobre lógica, funções, Git, HTML/CSS, JavaScript/TypeScript, Python, SQL, requisitos, modelagem, APIs, testes e um projeto prático. Os botões iniciam aulas, exercícios, correção de tentativas e planos de estudo. O tutor dá pistas antes da solução; o progresso é marcado por você e salvo localmente quando o salvamento está ativo.

Em **Arquivos**, informe uma pasta absoluta e clique em **Autorizar e conhecer pasta**. A confirmação informa que os arquivos lidos podem ser enviados ao Gemini. O JARVIS só lista e lê pastas autorizadas, ignora nomes conhecidos de credenciais/dependências e recusa links ou caminhos fora da pasta. Isso não identifica automaticamente todo segredo que possa estar escrito dentro de um arquivo de código: escolha os arquivos apropriados para compartilhar.

O JARVIS pode escolher uma tecnologia adequada ao objetivo e criar um projeto do zero para sites/aplicações web, APIs, aplicativos desktop e automações. Em **Arquivos**, descreva o objetivo, escolha a pasta pai e use **Criar projeto completo** — ou peça por voz. Se faltar algum requisito importante, ele deve perguntar antes de planejar. Em seguida compara os modelos disponíveis, explica a escolha e pede aprovação para um plano com funcionalidades, critérios de aceite, arquivos, configuração e verificações. A aprovação do plano **não cria arquivos**: uma segunda confirmação autoriza a criação exata dos caminhos aprovados. O projeto deve incluir README com instalação/uso/testes, testes automatizados e `.env.example` com placeholders fictícios quando houver configuração. Não sobrescreve um destino existente.

Após criar, o JARVIS pode oferecer a abertura no VS Code e a execução das verificações listadas no plano. Cada comando pede aprovação individual. Se houver erro, ele deve analisar a saída, propor uma correção pontual e pedir aprovação separada antes de editar ou tentar novamente.

### Execução isolada com Docker

`project_execute` não executa comandos diretamente no Windows: requer Docker Desktop iniciado, contexto local (named pipe no Windows) e a imagem apropriada já baixada. Se qualquer pré-requisito faltar, o comando falha sem fallback para o host. As tags abaixo selecionam versões, mas não são digests imutáveis; valide a procedência das imagens antes de usá-las. Baixe manualmente somente as que você precisa:

```powershell
docker pull node:22-bookworm-slim
docker pull python:3.13-slim
docker pull alpine/git:2.47.2
docker pull mcr.microsoft.com/dotnet/sdk:10.0
docker pull golang:1.24-alpine
docker pull rust:1.87-slim
```

O contêiner usa raiz somente leitura, sem capacidades Linux, sem privilégios, limites de CPU/memória/processos e monta apenas a pasta do projeto autorizado; a pasta montada continua gravável. O comando tem limite de tempo e o JARVIS tenta remover o contêiner temporário mesmo após falhas. **Docker/daemon e a pasta montada continuam sendo fronteiras confiáveis, não um sandbox absoluto.** Scripts e dependências podem iniciar subprocessos e alterar o projeto. Revise o comando e a pasta antes de confirmar. A rede fica desativada por padrão; para instalar dependências ou acessar serviços externos, aprove explicitamente a opção de rede em cada comando. A aprovação dá acesso de saída à rede durante aquele comando. Não execute código ou dependências não confiáveis.

### Diagnósticos do VS Code

Instale a extensão local em `integrations/vscode` e configure `jarvis.snapshotDirectory` para a pasta `.jarvis-data` desta instalação do JARVIS. Na paleta de comandos, use **JARVIS: Compartilhar diagnósticos**; a extensão mostra uma confirmação antes de salvar até 200 erros/avisos da área de trabalho aberta. Os dados expiram em 15 minutos. O assistente só os lê se todos os arquivos pertencerem a pastas previamente autorizadas em **Arquivos**. As mensagens de diagnóstico são tratadas como conteúdo não confiável. A seção **Arquivos** também oferece o atalho **Compartilhar diagnósticos do VS Code** para pedir a análise; use o comando da extensão primeiro quando ainda não houver snapshot.

Também pode ler código, investigar erros, propor testes e criar/editar arquivos de texto. Antes de editar um arquivo existente, exige que ele seja lido e apresenta o conteúdo antes/depois. Para organizar arquivos, cria uma prévia de até 200 arquivos diretamente na pasta, por tipo ou mês de modificação em São Paulo. A execução exige nova confirmação, nunca sobrescreve um destino e fica registrada para desfazer. A criação de projeto e as alterações ficam disponíveis em `project_changes`; `project_undo` pede confirmação e só desfaz arquivos criados que não tenham sido modificados depois. Organização semântica por projeto ainda é uma análise/sugestão, não uma classificação automática confiável.

Autorizações, cópias anteriores de arquivos editados e registros ficam em `.jarvis-data/projects/`, ignorada pelo Git. Use `project_changes` e `project_undo` por voz para consultar e desfazer; `project_revoke` remove a autorização de uma pasta sem apagar seus arquivos. Não é necessário ativar `--writes` para essas ferramentas: cada alteração já exige aprovação na interface.

Exemplos: “Crie do zero um site para agendamento de consultas e escolha a tecnologia”, “Monte uma API para controlar estoque, instale as dependências e rode os testes, pedindo minha aprovação para cada comando”, “Ensine SQL sem me dar a resposta do exercício”, “Analise os requisitos de um sistema de estoque”, “Revise main.py na pasta autorizada”, “Mostre uma prévia dos PDFs por tipo”, “Desfaça a criação do projeto anterior”.

### Escrever no Word instalado

A integração usa o modelo de objetos COM do Word no Windows. Pode listar documentos abertos, criar um documento em branco, ler o texto com autorização, acrescentar texto ao final preservando o existente e salvar como `.docx` em uma pasta autorizada. Cada leitura ou alteração pede confirmação identificando o documento. Uma mudança no texto durante a confirmação recusa a escrita; se houver vários documentos, especifique o nome.

Exemplos: “Crie um documento em branco no Word”, “Escreva Bom dia no Documento1”, “Acrescente um parágrafo explicando o projeto” e “Salve como relatorio.docx na pasta autorizada”. Inserir texto não salva automaticamente. Use Ctrl+Z no Word para desfazer a inserção. A integração não executa macros, não substitui todo o documento e não edita Excel ou PowerPoint. Diálogos de login, ativação, proteção ou salvamento devem ser resolvidos por você; o JARVIS não os confirma automaticamente.

### Aplicativos do Windows e VS Code

Em **Histórico e ajustes → Computador**, consulte aplicativos encontrados, abra VS Code, Word, Excel ou Calculadora e cadastre outro executável `.exe` escolhido por você. A abertura solicita confirmação com aplicativo e caminho. Não aceita linha de comando, argumentos livres, terminais ou instaladores. Aplicativos cadastrados ficam em `.jarvis-data/applications.json`.

Por voz: “Jarvis, abra o VS Code instalado”, “abra o Excel” ou “abra meu projeto no VS Code”. Para abrir uma pasta/arquivo no editor, autorize a pasta primeiro em **Arquivos**; o VS Code abre a mesma pasta ou arquivo, inclusive em uma linha específica. Salve alterações pendentes no editor antes de pedir ao JARVIS que altere o arquivo no disco. Ler/editar código continua usando `project_read` e `project_write` com comparação e confirmação. Abrir um aplicativo não concede controle completo de sua janela, de extensões, do terminal ou dos documentos Office abertos.

O iniciador abre o JARVIS em uma janela de aplicativo do Chrome, sem barra de endereço. Continua usando a interface web local e o servidor Node; não é um executável independente nem exige permissões de administrador.

### Iniciar pela área de trabalho

O atalho **JARVIS** abre o servidor em segundo plano e a interface no Chrome. Também é possível executar `Iniciar JARVIS.cmd` na pasta do projeto. O iniciador reutiliza uma instância já ativa. Logs de inicialização ficam em `.jarvis-data/`, ignorada pelo Git. Para recriar o atalho no Windows: `powershell.exe -NoProfile -File scripts/install-shortcut.ps1`.

Para voltar ao Claude: `JARVIS_PROVIDER=claude` e remova `JARVIS_MODEL` ou escolha um modelo Claude válido.

Referências: [SDK](https://googleapis.github.io/js-genai/), [ferramentas](https://ai.google.dev/gemini-api/docs/function-calling), [modelos](https://ai.google.dev/gemini-api/docs/models).
# Aulas com PDF, Word e VS Code

A versão instalável para Windows e suas instruções estão em [Aplicativo Windows](APLICATIVO-WINDOWS.md). O instalador é gerado em `release/`.

Para perfil pessoal, memória de projetos, rotinas, lembretes, biblioteca, central de tarefas, seleção do VS Code e integração com Windows, consulte [Assistente dedicado](ASSISTENTE-DEDICADO.md).

Em **Histórico e ajustes → Aprender → Aula com PDF**, informe a pasta e o nome relativo do PDF, o assunto e as páginas. Escolha Word ou VS Code e clique em **Iniciar aula com exemplos**. Também é possível pedir por voz informando o caminho do material.

O assistente lê até cinco páginas por etapa (PDF de até 20 MB) e cita a página junto de cada ideia baseada no material. A aula apresenta um conceito por vez, distingue o que está na fonte dos exemplos criados pelo tutor e, em código, pode incluir comentários, resultado esperado e uma explicação separada passo a passo. Quando há tabelas, fórmulas ou diagramas legíveis, explica títulos, cabeçalhos, unidades, linhas relevantes e relações. Se a extração ou imagem estiver ilegível/ambígua, deve avisar em vez de completar por suposição.

No Word, cria ou continua um documento com o conceito, exemplo e explicação; no VS Code, escreve apenas o arquivo de código em pasta autorizada e solicita sua abertura, sem executar o código. A alteração completa aparece para confirmação. Depois diga “continue a aula”. Documentos Word não são salvos automaticamente.

A extração de texto pode perder colunas e fórmulas. A leitura pede imagens quando a página contém tabelas, fórmulas, diagramas, colunas ou texto extraído confuso; até duas imagens são enviadas por leitura e cada uma é identificada pelo número da página. No fim, o tutor pode oferecer um exercício opcional sem resposta. Se você aceitar, ele dá uma pista por vez, espera sua tentativa e só mostra a solução completa se você pedir. A fala usa ritmo natural e explica as ideias sem ler o código literalmente; a síntese de voz ainda depende da conexão e do tempo da API.

Verificação: `npm run test:lessons` e `node scripts/check-pdf-lessons.mjs` (com o aplicativo em execução e Chrome instalado).
