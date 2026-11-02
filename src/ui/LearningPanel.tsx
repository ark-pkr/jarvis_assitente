import { useState } from 'react'
import { useWorkspace } from '../workspace'
import { LecturePanel } from './LecturePanel'

const lessons = [
  ['logica', 'Lógica de programação', 'Variáveis, condições, repetições e resolução de problemas'],
  ['funcoes', 'Funções e estruturas de dados', 'Funções, listas, objetos e decomposição de problemas'],
  ['git', 'Git e organização de projetos', 'Commits, branches, revisão e organização de código'],
  ['web', 'HTML e CSS', 'Estrutura, estilo, acessibilidade e interfaces responsivas'],
  ['javascript', 'JavaScript e TypeScript', 'Eventos, assincronismo, tipos e aplicações web'],
  ['python', 'Python', 'Scripts, funções, arquivos e automação'],
  ['sql', 'SQL e bancos de dados', 'Consultas, chaves, relacionamentos e normalização'],
  ['requisitos', 'Análise de requisitos', 'Atores, regras de negócio, casos de uso e critérios de aceite'],
  ['modelagem', 'Modelagem de sistemas', 'Entidades, fluxos, responsabilidades e modelos de dados'],
  ['apis', 'APIs e arquitetura', 'HTTP, contratos, camadas, autenticação e tratamento de erros'],
  ['testes', 'Testes e depuração', 'Testes unitários, integração, investigação de defeitos e segurança'],
  ['projeto', 'Projeto prático completo', 'Planejar, implementar e revisar um sistema de ponta a ponta'],
] as const

export function LearningPanel({ send }: { send: (prompt: string) => void }) {
  const { learning, settings, setLearning, setSettings } = useWorkspace()
  const [question, setQuestion] = useState('')
  const lesson = lessons.find(([id]) => id === learning.topic) || lessons[0]
  const start = (kind: string) => {
    setSettings({ mode: 'tutor' })
    send(`${kind} sobre ${lesson[1]}: ${lesson[2]}. Meu nível é ${learning.level} e tenho ${learning.minutes} minutos por dia. Objetivo: ${learning.goal || 'aprender desenvolvimento e análise de sistemas'}. ${question ? `Minha dúvida ou tentativa: ${question}` : ''} Ensine um conceito por vez em português, com exemplo concreto e explicação do raciocínio. Para código, mostre-o em painel legível, com comentários quando ajudarem, explique cada parte e o resultado esperado sem apenas entregar uma resposta. Para tabelas, explique cabeçalhos, unidades, linhas relevantes e relações. Se usar PDF, cite a página em cada ideia, separe o que está na fonte do que você criou e não invente detalhes ilegíveis. Em aula expositiva, explique sem interromper com perguntas; no final ofereça exercício opcional. Se eu aceitar, dê pistas uma por vez e espere minha tentativa antes de revelar a próxima ou a solução.`)
  }
  return <>
    <h3>Desenvolvimento, análise e estudos</h3>
    <label>Modo de ajuda<select aria-label="Modo de ajuda" value={settings.mode} onChange={(event) => setSettings({ mode: event.target.value as typeof settings.mode })}>
      <option value="assistente">Assistente geral</option><option value="desenvolvimento">Desenvolvimento de sistemas</option>
      <option value="analise">Análise de sistemas</option><option value="tutor">Tutor de estudos</option>
    </select></label>
    <label>Meu nível<select aria-label="Nível dos estudos" value={learning.level} onChange={(event) => setLearning({ level: event.target.value })}>
      <option>Iniciante</option><option>Intermediário</option><option>Avançado</option>
    </select></label>
    <label>Tempo por dia (minutos)<input aria-label="Minutos de estudo" type="number" min="10" max="240" step="10" value={learning.minutes} onChange={(event) => setLearning({ minutes: Math.max(10, Math.min(240, Number(event.target.value) || 10)) })} /></label>
    <label>Meu objetivo<input aria-label="Objetivo de aprendizagem" maxLength={500} value={learning.goal} onChange={(event) => setLearning({ goal: event.target.value })} placeholder="Ex.: criar um sistema de estoque e aprender ADS" /></label>
    <LecturePanel send={send} />
    <h3>Aula com PDF e exemplos na tela</h3>
    <p>O JARVIS explica um conceito por vez, percorre exemplos de código e interpreta tabelas, fórmulas ou diagramas. No fim, pode oferecer um exercício opcional com pistas graduais.</p>
    <label>Pasta do PDF<input aria-label="Pasta do PDF" value={learning.pdfFolder} onChange={(event) => setLearning({ pdfFolder: event.target.value })} placeholder="C:\Users\seu-usuario\Documents\Aulas" /></label>
    <label>Arquivo PDF dentro da pasta<input aria-label="Arquivo PDF da aula" value={learning.pdfFile} onChange={(event) => setLearning({ pdfFile: event.target.value })} placeholder="aula-01.pdf" /></label>
    <label>Assunto para explicar<input aria-label="Assunto do PDF" value={learning.pdfTopic} onChange={(event) => setLearning({ pdfTopic: event.target.value })} placeholder="Ex.: laços de repetição ou explique estas páginas" /></label>
    <div className="workspace-row">
      <label>Da página<input aria-label="Página inicial do PDF" type="number" min="1" value={learning.pageFrom} onChange={(event) => { const pageFrom = Math.max(1, Math.floor(Number(event.target.value) || 1)); setLearning({ pageFrom, pageTo: Math.max(pageFrom, Math.min(pageFrom + 4, learning.pageTo)) }) }} /></label>
      <label>Até a página<input aria-label="Página final do PDF" type="number" min={learning.pageFrom} max={learning.pageFrom + 4} value={learning.pageTo} onChange={(event) => setLearning({ pageTo: Math.max(learning.pageFrom, Math.min(learning.pageFrom + 4, Math.floor(Number(event.target.value) || learning.pageFrom))) })} /></label>
    </div>
    <label>Mostrar exemplos no<select aria-label="Destino dos exemplos" value={learning.exampleTarget} onChange={(event) => setLearning({ exampleTarget: event.target.value as 'word' | 'vscode' })}><option value="word">Microsoft Word</option><option value="vscode">Visual Studio Code</option></select></label>
    {learning.exampleTarget === 'vscode' && <>
      <label>Pasta para os exemplos<input aria-label="Pasta dos exemplos" value={learning.exampleFolder} onChange={(event) => setLearning({ exampleFolder: event.target.value })} placeholder="C:\Users\seu-usuario\Documents\Estudos" /></label>
      <label>Nome do arquivo de exemplo<input aria-label="Arquivo de exemplo" value={learning.exampleFile} onChange={(event) => setLearning({ exampleFile: event.target.value })} placeholder="aula-exemplo.py" /></label>
    </>}
    <button disabled={!learning.pdfFolder.trim() || !learning.pdfFile.trim() || (learning.exampleTarget === 'vscode' && (!learning.exampleFolder.trim() || !learning.exampleFile.trim()))} onClick={() => {
      setSettings({ mode: 'tutor' })
      send(`Quero uma aula como um professor, com demonstração. Pasta do PDF: ${JSON.stringify(learning.pdfFolder)}. Arquivo relativo: ${JSON.stringify(learning.pdfFile)}. Leia as páginas ${learning.pageFrom} a ${learning.pageTo} usando lesson_pdf_read, autorizando a pasta com project_open se necessário. Peça includeImages=true, especialmente se houver tabelas, fórmulas, diagramas, colunas ou texto extraído confuso. Assunto: ${learning.pdfTopic || 'explique os conceitos destas páginas'}. Nível: ${learning.level}. Baseie cada afirmação sobre o material nas páginas realmente lidas. Cite a página junto de cada conceito; diferencie claramente o que o PDF afirma dos seus exemplos. Explique um conceito de cada vez em linguagem didática, usando analogia somente se ajudar. Para tabelas, percorra título/cabeçalhos, unidades, linhas relevantes e relações dos valores; para diagramas ou fórmulas, descreva o que cada parte representa. Se a imagem estiver ilegível ou a extração ambígua, diga isso e não adivinhe. Crie um exemplo de código pequeno e útil, comentado onde fizer sentido, diga o resultado esperado e explique cada parte passo a passo. Use lesson_present com explanation, example e codeWalkthrough; inclua tableWalkthrough quando houver uma tabela, fórmula ou diagrama que possa interpretar com segurança, e commonMistakes se forem úteis. Mostre o material ${learning.exampleTarget === 'word' ? 'em um novo documento real do Word' : `no VS Code, na pasta ${JSON.stringify(learning.exampleFolder)}, arquivo ${JSON.stringify(learning.exampleFile)}; autorize esta pasta se necessário`}. No VS Code, deixe o arquivo como código válido e faça a explicação passo a passo em separado. Explique por voz em português sem ler o código literalmente. Não interrompa cada etapa com perguntas; ao final, ofereça um exercício opcional sem resposta. Se eu aceitar, dê uma pista por vez, espere minha tentativa e só revele a solução completa se eu pedir. Não execute código. Se não conseguir ler o material, informe o problema.`)
    }}>Iniciar aula com exemplos</button>
    <p>Até cinco páginas por etapa e PDFs de até 20 MB. As alterações são mostradas para sua confirmação. Depois, diga “continue a aula” para seguir no mesmo documento ou arquivo.</p>
    <h3>Trilha de aprendizagem</h3>
    <p>{learning.completed.length} de {lessons.length} tópicos marcados por você. O progresso é pessoal; não representa avaliação ou certificação.</p>
    <progress aria-label="Progresso dos estudos" max={lessons.length} value={learning.completed.length} />
    <div className="learning-topics">{lessons.map(([id, name, description]) => <div key={id}>
      <button aria-pressed={learning.topic === id} onClick={() => setLearning({ topic: id })}>{name}<small>{description}</small></button>
      <label><input aria-label={`Concluir ${name}`} type="checkbox" checked={learning.completed.includes(id)} onChange={(event) => setLearning({ completed: event.target.checked ? [...learning.completed, id] : learning.completed.filter((entry) => entry !== id) })} />Concluído</label>
    </div>)}</div>
    <label>Dúvida, exercício ou tentativa<textarea aria-label="Dúvida ou tentativa" rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={6000} placeholder="Cole uma dúvida ou tente resolver o exercício antes de pedir a correção." /></label>
    <div className="workspace-row"><button onClick={() => start('Comece uma aula curta, ensine um conceito e depois espere minha tentativa')}>Começar aula</button>
      <button onClick={() => start('Crie um exercício prático adequado ao meu nível, sem revelar a solução')}>Praticar</button>
      <button disabled={!question.trim()} onClick={() => start('Revise minha tentativa e dê pistas antes da solução completa')}>Corrigir tentativa</button>
      <button onClick={() => start('Monte um plano de estudo com sequência, tarefas e critérios para eu verificar minha evolução')}>Criar plano</button></div>
    <h3>Aplicar em um sistema real</h3>
    <p>Descreva seu sistema no campo acima ou autorize uma pasta na seção Arquivos para revisar código existente.</p>
    <div className="workspace-row"><button disabled={!question.trim()} onClick={() => { setSettings({ mode: 'analise' }); send(`Ajude a analisar este sistema: ${question}. Levante requisitos, atores, regras de negócio e critérios de aceite. Separe fatos de hipóteses. Mostre o material detalhado em um painel.`) }}>Analisar requisitos</button>
      <button disabled={!question.trim()} onClick={() => { setSettings({ mode: 'desenvolvimento' }); send(`Ajude a desenvolver ou revisar este código/sistema: ${question}. Explique o problema, proponha uma implementação e testes relevantes. Não diga que executou testes sem comprovação. Mostre código em um painel; não leia blocos de código em voz alta.`) }}>Revisar ou desenvolver</button></div>
  </>
}

export function FilesPanel({ send }: { send: (prompt: string) => void }) {
  const [directory, setDirectory] = useState('')
  const [task, setTask] = useState('')
  return <>
    <h3>Projetos e organização de arquivos</h3>
    <p>Escolha uma pasta específica do seu computador. O JARVIS pedirá confirmação antes de autorizar a leitura, criar projetos, editar código ou mover arquivos.</p>
    <label>Caminho da pasta<input aria-label="Pasta do projeto" value={directory} onChange={(event) => setDirectory(event.target.value)} placeholder="C:\Users\seu-usuario\Documents\MeuProjeto" /></label>
    <div className="workspace-row"><button disabled={!directory.trim()} onClick={() => send(`Quero autorizar esta pasta para projetos e arquivos: ${directory}. Use project_open e solicite minha confirmação. Depois liste a estrutura.`)}>Autorizar e conhecer pasta</button>
      <button onClick={() => send('Liste as pastas autorizadas usando project_roots e mostre em um painel.')}>Pastas autorizadas</button></div>
    <label>O que você quer fazer?<textarea aria-label="Tarefa com arquivos" rows={4} value={task} maxLength={4000} onChange={(event) => setTask(event.target.value)} placeholder="Ex.: revise o arquivo src/app.ts e explique o erro. Ou: organize os PDFs desta pasta por mês." /></label>
    <div className="workspace-row"><button disabled={!task.trim()} onClick={() => send(`${task}\n${directory.trim() ? `Pasta escolhida: ${directory}. Autorize via project_open se necessário.` : 'Use apenas pastas já autorizadas.'} Para organização, gere uma prévia antes de aplicar; para código, mostre antes/depois e solicite confirmação.`)}>Pedir ajuda com arquivos</button>
      <button disabled={!task.trim() || !directory.trim()} onClick={() => send(`Quero criar um projeto completo para este objetivo: ${task}\nPasta pai escolhida: ${directory}. Se faltarem requisitos importantes, pergunte antes de planejar. Use project_templates para comparar opções, project_roots/project_open para autorizar a pasta se necessário e escolha a tecnologia mais adequada explicando trade-offs. Apresente um plano com funcionalidades, critérios de aceite, arquivos, README, testes, configuração e verificações usando project_plan; espere minha aprovação. Só então gere exatamente os arquivos aprovados via project_create e espere a segunda aprovação. Depois da criação, ofereça abrir a pasta no VS Code e verificar. Para cada comando de instalação/build/teste use project_execute, explique Docker e o acesso à rede, peça uma aprovação por comando, analise falhas e proponha correções por project_write com nova aprovação. Nunca execute no Windows se o Docker não estiver disponível e não diga que algo passou sem resultado.`)}>Criar projeto completo</button>
      <button onClick={() => send('Quero analisar os diagnósticos atuais do VS Code. Se ainda não compartilhei, oriente-me a usar a paleta de comandos: “JARVIS: Compartilhar diagnósticos”. Depois use editor_diagnostics, explique os erros priorizando impacto e proponha correções pontuais por project_write com aprovação. Não afirme que executou testes sem evidência.')}>Compartilhar diagnósticos do VS Code</button>
      <button disabled={!directory.trim()} onClick={() => send(`Crie SOMENTE uma prévia, sem mover arquivos, para organizar por tipo os arquivos diretamente nesta pasta: ${directory}. Use project_open se necessário e organize_preview. Mostre a lista no painel.`)}>Prévia por tipo</button>
      <button disabled={!directory.trim()} onClick={() => send(`Crie SOMENTE uma prévia, sem mover arquivos, para organizar pelo mês de modificação os arquivos diretamente nesta pasta: ${directory}. Use project_open se necessário e organize_preview. Mostre a lista no painel.`)}>Prévia por data</button>
      <button disabled={!directory.trim()} onClick={() => send(`Quero uma prévia de organização por projeto para a pasta ${JSON.stringify(directory)}. Primeiro consulte project_roots e use project_open para pedir autorização se a pasta não estiver autorizada. Depois use project_list com profundidade 3 para descobrir somente caminhos existentes. Proponha grupos com base em nomes, estrutura e tipos; não adivinhe quando a relação for incerta e não inclua arquivos ocultos, credenciais, dependências, links ou conteúdo de controle de versão. Use organize_custom_preview para validar a lista. Mostre cada caminho atual → destino e o motivo em um painel. Não chame organize_apply até eu revisar e pedir explicitamente.`)}>Prévia por projeto</button>
      <button onClick={() => send('Liste as alterações registradas com project_changes. Mostre identificadores e o que foi alterado para eu escolher o que desfazer. Não desfaça nada ainda.')}>Ver alterações para desfazer</button></div>
    <p>Organização por projeto cria apenas uma prévia dos arquivos observados; movimentações exigem aprovação e podem ser desfeitas. Nada é apagado ou sobrescrito, e arquivos ambíguos devem ficar sem classificação. Projetos novos não sobrescrevem destinos existentes. Instalações, builds e testes usam comandos limitados e exigem aprovação individual.</p>
  </>
}

export function ComputerPanel({ send }: { send: (prompt: string) => void }) {
  const [name, setName] = useState('')
  const [executable, setExecutable] = useState('')
  const [folder, setFolder] = useState('')
  return <>
    <h3>Aplicativos do meu computador</h3>
    <p>O JARVIS pode solicitar ao Windows a abertura de aplicativos instalados. Confirme o aplicativo e o caminho na tela.</p>
    <div className="workspace-row"><button onClick={() => send('Liste os aplicativos locais instalados usando desktop_apps. Mostre-os em um painel, incluindo os identificadores. Não abra sites.')}>Ver aplicativos encontrados</button>
      <button onClick={() => send('Abra o Visual Studio Code instalado no meu computador usando desktop_apps e desktop_open. Não abra um site.')}>Abrir VS Code</button>
      <button onClick={() => send('Abra o Microsoft Word instalado usando desktop_apps e desktop_open. Se não estiver instalado, informe. Não abra uma versão web.')}>Abrir Word</button>
      <button onClick={() => send('Crie um documento em branco real no Word usando word_new. Não me peça para clicar manualmente em Documento em branco.')}>Novo documento Word</button>
      <button onClick={() => send('Abra o Microsoft Excel instalado usando desktop_apps e desktop_open. Se não estiver instalado, informe. Não abra uma versão web.')}>Abrir Excel</button>
      <button onClick={() => send('Abra a Calculadora do Windows usando desktop_open.')}>Abrir Calculadora</button></div>
    <h3>Meu projeto no VS Code</h3>
    <label>Pasta do projeto<input aria-label="Projeto para abrir no VS Code" value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="C:\Users\seu-usuario\Documents\MeuProjeto" /></label>
    <button disabled={!folder.trim()} onClick={() => send(`Abra no VS Code instalado esta pasta: ${folder}. Use project_open se ainda não estiver autorizada e desktop_open com rootId. Depois use as ferramentas de projeto para ler ou editar código apenas quando eu pedir.`)}>Abrir projeto no VS Code</button>
    <h3>Outro aplicativo instalado</h3>
    <label>Nome do aplicativo<input aria-label="Nome do aplicativo" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
    <label>Caminho do executável .exe<input aria-label="Executável do aplicativo" value={executable} onChange={(event) => setExecutable(event.target.value)} placeholder="C:\Program Files\MeuAplicativo\app.exe" /></label>
    <button disabled={!name.trim() || !executable.trim()} onClick={() => send(`Cadastre, sem abrir ainda, este aplicativo que escolhi: ${name}. Executável: ${executable}. Use desktop_register e solicite minha confirmação.`)}>Cadastrar aplicativo</button>
    <p>Acesso local usa as permissões da sua conta do Windows. No Word, já é possível criar um documento em branco, inserir texto e salvar como DOCX, com confirmação. Peça por voz: “escreva Bom dia no documento do Word”. As alterações de código no VS Code continuam via arquivos autorizados. Excel e PowerPoint ainda não têm edição integrada.</p>
  </>
}
