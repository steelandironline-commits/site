# Progresso · Tem CNPJ / Tem CPF

Plano: `docs/PLANO_DIVISAO.md` · Inventário: `docs/divisao/INVENTARIO.md` · Arquitetura: `docs/divisao/ARQUITETURA.md` · Deploy: `docs/divisao/DEPLOY_AREAS.md` · Go-live: `docs/divisao/GO_LIVE.md`

Atualizado: 2026-10-20 (ETAPA 8)

## Etapas

| Etapa | Modelo | Estado | Último commit | No remoto? | Entrega |
|---|---|---|---|---|---|
| 0 · Inventário | Opus (`arquiteto`) | Concluída | `321511e` | Sim | `INVENTARIO.md`, subagentes em `.claude/agents/` |
| 1 · Arquitetura | Opus (`arquiteto`) | Concluída, sobre premissas (Q1 a Q14 sem resposta) | `6ebbb4c` | Sim | `ARQUITETURA.md`, contrato das etapas 2 a 8 |
| 2 · Base compartilhada | Sonnet (`implementador`) | Concluída | `42ca129` | Sim | `packages/ui` (`@autopix/ui`) |
| 3 · Roteamento por host e temas | Sonnet (`implementador`) | Concluída | `e537e48` | Sim | `packages/areas`, `hostArea`, builds por área, SPA por host |
| Hotfix do cadastro | — | Concluído e publicado | `09348bc` | Sim | Rascunho com taxa em jogo só reiniciado pela sessão do dono |
| 4 · Autenticação e API isoladas (4a, 4b, 4c) | Opus desenha, Sonnet implementa | Concluída | `3d9bf56` (4a `05e0b7f`, 4b `4c126c6`) | **Não** | Sessão e tokens com área, migração aditiva, `mountArea` em toda montagem, filtros de área nos serviços |
| 5 · Separação das telas e funções | Sonnet (`implementador`) | Concluída | `acc4e7d` | **Não** | Telas por área, cópia por build, `GET/PUT /api/profile` |
| 6 · Textos, SEO e identidade | Haiku (`auxiliar`) | Concluída, sobre a premissa de marca (Q7 em aberto) | `7791d57` | **Não** | Marca lida da área, metadados, manifest, robots e sitemap por host, rodapé por área, lint em todo o servidor |
| 7 · Testes de isolamento, CI e deploy | Sonnet (`implementador`) | Concluída | `a4db776` | **Não** | `test:isolation`, `test:e2e`, CI, `DEPLOY_AREAS.md` |
| 8 · Revisão final | Opus (`arquiteto`) | **Concluída. Aguardando sua autorização para publicar** | sem commit (você faz) | **Não** | Revisão, `GO_LIVE.md`, este relatório |

O remoto está em `09348bc`. Há 66 commits locais à frente (ETAPAS 4a a 7), mais os documentos da ETAPA 8. Nada foi publicado.

## Números

**Testes (`npm test`, rodado na ETAPA 8):** 1176 verdes. shared 32, areas 43, core 90, api 826, web 185. Histórico: 228 na ETAPA 2, 612 na base da 4c, 702 na ETAPA 5, 735 depois da ETAPA 6, 1176 na ETAPA 7.

**Suíte de isolamento (`npm run test:isolation`, rodada na ETAPA 8, com banco e build):** 485 casos, 0 falhas, 0 pulados. Por item: a 194, b 90, c 96, d 77, e 28.

**Lint (`npm run lint`):** verde (`node --check` em todo `apps/api/src`, `apps/worker/src` e `packages/*/src`).

**Ponta a ponta (`npm run test:e2e`):** 19 cenários verdes e 1 `test.fixme` (favicon com arte própria, Q7). Número da ETAPA 7; não rodado de novo na ETAPA 8.

**Builds (ETAPA 8, nesta máquina):** legado 10,6 s, áreas 17,1 s. `dist` 3.037.058 bytes, `dist-cnpj` 3.021.297, `dist-cpf` 1.775.575. Primeira carga em gzip: legado 254.831, CNPJ 228.717, CPF 134.297.

### Código compartilhado: 62,6%

**Método** (definido antes de medir):

1. Conta linhas **não vazias** de código-fonte `.js`, `.jsx` e `.mjs`. Fora: testes, fixtures, `node_modules`, builds (`dist*`), CSS e imagens. Em `apps/web/areas/*` entram também os textos `.html`, `.webmanifest`, `.txt` e `.xml`.
2. **Compartilhado:** `packages/shared/src`, `packages/core/src`, `packages/ui/src`, `packages/areas/src` (menos `brand/cnpj.js` e `brand/cpf.js`), `apps/api/src`, `apps/worker/src`.
3. **Específico de área:** `apps/web/src/areas/<área>`, `apps/web/areas/<área>` e a marca da área (`packages/areas/src/brand/<área>.js`). As cópias por área (`areas/<área>/copy.js`) já estão dentro das pastas da área.
4. **O resto de `apps/web/src`** (`pages`, `components`, `lib`) é classificado pelo grafo real de cada build (`dist-cnpj/modules.json` e `dist-cpf/modules.json`): nos dois builds, compartilhado; só num, específico daquela área; em nenhum, legado.
5. **Legado** (`src/legacy/`, `src/App.jsx`, `src/main.jsx`, `src/legacyNav.js` e o que só ele usa, como `Admin.jsx`): fora do total, porque sai depois do go-live. São 1.256 linhas.

**Resultado:** 31.146 linhas. Compartilhado 19.507 (**62,6%**), só CNPJ 10.890 (35,0%), só CPF 749 (2,4%). Sem as linhas de comentário: 61,0%, 36,6% e 2,4%.

| Leitura | Valor |
|---|---|
| Do ponto de vista do CPF (compartilhado ÷ tudo o que serve ao CPF) | 96,3% |
| Do ponto de vista do CNPJ | 64,2% |
| Só o que vai ao navegador (módulos de código nos dois grafos) | 34,6% nos dois builds, 61,7% só no CNPJ, 3,7% só no CPF |
| Variante estrita (código de servidor que só serve montagens do CNPJ, como pagamentos, finanças, cargas, equipes, licitações e agentes, contado como CNPJ) | cerca de 40% (aproximado) |

**Ressalvas.** O que está em `apps/web/src/pages`, `components` e `lib` também é usado pelo build legado. Se tudo isso fosse contado como compartilhado, o número subiria para 95%, mas 10.221 dessas linhas só entram no build do CNPJ (home, checkout, pagamentos, cargas, equipes, licitações, oportunidades, agentes, empresa, plano). **O plano estimava 85% a 90%; o número real é 62,6%.** A diferença vem do produto, não da técnica: o Tem CPF ainda é pequeno (Q3, Q4 e Q13 tiraram dele Pagamentos, Cargas, Equipes e Intermediação), e quase todo o código de negócio é do lado da empresa. O que o CPF usa é quase todo comum (96,3%).

## Aguardando você

- [ ] **Aprovação do backup** (ARQUITETURA 7.3, `GO_LIVE.md` seção 3) e **do push** dos 66 commits com a migração `20261020120000_area_isolation`.
- [ ] **Q3 e Q4:** o que a área CPF recebe de Pagamentos, Cargas, Equipes e Intermediação, e de quem é a conta de repasse.
- [ ] **Q6:** `ADMIN_HOST` próprio ou admin no host CNPJ. No modo de áreas o admin hoje fica sem tela (achado 1 abaixo).
- [ ] **Q7:** marca. Define a arte dos ícones (hoje iguais nas duas áreas e no legado) e o remetente.
- [ ] **Q13:** os dados atuais são reais? Cargas e Equipes (DEMO) vão ao ar?
- [ ] **Q14:** domínios `temcnpj.com.br` e `temcpf.com.br` comprados, e provedor de DNS do apex com ALIAS ou flattening.
- [ ] Novo na ETAPA 8: **Q10**, aceitar por escrito o resíduo do catálogo de perfil operacional (achado 2) ou dividir o catálogo.
- [ ] Novo na ETAPA 8: o que fazer com o endereço de hoje (host de `APP_URL`) depois do go-live: 301 para o CNPJ ou 404 (`GO_LIVE.md`, G8).
- [ ] Autorização para publicar (PLANO, ETAPA 8, item 4).

## ETAPA 8 · Revisão final

Revistos: o fim da 4c (`5be8762`, `d341283`, `fb3189f`, `3d9bf56`), a ETAPA 5 (`af15b7a`..`acc4e7d`), a ETAPA 6 (`d2b8813`..`7791d57`) e a ETAPA 7 (`22b7202`..`a4db776`), mais uma passada pelos canais que cruzam áreas no código atual (HTTP, SPA e arquivos estáticos, sessão e token, WhatsApp, e-mail, push, SSE, worker, feed social, transações).

**Veredito de segurança:** pode ir ao go-live depois das aprovações, com condições. Nenhum achado abre acesso de uma área à outra nem expõe dado pessoal de uma área na outra. As condições são funcionais (admin sem tela, cadastro do CPF depende do e-mail) e uma decisão de critério de pronto (resíduo de texto do catálogo).

### Isolamento

- **HTTP:** toda montagem passa por `mountArea`, com `onlyArea` antes da autenticação; `/api/profile` só no CPF. Sessão `ADMIN` no host CNPJ só alcança as montagens que declaram `ADMIN`.
- **Sessão e token:** cookie por área, host-only, `__Host-` em produção; o servidor confere dono e host em todo pedido, cookie ou bearer.
- **Ordem dono e host** (`authService.js:95-107`): o código confere o dono primeiro (sessão de área diferente da do dono: revogada, 401) e depois o host (403 `WRONG_AREA`). A seção 6.3 da arquitetura diz o contrário. **Não muda a segurança:** as duas checagens são feitas sempre, e as duas negam. Conferir o dono primeiro é até mais forte, porque revoga a sessão incoerente em qualquer host. A única diferença visível é 401 em vez de 403, e só para quem já tem o token. Fica a correção do texto da 6.3.
- **SPA e estáticos:** cada host lê só o seu `dist`; `modules.json` e `index.html` nunca saem como arquivo; robots, sitemap, canonical e manifest citam só o próprio host.
- **Canais sem host** (worker, WhatsApp, e-mail, push): links por `urlFor(área do destinatário)`; ações negadas pela área do dono em todo canal. Feed social filtra post, repost, comentário, contagem e foto pela área do autor. Transações escondem a contraparte de outra área.
- **Modo legado:** sem regressão encontrada. Testes do legado verdes. O build legado foi refeito no commit publicado (`09348bc`) e comparado com o atual: os textos são os mesmos; a marca passou a ser lida em tempo de execução e no legado continua "TemPix". Novidades só aditivas: `area: null` em `/api/me` e `/api/session`, e `/api/profile` existe para conta `PERSON` (o legado não usa).
- **IDOR na área:** nada novo. `/api/profile` usa sempre `req.user`; desafios por `userId`; cargas e equipes por `companyId`; foto do feed pela área.

### LGPD (fatos e dúvidas, não parecer jurídico)

Onde há dado pessoal gravado hoje:

| Onde | O quê |
|---|---|
| `User` | nome, e-mail, CPF ou CNPJ (`loginId`), hash da senha |
| `Company` | nome (da pessoa, nas contas `PERSON`), CNPJ, telefone, CEP, cidade, descrição, serviços, perfil operacional |
| `Session`, `LoginChallenge` | IP, navegador; agora também `area` |
| `ActivationToken`, `PasswordResetToken` | ligação com o usuário; agora também `area` |
| `WhatsAppConnection`, `WhatsAppMessage`, `WhatsAppPendingCommand` | telefone, conteúdo das mensagens |
| `PushSubscription` | endpoint do navegador e navegador |
| `Payment`, `PaymentEvent`, `MarketplaceTransaction`, `Payout` | documento e dados do pagador, e-mail do comprador, chave de repasse |
| `WorkforceMatch`, `FinancialAuditLog` | e-mail do candidato da entrevista |
| `ActionLog.input` | a entrada de cada ação, sem senhas e tokens (pode ter telefone, endereço, documento) |
| `ActivityEvent`, `DomainEvent`, `SocialPost`, `SocialComment` | nomes em descrições, textos e fotos |
| Logs | não há dado pessoal novo; o log de erro grava só nome, mensagem e código |
| Navegador | nenhum dado pessoal em `localStorage` (o cadastro apaga o rascunho antigo); cookie só com o token |

O que a 4c e a ETAPA 5 mudaram: **nenhuma cópia nova de CPF, e-mail ou telefone.** A 4c só mudou regras de resposta (e tirou da resposta a contraparte de outra área). A coluna `area` (4a) diz se a conta é de pessoa ou de empresa, o que já se deduzia de `Company.accountType`. `/api/profile` lê e grava as mesmas colunas de `Company`, devolve o CPF mascarado (calculado, não gravado) e registra em `ActivityEvent` só os nomes dos campos mudados. Como não passa pelo `ActionEngine`, ele não grava a entrada em `ActionLog`: uma cópia a menos que o caminho de empresa, e também uma trilha de auditoria a menos (achado 7).

Dúvidas para registrar:

1. O dump do backup (7.3) é uma cópia completa fora da plataforma: falta definir guarda, prazo e descarte.
2. `ActionLog.input` guarda dado pessoal sem prazo de retenção definido.
3. Unicidade global (Q2): `onboarding/check` diz se um CPF ou e-mail já tem conta em qualquer área, e a conexão de WhatsApp diz se um número já está ligado a outra conta. Não dizem a área. Risco aceito pela premissa Q2, com limitador no primeiro caso.
4. Dados cruzados gravados antes do go-live (transações entre empresa e pessoa) continuam no banco; o modo de áreas só os esconde na resposta. Nada foi apagado, de propósito.

### Achados abertos

Do mais grave para o menos grave.

**Pesam no go-live:**

1. **Alto, funcional · admin da plataforma sem tela no modo de áreas.** `apps/web/vite.config.js:119` recusa `--mode admin`; `packages/areas/src/manifest.js:56` e `:105` deixam `/app/admin` e `Admin.jsx` fora do CNPJ; sem `dist-admin`, `apps/api/src/middleware/spa.js:66-71` responde 404 no `ADMIN_HOST`. Cenário: depois do passo 4 do go-live, o admin entra no host CNPJ e toda tela responde 404 (falha fechada, não vaza nada). Reembolso, disputa e conciliação ficam só pela API. Correção: decidir Q6 e construir o build `admin` (ARQUITETURA 5, `base: '/admin/'`), ou aceitar operar sem a tela até lá. R2 devolve a tela.
2. **Médio, critério de pronto · catálogo de perfil operacional comum.** `packages/shared/src/operations/modules.js` (por exemplo `:58`, `:91`, `:336`, `:457`). O bundle do CPF leva 18 ocorrências de "empresa" e "Empresa" ("Sobre sua empresa", "Sua empresa é"); o do CNPJ leva "autônomo" e "Profissional". O filtro é por `accountType` em tempo de execução, no navegador. Não é dado, mas fere a seção 2 do plano ("textos") e o critério "nenhum texto da área errada". Correção: dividir o catálogo por tipo de conta em exportações separadas, como já foi feito com a lista de preço, ou aceitar o resíduo por escrito (Q10).
3. **Médio, funcional · o Tem CPF depende do e-mail.** `packages/core/src/services/onboardingService.js:299-303`: o cadastro gratuito termina no link de ativação por e-mail; sem `EMAIL_PROVIDER` e `EMAIL_API_KEY` (hoje não configurados em produção), nenhuma pessoa conclui o cadastro. Já era assim no legado, mas no modo de áreas é o único caminho do CPF. Correção: configurar o e-mail antes do passo 4.

**Podem ficar para depois:**

4. **Baixo, documento · ordem dono e host.** `packages/core/src/services/authService.js:95-107` contra a ARQUITETURA 6.3. Sem efeito de segurança (ver Isolamento). Correção: ajustar o texto da 6.3.
5. **Baixo, desempenho · `react-reconciler` no chunk `react`.** `apps/web/vite.config.js:48` manda tudo o que tem `node_modules/react` no nome para o chunk `react`, pré-carregado na entrada. No CNPJ (e no legado) isso inclui o `react-reconciler` do 3D da home, que só o chunk `three` (carregado sob demanda) usa: cerca de 37 KB em gzip a mais na primeira carga. Correção: mandar `react-reconciler`, `react-use-measure` e as dependências do `@react-three` para o chunk `three` antes da regra do `react`.
6. **Baixo · `X-Forwarded-Host` decide a área.** `apps/api/src/app.js:48` (`trust proxy 1`) e `apps/api/src/middleware/area.js:63`. Não é furo de autorização. Com um cache ou CDN na frente, um pedido forjado poderia guardar a resposta de uma área no endereço da outra, ou um 404 no lugar de um arquivo. Correção: conferir no go-live que a borda do Railway sobrescreve o cabeçalho e que não há cache; se um dia houver, mandar `Cache-Control: no-store` nos 404 neutros.
7. **Baixo, auditoria · `PUT /api/profile` fora do `ActionEngine`.** `apps/api/src/routes/profile.js:36-38`. O perfil de empresa passa pela ação `UPDATE_COMPANY_PROFILE` (papéis, canal, `ActionLog`); o da pessoa grava direto (papéis conferidos por `requireRole`, `ActivityEvent` com os nomes dos campos). Correção: decidir se o CPF precisa da mesma trilha; se sim, criar a ação `UPDATE_PERSON_PROFILE` com `areas: ['CPF']`.
8. **Baixo · domínio fixo nos estáticos.** `apps/web/areas/cnpj/index.html:10,13`, `apps/web/areas/cpf/index.html:10,13`, `robots.txt` e `sitemap.xml` das duas áreas citam `temcnpj.com.br` e `cpf.temcnpj.com.br` como texto, contra a premissa Q14 (host por variável). Se o domínio mudar, são oito arquivos e um build. Correção: gerar esses valores no build a partir de uma variável, ou confirmar os domínios (Q14).
9. **Informativo · WhatsApp de quem tem as duas contas.** `packages/core/src/whatsapp/WhatsAppConnectionService.js:52`: o número é único no sistema, então a pessoa com conta de empresa e de pessoa só liga o WhatsApp a uma das duas (Q2, Q11).

### Desempenho e duplicação

- **Os dois bundles não dividem arquivo no servidor:** cada `dist` tem a sua cópia de React, `motion`, `@autopix/ui` e `@autopix/shared`. Só 73 arquivos são idênticos entre os dois (fontes, 5 CSS e 2 módulos de CSS de autenticação, 810.311 bytes). Para o usuário isso não pesa, porque cada um baixa só a sua área; pesa só no disco da imagem (cerca de 4,8 MB a mais).
- **`@autopix/shared` nos dois:** o catálogo de perfil operacional (cerca de 1.200 linhas) vai inteiro aos dois bundles, com o vocabulário das duas áreas (achado 2). O resto do pacote sai do bundle quando a área não usa (`treeshake.moduleSideEffects` no build das áreas).
- **Duplicação no código-fonte:** `copy.js`, `OperationsPage.jsx` e `SettingsPage.jsx` existem em três versões (CNPJ, CPF e legado), parecidas por desenho (cada build com a sua cópia). O cadastro legado (`src/legacy/Onboarding.jsx`, 688 linhas) repete o motor comum (`OnboardingFlow.jsx`). Ícones e favicon são o mesmo arquivo nas duas áreas e no legado (Q7). Tudo do legado sai depois do go-live (1.256 linhas).
- **Build:** o worker também roda `npm run build` (`railway.ts`), então também constrói as áreas sem usá-las: 20 a 30 s a mais por deploy, nos dois serviços.
- **Primeira carga:** CNPJ 10% menor que o legado; CPF 47% menor.

### Desvios do plano registrados nas etapas

1. Uma branch só (a designada da sessão), não uma por etapa.
2. ETAPA 1 escrita sobre premissas: Q1 a Q14 seguem sem resposta (ARQUITETURA 1).
3. ETAPA 2: só `packages/ui`. As regras comuns ficaram em `packages/shared`; `packages/core` é o backend; não existe `packages/auth` (ARQUITETURA 10 e 11, item 1).
4. `www.temcnpj.com.br` faz 301 para o apex em vez de servir a área (ARQUITETURA 11, item 2).
5. Rodapé por área, sem citar a outra: "Tem CPF não tem vínculo com a Receita Federal." e "Tem CNPJ não tem vínculo com a Receita Federal." (ARQUITETURA 11, item 3).
6. Terceira área de sessão, `ADMIN` (ARQUITETURA 11, item 4). O build `admin` previsto não foi feito (achado 1).
7. Coluna `area` só em sessão e tokens; a área dos dados de negócio vem do dono (ARQUITETURA 7.1 e 11, item 5).
8. O build legado convive com os de área até o go-live (ARQUITETURA 11, item 6).
9. Cinco hostnames (seis com o admin), não três (ARQUITETURA 11, item 7).
10. `/api/health` e `/api/webhooks/*` respondem em qualquer host (ARQUITETURA 11, item 8).
11. 4c: app nativo sem `Origin` não chama cadastro nem "esqueci a senha" no modo de áreas (ARQUITETURA 12, limitação conhecida).
12. ETAPA 4: o servidor confere o dono antes do host, ao contrário do texto da ARQUITETURA 6.3 (achado 4).
13. ETAPA 5: o catálogo de perfil operacional ficou comum, filtrado no navegador (achado 2).
14. ETAPA 5: `/api/profile` grava fora do `ActionEngine` (achado 7).
15. ETAPA 6 feita sem a decisão de marca (Q7): "Tem CNPJ" e "Tem CPF" nas áreas, "TemPix" no legado, no e-mail, no Web Push e no cabeçalho `X-TemPix-Client`; ícones iguais.
16. ETAPA 6: o domínio de produção ficou como texto nos estáticos (achado 8).
17. ETAPA 7: `npm run build` passou a gerar as áreas; o CI foi escrito e validado como YAML, mas nunca rodou no GitHub; 1 cenário de ponta a ponta em `fixme`.
18. ETAPA 7, item "arquivos": não há armazenamento de objetos; a separação é lógica, pela área do autor (ARQUITETURA 8).
19. As linhas das ETAPAS 3, 4 e 6 desta tabela não foram atualizadas por aquelas etapas; foram corrigidas aqui.

## ETAPA 0 · O que foi feito

- [x] Plano copiado para `docs/PLANO_DIVISAO.md`.
- [x] Subagentes criados: `arquiteto` (opus), `implementador` (sonnet), `auxiliar` (haiku).
- [x] Mapa do repositório (Explore, Haiku), conferido por grep nos pontos de decisão.
- [x] Classificação de cada item: 148 linhas em `CPF`, `CNPJ`, `COMUM`, `DÚVIDA` (contagem na seção Resumo do inventário).
- [x] 14 perguntas com recomendação, em `INVENTARIO.md`, seção "Perguntas para você responder".
- [ ] Respostas suas às perguntas. As etapas seguintes usaram as premissas da ARQUITETURA, seção 1.

### Achados que mudaram o plano

1. **A área CPF ainda não existia como produto.** Quase tudo de pessoa física estava no app de empresa com `accountType === 'PERSON'`.
2. **Cruzamentos entre áreas.** Equipes, Cargas, Intermediação, Pagamentos e Social conectam empresa e pessoa (Q3, Q4, Q9).
3. **Colaborador é CPF dentro de empresa** (Q1).
4. **Unicidade global.** `User.loginId` e `Company.cnpj` são únicos no sistema inteiro (Q2).
5. **Cookie** já era host-only. Trocar o nome para `__Host-` derruba todas as sessões (Q12).
6. **Stack real.** Não havia `areas/`, `packages/ui`, `packages/auth` nem `packages/areas`.

## ETAPA 1 · O que foi feito

`ARQUITETURA.md`: roteamento por host com 404, builds por área com fronteira, cookies host-only, área na sessão como `aud`, guarda por montagem, filtros nos serviços, migração só aditiva com backup e rollback R1 a R4, arquivos por área, DNS e SSL, riscos. Seções 11 (mudanças no plano) e 13 (em aberto).

## ETAPA 2 · O que foi feito

Só o `packages/ui`, como decidido na seção 11 (item 1) da arquitetura. As regras comuns seguem em `packages/shared`. Nada mudou para o usuário.

- [x] Pacote `@autopix/ui` criado, em `workspaces` e como dependência do `apps/web`.
- [x] Movidos com `git mv`: `components/ui`, `BRLIcon.jsx`, `brl-symbol.svg`, `Logo.jsx`, `PageLoader.jsx`, `AuthShell.jsx`, `PasswordInput.jsx`, `lib/api.js`, `hooks.js`, `session.jsx`, `pwa.js`, `activityStream.js`, `styles/tokens.css` e `styles/global.css`.
- [x] Testes: 228 antes e 228 depois. Build e lint verdes. Bundle conferido contra o build anterior.

## ETAPA 3 · O que foi feito

- [x] `packages/areas` (`@autopix/areas`): áreas, `areaOf`, `urlFor`, marca e o manifesto de páginas, montagens e arquivos exclusivos (só servidor, build e testes).
- [x] Variáveis `PUBLIC_HOST_*` e `ADMIN_HOST` no `loadConfig`, com falha na partida se só uma das duas áreas tiver host.
- [x] Middleware `hostArea` logo depois do `helmet`: área pelo host, 301 dos apelidos, 404 neutro para host desconhecido, infraestrutura em qualquer host.
- [x] Entradas, roteadores, menus e temas das áreas CNPJ e CPF; builds por área com o plugin `areaBoundary` e a lista de módulos; SPA de cada host servido do seu `dist`.
- [x] Testes T1 (config), T3 (legado inerte) e de host. `npm run dev:cnpj`, `dev:cpf` e `build:areas`.

## ETAPA 4 · O que foi feito

- [x] **4a:** enum `Area` e coluna `area` em `Session`, `LoginChallenge`, `ActivationToken` e `PasswordResetToken` (migração `20261020120000_area_isolation`, só aditiva); `cookieFor(área)`, `acceptedAreas`, `areaOfUser`; login, desafio de WhatsApp, ativação e nova senha por área; tipo de conta imposto pelo host; CORS e CSRF só para a origem da própria área; lint de migração.
- [x] **4b:** `onlyArea` e `mountArea` em toda montagem (tabela 6.5 e `API_MOUNTS`, com teste de deriva); `/api/admin` só para sessão `ADMIN`; `/api/config` por área; `ActionEngine` com `areas` em toda ação e todo canal; feed social, intermediação e painel por área; links de e-mail e WhatsApp pela área do destinatário; log de partida com `areas`.
- [x] **4c** (correções da revisão de segurança): contraparte de outra área fora de Pagamentos; busca de oportunidades só para empresa; ação de outra área com 404 também na sessão de cadastro; sessão `ADMIN` no host CNPJ só nas montagens de administração; contagens do feed por área; comandos de WhatsApp por área; limitador no convite de colaborador; cadastro em andamento com a mesma resposta nos dois hosts; rascunho com taxa em jogo só reiniciado pela sessão do dono; `/api/me` e `/api/session` com a área da sessão.

## ETAPA 5 · O que foi feito

- [x] **`/api/profile` (só no host CPF):** `GET`/`PUT` do perfil da conta `PERSON`, com a regra de `CompanyService`. Sem CNPJ, cobrança, comissão, equipe nem chave de repasse.
- [x] **Cadastro por área:** motor comum (`pages/onboarding/OnboardingFlow.jsx`) e um fluxo por área. O CNPJ termina na taxa única pelo Pix; o CPF é grátis e termina no link de ativação por e-mail. O cadastro de antes ficou em `src/legacy/`.
- [x] **Telas que as duas áreas dividem** pedem a cópia e as peças da área por props (`areas/cnpj/copy.js`, `areas/cpf/copy.js`, `src/legacy/copy.js`).
- [x] **CPF:** painel próprio, "Meu perfil" (`/app/perfil`) e perfil operacional pela fonte `/api/profile`.
- [x] **Mensagens de acesso por área** (`loginMessages`).
- [x] **Fronteira do build:** `areaBoundary` recusa o código do legado em qualquer área; o manifesto classifica os arquivos de empresa como exclusivos do CNPJ.
- [x] **Testes:** 702.

## ETAPA 6 · O que foi feito

- [x] Nome da marca lido da área em todas as telas, no catálogo de perfil operacional (token `{marca}`), no Web Push e no service worker. `PLAN.name` saiu do pacote comum.
- [x] Título, descrição, Open Graph, canonical, `theme-color`, manifest PWA, `robots.txt` e `sitemap.xml` por host.
- [x] Rodapé por área, sem citar a outra.
- [x] `npm run lint` em todo `apps/api/src`, `apps/worker/src` e `packages/*/src`; modo de áreas no README e no `.env.example`.
- [x] Testes: 735.

## ETAPA 7 · O que foi feito

Nada foi publicado: sem push, sem migração fora do banco local, sem mudança em `railway.ts`, `.env` nem DNS.

- [x] **Suíte de isolamento** (`npm run test:isolation`): 485 casos, por item a 194, b 90, c 96, d 77, e 28. Sem banco ou sem build, o grupo aparece como PULADO; com `CI=true` ou `--strict`, pular é falha.
- [x] **Marcadores de bundle** numa lista só (`packages/areas/src/markers.js`).
- [x] **Ponta a ponta** (`npm run test:e2e`): 19 cenários verdes e 1 `test.fixme`.
- [x] **CI** (`.github/workflows/ci.yml`): Node 22, Postgres 16, testes, lint, `build:areas`, `test:isolation`, Playwright. Não executado no GitHub.
- [x] **Deploy preparado** (`DEPLOY_AREAS.md`), seguro por `apps/api/test/deploy-areas.test.js`.
- [x] `npm run build` passou a rodar `build:areas` (sem ele, ligar as variáveis deixaria os dois hosts em 404).
- [x] **Testes:** 1176.

## Pendências abertas (fora do plano, já conhecidas)

- Revert de `COMPANY_SIGNUP_FEE_CENTS` para `20000` no Railway. Hoje está em `100`. Antes dos anúncios.
- `EMAIL_API_KEY` e `EMAIL_PROVIDER` não configurados. Ativação por e-mail não é enviada. **No modo de áreas isso impede todo cadastro no Tem CPF** (achado 3).
- Confirmar `DEMO_MODE=false` em produção.
- Rotacionar o `BB_CLIENT_SECRET`, que apareceu no chat.
- Teste ponta a ponta com Pix real. A primeira cobrança já gerou QR, mas falta fechar o ciclo com pagamento confirmado.
- Decisão de marca (Pix). Consultar advogado de propriedade intelectual antes de comprar domínio e anúncio com "TemPix" (Q7).
- Disponibilidade de `temcnpj.com.br` e `temcpf.com.br` no registro.br. Não confirmada (Q14).
- Decidir se "5% a 2%" sai do texto da landing, do plano e do checkout.

## Git

- Branch de trabalho: `claude/autopix-production-saas-yk053p` (a designada da sessão; o plano pedia uma por etapa).
- Remoto em `09348bc`. Local em `a4db776`, 66 commits à frente, mais os documentos da ETAPA 8 (sem commit).
- O push leva a migração junto. Só depois da aprovação do backup.

## Como retomar

1. Responda ao que está em "Aguardando você".
2. Siga `docs/divisao/GO_LIVE.md` na ordem, a partir do passo 1 (backup).
3. Antes do passo 4, resolva ou aceite os achados 1, 2 e 3 desta revisão.
