# Assistente dedicado

Abra **Histórico e ajustes → Central**. Os registros ficam em `.jarvis-data/assistant.json`, separados do histórico do navegador. Podem ser editados e excluídos na central; excluir um lembrete também remove seus alertas. Perfil, projetos e estudos recentes acompanham os pedidos à IA. Outras informações podem ser consultadas pelo JARVIS com `assistant_overview`.

## Como usar

- **Perfil:** registre seu nome, objetivos, preferências e nível nas notas.
- **Projeto:** registre a tarefa atual, pasta autorizada, arquivo e próximo passo. Diga “onde eu parei?” ou “continue meu projeto”.
- **Estudos:** registre aula, dificuldades e próxima revisão. Para PDFs e exemplos no Word/VS Code, use a seção Aprender.
- **Diário:** registre trabalho realizado e soluções de erros. Não há avaliação automática de domínio ou progresso.
- **Tarefas:** acompanhe situação e próximo passo. Os pedidos à IA também aparecem numa lista automática de até 100 atividades. Concluir uma resposta não certifica que o projeto foi concluído.
- **Lembretes:** informe data e hora de Brasília. Alertas vencidos aparecem quando o serviço volta a funcionar. Não há sincronização com calendário externo, recorrência ou despertar de computador desligado.
- **Rotinas:** selecione aplicativos, pasta, arquivo, Word novo e cronômetro. Diga “execute minha rotina de estudo”. Cada abertura pede confirmação; falhas interrompem a sequência e preservam as ações anteriores.
- **Biblioteca:** busque texto nas pastas autorizadas com referências de página/linha. Cada busca dura até 12 segundos, limita 30 arquivos, três níveis e dez páginas por PDF. PDFs digitalizados precisam de leitura visual na função de aula; não existe indexação completa automática.
- **Revisão e recuperação:** use os arquivos autorizados para revisar código. Peça “mostre minhas alterações” e escolha a alteração antes de desfazer. Backup e verificação de versão impedem sobrescrever alterações posteriores.
- **Diagnóstico:** CPU é uma amostra de 300 ms; memória e disco são medições do sistema. Não encerra processos nem atribui causas sem evidências.

## VS Code

A extensão local **JARVIS Local** adiciona o comando **JARVIS: Compartilhar seleção**, também disponível no menu de contexto quando existe uma seleção. Recarregue a janela do VS Code após a instalação. Selecione o código, execute o comando e confirme o compartilhamento. Depois diga “Jarvis, explique a seleção do VS Code”.

O trecho de até 16000 caracteres fica em `.jarvis-data/editor.json`, expira para leitura após 15 minutos e só é lido pela IA se a pasta do arquivo estiver autorizada. Ao compartilhá-lo novamente, o trecho anterior é substituído. Arquivos não salvos são identificados como tal. Nada é capturado continuamente. A seleção só é enviada ao provedor de IA ao pedir sua leitura/explicação.

## Windows

`scripts/install-dedicated.ps1` instala o pacote VSIX local e cria **JARVIS Assistente.lnk** na pasta Inicializar do usuário. `start-jarvis.ps1` inicia os serviços, a janela e a bandeja; o ícone oferece Abrir JARVIS e os lembretes do Windows. A API de voz do navegador ainda pode exigir clicar em Iniciar JARVIS para ativar o microfone após entrar no Windows. Fechar a janela mantém os serviços e a bandeja ativos.

Para desativar apenas a inicialização automática:

```powershell
powershell.exe -NoProfile -File scripts/install-dedicated.ps1 -RemoveStartup
```

A extensão pode ser removida normalmente no VS Code. O menu Sair da bandeja fecha apenas o ícone; os serviços continuam. Reinícios seguros usam `scripts/restart-jarvis.ps1` e preservam aplicativos abertos.

## Validação

`npm run test:assistant`, `npm run test:lessons`, `npm run test:gemini`, `npm run test:assistant-ui` e `npm run build`. `node scripts/check-assistant-live.mjs` verifica diagnóstico com o Gemini configurado, consumindo uma requisição da API. Testes de interface criam registros identificados e os removem ao terminar.
