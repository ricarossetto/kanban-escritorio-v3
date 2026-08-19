# Keller Central Jurídica

Central local para reunir agenda, intimações, processos e tarefas em um Kanban com a identidade visual do Keller Advogados.

Esta primeira versão já funciona como painel local e foi preparada para três formas de entrada:

- agenda ADVBOX por Webcal;
- sessões autenticadas do ADVBOX e Legal One em um navegador local persistente;
- portais judiciais com certificado A1, desde que cada origem exata seja cadastrada e validada.

O termo principal já vem protegido contra exclusão acidental: **Advogado Monitorado — OAB/UF 000000**.

## O que já funciona

- painel diário com intimações novas, prazos próximos, tarefas e saúde das fontes;
- caixa de entrada para triagem de intimações, com as partes identificadas ao lado do número do processo;
- criação de tarefa a partir de uma intimação;
- Kanban com arrastar e soltar;
- cadastro e acompanhamento de processos, inclusive indicador de segredo de justiça;
- consulta protegida de contatos importados, com busca por nome, documento, telefone, e-mail e origem;
- edição de contatos, processos, compromissos, intimações, fontes e termos em janelas internas da própria Central;
- catálogo de configurações replicado da ADVBOX: usuários, tarefas e pontos, grupos, tipos de ação, etapas, metas, origens, caixa de entrada, notificações e integrações;
- edição e inclusão de itens em todos os catálogos de configuração replicados;
- atribuição de tarefa a partir da intimação com definição pontuada, responsáveis, comentário, prazo interno, prazo fatal e histórico;
- abertura do formulário completo ao clicar em prioridades do dia ou em qualquer cartão do Kanban;
- agenda e conversão automática dos eventos Webcal do ADVBOX em tarefas;
- importação manual de JSON como rota de contingência;
- armazenamento local criptografado e trilha de auditoria;
- agente de coleta com sessão persistente, login/QR/2FA manual e suporte a A1;
- consulta diária ao DJEN pela API pública oficial Comunica PJe, com variantes usuais da OAB, paginação defensiva, cancelamentos e certidão oficial;
- adaptador PJe somente de leitura para as abas Expedientes e Acervo, usando o PJeOffice Pro oficial instalado no Windows;
- coletor estruturado do eproc TJRS 1º grau, TJRS 2º grau e Justiça Federal/RS, com paginação de processos, prazos abertos e intimações pendentes;
- sincronização silenciosa ao abrir o painel e a cada cinco minutos, adiada automaticamente enquanto houver formulário em edição;
- autenticação obrigatória por senha forte e TOTP, com opção de confiar neste navegador por 30 dias;
- botões de exibir/ocultar em todos os campos de senha e segredo da interface;
- códigos de recuperação de uso único, limitação de tentativas e encerramento de sessão;
- sessão HttpOnly/SameSite e proteção CSRF para operações de escrita;
- bloqueio HTTP de `.env`, arquivos de dados, código do servidor e configuração do coletor;
- cabeçalhos CSP, anti-iframe, no-sniff e política restritiva de permissões;
- instalador opcional de tarefa diária do Windows.
- catálogo judicial organizado com TJRS, TJSC, TJSP/e-SAJ, TJMT, TRT4 e TRFs 1 a 6;
- redefinição segura dos acessos judiciais, preservando o A1 e removendo sessões e vínculos TOTP;

## Iniciar o painel

É necessário ter Node.js instalado.

1. No PowerShell, entre nesta pasta.
2. Execute `corepack enable` e `pnpm install --frozen-lockfile`.
3. Execute `pnpm start`.
4. Abra `http://127.0.0.1:4173`.

Na primeira inicialização, o servidor cria automaticamente no `.env` três segredos aleatórios: assinatura de sessão, criptografia do TOTP e autenticação do coletor. O arquivo está excluído do Git e não pode ser servido pela aplicação.

No primeiro acesso, a Central pede:

1. usuário e senha com ao menos 10 caracteres;
2. leitura do QR code em um aplicativo autenticador;
3. confirmação do primeiro código TOTP;
4. armazenamento dos oito códigos de recuperação de uso único.

O hash da senha usa `scrypt`; a chave TOTP, o estado jurídico da interface e o estado intermediário do coletor ficam criptografados com AES-256-GCM nos arquivos locais. A sessão normal expira após oito horas, ou após trinta minutos sem atividade. Ao marcar **Confiar neste navegador por 30 dias**, a Central grava um identificador aleatório em cookie `HttpOnly`/`SameSite=Strict`; apenas o hash desse identificador é persistido, vinculado ao navegador. A confiança sobrevive a reinícios do servidor e é revogada ao sair da conta, pelo botão **Esquecer este navegador** em Integrações ou após 30 dias. Depois do cadastro, todas as APIs jurídicas exigem sessão autenticada e operações de escrita também exigem um token CSRF.

Guarde uma cópia protegida do `.env`. A chave `AUTH_ENCRYPTION_KEY` é necessária para recuperar os dados locais criptografados; perdê-la torna o conteúdo de `data/app-state.json` irrecuperável.

O painel funciona sem configuração externa, inicialmente com dados claramente identificados como demonstração.

## Importar relatórios XLSX da ADVBOX

O importador reconhece automaticamente os relatórios de contatos, processos e atividades, deduplica os registros e grava o resultado diretamente no estado AES-256-GCM. Os dados pessoais não são transformados em JSON público e não entram no Git.

```powershell
pnpm import:spreadsheet "C:\caminho\processos.xlsx" "C:\caminho\contatos.xlsx" "C:\caminho\atividades.xlsx"
```

A ordem dos três arquivos é indiferente. As atividades viram tarefas do Kanban e compromissos de agenda; pontuação, destinatário, processo, protocolo, prazo fatal e conclusão são preservados quando existirem no relatório.

A importação é idempotente: os registros anteriormente originados dos mesmos relatórios são substituídos pela nova leitura, sem duplicar contatos, processos ou atividades. O servidor também usa revisão otimista do estado; uma aba antiga não consegue sobrescrever silenciosamente uma importação mais recente e precisa recarregar a versão atual.

## Ativar a agenda ADVBOX

A URL Webcal funciona como uma senha de leitura. Como uma URL foi publicada em uma conversa, revogue-a no ADVBOX e gere outra antes de usar.

1. Abra o `.env` criado automaticamente pelo servidor.
2. Coloque a nova URL somente em `ADVBOX_WEBCAL_URL`.
3. Reinicie o servidor.
4. Clique em **Sincronizar** no painel.

O servidor transforma cada compromisso em item de agenda e tarefa de triagem. O segredo do calendário não é enviado ao navegador e `.env` está bloqueado no Git.

## Primeira coleta dos portais

1. Ajuste as fontes locais em `collector/portals.json`. Esse arquivo está excluído do Git.
2. Mantenha `COLLECTOR_HEADLESS=false` e `COLLECTOR_INTERACTIVE=true` no `.env` durante a primeira execução.
3. Com o painel em execução, rode `npm run collector`.
4. Na janela aberta pelo coletor, conclua pessoalmente a seleção do certificado, login, CAPTCHA ou 2FA quando solicitado.
5. O coletor percorre as fontes habilitadas, pagina os processos do eproc, consulta o DJEN, lê as listas visíveis de Expedientes/Acervo do PJe e enriquece todos os números conhecidos no DataJud.
6. Rode novamente sem intervenção e confira a página **Monitoramento** antes de ativar o modo sem janela.

A sessão fica em `collector/.profile`, somente neste computador, e a pasta não entra no Git. Por padrão, o coletor não preenche nem armazena senha e não tenta contornar CAPTCHA, QR code ou 2FA. Links temporários e hashes de sessão do eproc são descartados antes da gravação. O preenchimento local de TOTP existe apenas como opção explícita, fica desligado e só aceita as origens exatas configuradas.

Os seletores iniciais importam tarefas visíveis do ADVBOX e processos visíveis do Legal One. Interfaces desses fornecedores podem mudar; por isso toda execução registra sucesso, atenção ou falha por fonte.

## Ativar o certificado A1

Não copie o certificado para o repositório e não envie o arquivo ou a senha em chat.

Há três modos distintos; eles não são intercambiáveis:

- `certificateMode: "windows-store"`: usa o certificado já instalado no repositório pessoal do Windows e não exige copiar o PFX para o projeto. A seleção inicial do certificado continua sendo feita pelo titular.
- `certificateMode: "pjeoffice"`: usa o PJeOffice Pro oficial do CNJ/TRF3 para o login e a assinatura do desafio do PJe. O coletor não acessa a chave privada diretamente.
- `certificateMode: "pfx-mtls"`: apenas para portais que realmente usam certificado cliente TLS. Mantenha o PFX fora do projeto e preencha `A1_PFX_PATH` e `A1_PFX_PASSPHRASE` somente no `.env.collector` local.

Em `collector/portals.json`, cada portal deve ter sua **origem oficial exata**, `usesCertificate: true` e o modo escolhido. Faça a primeira execução com janela visível e valide o resultado antes de usar `COLLECTOR_HEADLESS=true`.

O certificado é apresentado somente às origens explicitamente permitidas no arquivo de configuração. Um portal novo nunca deve ser habilitado sem conferir sua URL oficial, seus termos de uso e a autorização de acesso.

### PJe e PJeOffice Pro

O PJe não faz um simples mTLS com o arquivo A1. A página entrega um desafio ao PJeOffice local; o aplicativo oficial assina o desafio com a chave do certificado e devolve a resposta ao tribunal. O SSO então cria a sessão do navegador. Nesta máquina, o PJeOffice Pro foi detectado em execução e respondeu corretamente em `127.0.0.1:8800` e `127.0.0.1:8801`.

As entradas de TJMT 1º/2º grau e TRF1 1º/2º grau já estão preparadas em `collector/portals.json`, mas permanecem desligadas até o primeiro login acompanhado. Para ativar uma delas:

1. altere somente o campo `enabled` da origem escolhida para `true`;
2. deixe o PJeOffice Pro aberto;
3. execute `npm run collector` com janela visível;
4. selecione o A1 e conclua o 2FA pessoalmente;
5. confira a página Monitoramento e rode uma segunda vez para validar o reaproveitamento da sessão.

O adaptador pode alternar apenas entre as abas seguras `Expedientes` e `Acervo`. Expressões como **Tomar ciência**, **Visualizar expediente**, **Responder**, **Peticionar**, **Assinar** e **Protocolar** são bloqueadas. O sistema registra o item pendente para revisão humana, sem iniciar prazo por clique do robô.

Para TOTP automático, primeiro revogue os QR Codes que já foram expostos e faça um novo pareamento no PJe/PDPJ. Depois, e somente se aceitar o risco de deixar certificado e segundo fator no mesmo computador, use o assistente interno descrito abaixo. As variáveis `PJE_TOTP_SECRET` e `ALLOW_AUTOMATED_PORTAL_TOTP` permanecem apenas como compatibilidade para instalações antigas; o cofre cifrado é o caminho recomendado.

### Ativação pela interface da Central

Em **Integrações → Certificado digital e 2FA → Gerenciar A1 e 2FA**, a Central oferece um assistente semelhante ao fluxo de cobertura ampliada da ADVBOX:

1. selecione o arquivo `.pfx`/`.p12` e informe a senha atual;
2. o servidor local valida o contêiner pelo armazenamento criptográfico do Windows;
3. marque os tribunais que devem ser monitorados;
4. no site oficial de cada PJe/PDPJ, ative ou redefina o 2FA e gere um QR novo;
5. leia esse QR também no seu aplicativo autenticador pessoal;
6. selecione na Central uma imagem do mesmo QR ou informe a chave Base32 mostrada pelo portal;
7. informe o código atual de seis dígitos para provar que o vínculo está correto;
8. clique em **Abrir primeira conexão** e conclua uma vez a seleção do A1, CAPTCHA ou confirmação oficial que aparecer.

O QR é sempre gerado pelo portal judicial, nunca pela Central. QR de exportação do Google Authenticator (`otpauth-migration`) é rejeitado; somente o QR TOTP de ativação do portal é aceito. Depois da validação, a interface apaga o segredo dos campos e exibe somente o estado “vinculado”.

O PFX, sua senha e os segredos TOTP são gravados em `data/judicial-integrations.json` dentro de um envelope AES-256-GCM. O arquivo é ignorado pelo Git e não contém caminho, senha ou segredo legível. O agente diário abre esse cofre localmente com a chave-mestra da Central. Credenciais antigas em `.env.collector` podem ser migradas uma vez com `node scripts/migrate-judicial-secrets.mjs`.

No Windows, a validação do PFX usa o armazenamento criptográfico do próprio sistema com um caminho de módulos isolado. Isso evita que instalações paralelas do PowerShell contaminem a validação e produzam uma falsa mensagem de senha inválida antes mesmo de o certificado ser examinado.

### DJEN / Comunica PJe

O DJEN não precisa de certificado. A fonte `djen-cnj` consulta diretamente `https://comunicaapi.pje.jus.br/api/v1/comunicacao`, com OAB/UF 000000, janela sobreposta de três dias e deduplicação pelo ID oficial. O texto HTML é convertido em texto neutro, publicações canceladas são mantidas como canceladas e o coletor não calcula prazo fatal automaticamente.

### DataJud / CNJ

A fonte `datajud-cnj` consulta diariamente todos os números de processo já conhecidos, incluindo os mantidos no estado local cifrado quando uma sessão de tribunal tiver expirado. A partir do número CNJ, o coletor seleciona o índice oficial do tribunal, atualiza classe, assunto, órgão e movimentações e cria uma tarefa idempotente apenas quando encontra uma movimentação posterior. Ele nunca inventa prazo jurídico.

A chave pública fica em `.env.collector`, arquivo ignorado pelo Git. Se o CNJ responder 401 ou 403, o agente busca a chave vigente exclusivamente em `https://datajud-wiki.cnj.jus.br/api-publica/acesso/` e repete a consulta uma vez. O valor renovado fica apenas na memória daquela execução.

## Agendar a coleta diária

Depois que todas as fontes tiverem sido testadas manualmente, execute no PowerShell:

```powershell
.\collector\install-scheduler.ps1 -DailyAt '06:30'
```

O agendamento usa a sessão do usuário do Windows, roda sem janela, começa assim que possível quando o horário foi perdido, ignora uma segunda instância simultânea e faz até duas novas tentativas após falha. O executor inicia a Central local em segundo plano se ela ainda não estiver aberta. Fontes que pedirem novo QR, CAPTCHA, 2FA ou renovação do A1 ficarão marcadas como **Atenção** — o sistema não tenta burlar esses controles.

## Hospedar o painel

A hospedagem gratuita recomendada é híbrida: interface e banco com RLS na nuvem, enquanto o coletor com A1 e PJeOffice permanece no Windows do escritório. O certificado, sua senha, os QR Codes, os segredos TOTP e o perfil autenticado jamais devem entrar na imagem Docker, no provedor web ou no repositório. Consulte `CLOUD_DEPLOYMENT.md` antes de publicar. As configurações gratuitas de Render e Vercel são adequadas apenas para pré-visualização enquanto a persistência no Supabase não estiver conectada ao painel.

## Formato para importação manual

O botão **Importar JSON** aceita um objeto com uma ou mais coleções:

```json
{
  "intimations": [],
  "tasks": [],
  "processes": [],
  "agenda": []
}
```

Isso permite incorporar exportações autorizadas enquanto um conector específico ainda está sendo ajustado.

## Supabase e Row Level Security

A versão atual não envia os dados jurídicos ao Supabase. Ela permanece local até existir uma decisão explícita de hospedagem, região, retenção e controle de acesso.

Para uma futura hospedagem, a migração [202608170001_secure_rls.sql](supabase/migrations/202608170001_secure_rls.sql) cria uma estrutura multiusuário por escritório com RLS em todas as tabelas:

- workspaces e membros;
- termos monitorados;
- fontes de coleta;
- processos e marcação de sigilo;
- intimações;
- tarefas;
- eventos de agenda;
- auditoria sem políticas de atualização ou exclusão.

O papel `anon` não recebe acesso às tabelas. Usuários autenticados só enxergam linhas de workspaces dos quais são membros. Exclusões sensíveis ficam limitadas ao proprietário e a chave `service_role` deve existir exclusivamente no backend.

Antes de hospedar:

1. crie um projeto Supabase separado para produção;
2. revise e aplique a migração;
3. cadastre o primeiro usuário e workspace;
4. exija MFA/AAL2 no Supabase Auth e nas políticas que precisarem de garantia adicional;
5. configure `SUPABASE_URL` e as chaves apenas no ambiente da hospedagem;
6. nunca coloque `service_role` no navegador;
7. execute testes positivos e negativos com dois usuários de workspaces diferentes.

Uma chave `anon` de uma integração antiga foi encontrada no histórico do projeto e removida do código atual. Se aquele projeto Supabase ainda existir, revise suas políticas e rotacione a chave no painel antes de reutilizá-lo. O histórico do Git pode continuar contendo versões anteriores até ser limpo separadamente.

## Testes de segurança

Execute a suíte completa com:

```powershell
pnpm test
```

Ela valida senha fraca, cadastro TOTP, códigos de recuperação, reutilização de código, sessão, logout, CSRF, bloqueio após tentativas inválidas, CSP, proteção contra iframe, bloqueio de arquivos privados, criptografia do estado principal e da coleta intermediária, importação real de planilhas, deduplicação, pontuação das tarefas, parsing seguro do DJEN, restrição de origem do PJe e o fluxo visual completo do Kanban.

## Limites importantes

- A central auxilia a organização, mas não substitui a consulta ao portal oficial, ao Diário de Justiça ou ao sistema do tribunal.
- Uma movimentação encontrada não deve gerar prazo fatal automaticamente sem leitura e confirmação humana.
- Processos em segredo de justiça só podem ser lidos dentro de uma sessão em que o próprio usuário tenha autorização. O sistema não amplia permissões.
- As funções marcadas como “consulta oficial preparada” dependem da habilitação individual de cada fonte.
- O Webcal traz compromissos da agenda; ele não equivale à API completa do ADVBOX.

## Arquitetura

```text
Webcal ADVBOX ───────────────┐
                            │
ADVBOX / Legal One ─ agente local ─ servidor local ─ painel Keller
                            │                    ├─ intimações
PJe ─ PJeOffice oficial ─────┤                    ├─ processos
eproc ─ sessão local ────────┤                    ├─ agenda
DJEN ─ API pública CNJ ──────┘                    └─ Kanban/auditoria
```

Nenhum segredo é necessário no código-fonte. O arquivo `.env`, o perfil autenticado e os certificados estão excluídos do versionamento.
