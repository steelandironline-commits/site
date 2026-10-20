# Progresso · Tem CNPJ / Tem CPF

Plano: `docs/PLANO_DIVISAO.md` · Inventário: `docs/divisao/INVENTARIO.md`

Atualizado: 2026-10-20

## Etapas

| Etapa | Modelo | Estado | Entrega |
|---|---|---|---|
| 0 · Inventário | Opus (`arquiteto`) | **Concluída. Aguardando aprovação** | `docs/divisao/INVENTARIO.md`, subagentes em `.claude/agents/` |
| 1 · Arquitetura | Opus (`arquiteto`) | **Concluída** | `docs/divisao/ARQUITETURA.md` (366 linhas, contrato das etapas 2 a 8) |
| 2 · Base compartilhada sem mudar comportamento | Sonnet (`implementador`) | **Concluída. Aguardando aprovação** | Pacote `packages/ui` (`@autopix/ui`). Testes, build e lint verdes |
| 3 · Roteamento por host e temas | Sonnet (`implementador`) | Não iniciada | — |
| 4 · Autenticação e API isoladas | Opus desenha, Sonnet implementa | Não iniciada | Revisão de segurança do `arquiteto` antes de seguir |
| 5 · Separação das telas e funções | Sonnet (`implementador`) | **Concluída. Aguardando aprovação** | Telas por área, cópia por build, `GET/PUT /api/profile`. Os dois bundles sem marcador cruzado |
| 6 · Textos, SEO e identidade | Haiku (`auxiliar`) | Não iniciada | Depende da decisão de marca (Q7) |
| 7 · Testes de isolamento, CI e deploy | Sonnet (`implementador`) | **Concluída. Aguardando aprovação** | `npm run test:isolation`, `npm run test:e2e`, `.github/workflows/ci.yml`, `docs/divisao/DEPLOY_AREAS.md`. Nada publicado |
| 8 · Revisão final | Opus (`arquiteto`) | Não iniciada | `GO_LIVE.md`. Publicação só com sua autorização |

## ETAPA 0 · O que foi feito

- [x] Plano copiado para `docs/PLANO_DIVISAO.md`.
- [x] Subagentes criados: `arquiteto` (opus), `implementador` (sonnet), `auxiliar` (haiku).
- [x] Mapa do repositório (Explore, Haiku), conferido por grep nos pontos de decisão.
- [x] Classificação de cada item: 148 linhas em `CPF`, `CNPJ`, `COMUM`, `DÚVIDA` (contagem na seção Resumo do inventário).
- [x] 14 perguntas com recomendação, em `INVENTARIO.md`, seção "Perguntas para você responder".
- [ ] Respostas suas às perguntas. **Bloqueia a ETAPA 1.**

## Achados que mudam o plano

1. **A área CPF ainda não existe como produto.** Quase tudo de pessoa física está no app de empresa com `accountType === 'PERSON'`. A ETAPA 3 cria mais tela do que move código.
2. **Cruzamentos entre áreas.** Equipes, Cargas, Intermediação, Pagamentos e Social conectam empresa e pessoa. A regra absoluta de isolamento exige uma decisão de produto (Q3, Q4, Q9).
3. **Colaborador é CPF dentro de empresa.** Não cabe em nenhuma das duas áreas sem regra nova (Q1).
4. **Unicidade global.** `User.loginId` e `Company.cnpj` são únicos no sistema inteiro (Q2).
5. **Cookie** já é host-only, o que ajuda. Trocar o nome para `__Host-` derruba todas as sessões (Q12).
6. **Stack real.** Não há `areas/`, `packages/ui`, `packages/auth` nem `packages/areas`. Serão criados. Ajustes de nome estão na seção "Adaptação à stack real" do inventário.

## ETAPA 2 · O que foi feito

Só o `packages/ui`, como decidido na seção 11 (item 1) da arquitetura. As regras comuns seguem em `packages/shared`. Nada muda para o usuário.

- [x] Pacote `@autopix/ui` criado, em `workspaces` e como dependência do `apps/web`. As dependências de interface (react, react-router-dom, framer-motion, lucide-react) têm as mesmas versões do `apps/web`.
- [x] Movidos com `git mv`: `components/ui` (`ui.jsx`, `ui.module.css`), `BRLIcon.jsx` e `brl-symbol.svg` (o `ui.jsx` depende deles), `Logo.jsx` e seu CSS, `PageLoader.jsx`, `AuthShell.jsx`, `PasswordInput.jsx`, `lib/api.js`, `hooks.js`, `session.jsx`, `pwa.js`, `activityStream.js`, `styles/tokens.css` e `styles/global.css`.
- [x] `auth.module.css` foi dividido: o shell e o campo de senha ficam no pacote; `row`, `notice`, `identity` e `subtitle`, usadas só pelas telas de login, ficam em `pages/auth/authPage.module.css`.
- [x] Os imports do `apps/web` usam `@autopix/ui`. O CSS global entra por `@autopix/ui/styles/global.css`.
- [x] Ficaram no `apps/web`: `toast.jsx`, `time.js`, `actions.js`, `WhatsAppIcon.jsx` e `NotFound.jsx` (genéricos, mas fora da lista desta etapa); `eventKind.js` e `demoFeed.js` (vocabulário de negócio e vitrine da landing); `cards`, `activity`, `radar`, `pages/*` e `App.jsx`.
- [x] Testes: 228 antes e 228 depois (shared 32, core 78, api 99, web 19). Build e lint verdes. Nenhum arquivo de `apps/api`, `packages/core`, `packages/shared` nem `apps/worker` mudou.
- [x] Bundle conferido contra o build anterior: mesmos chunks (mais o CSS de `authPage`), mesmos textos, mesmo CSS do bundle de entrada.

**Para as ETAPAS 3, 5 e 6** (texto de marca ou de módulo dentro do pacote, sem mudar nada agora):

- `Logo.jsx` fixa "TemPix". `AuthShell.jsx` fixa a frase "Tem emprego, tem rota, tem serviço. TemPix.", o rodapé "Clientes, cargas, profissionais e Pix numa tela só." (cita Cargas, que no CPF não existe pela Q3) e o `aria-label` "TemPix — início". Precisam vir do tema da área.
- `MiniRadar` e `ScoreRing` têm rótulo padrão com vocabulário de oportunidade ("Radar procurando oportunidades", "Opportunity Score").
- `global.css` usa o gradiente `#tempix-gold`, definido no `index.html` do `apps/web`. Cada `index.html` de área precisa trazê-lo.
- Não há rota nem endpoint novo nesta etapa, então não há entrada nova no manifesto (ele nasce na ETAPA 3).

## ETAPA 5 · O que foi feito

Premissas do `ARQUITETURA.md` seção 1 (as perguntas Q1 a Q14 seguem sem resposta).

- [x] **`/api/profile` (só no host CPF):** `GET`/`PUT` do perfil da conta `PERSON`, com a regra de `CompanyService`. Sem CNPJ, cobrança, comissão, equipe nem chave de repasse. No host CNPJ responde 404 antes de autenticar; conta que não é `PERSON` recebe 404 também no modo legado.
- [x] **Cadastro por área:** motor comum (`pages/onboarding/OnboardingFlow.jsx`) e um fluxo por área. O CNPJ só aceita CNPJ e termina na taxa única pelo Pix (`/checkout`). O CPF só aceita CPF, é grátis e termina no link de ativação por e-mail, sem cobrança nem checkout. O cadastro de antes (com a escolha entre empresa e pessoa) ficou intacto em `src/legacy/`.
- [x] **Telas que as duas áreas dividem** (Login, ativação, Social, Atividade, confirmação, Configurações, perfil operacional, plano, `AppLayout`, Home do CNPJ) pedem a cópia e as peças da área por props. Cada build tem a sua cópia: `areas/cnpj/copy.js`, `areas/cpf/copy.js` e `src/legacy/copy.js` (o legado reproduz os textos de sempre).
- [x] **CPF:** painel próprio (`areas/cpf/Overview.jsx`), "Meu perfil" (`/app/perfil`, página nova do manifesto) e perfil operacional pela fonte `/api/profile`. Sem Equipe, sem chave Pix de repasse (Q4 em aberto), sem Pagamentos, Cargas, Equipes, Intermediação nem Licitações.
- [x] **Menu:** cada área tem o seu em `nav.js`. `companyOnly`, `personLabel` e o item do admin saíram do `AppLayout` e ficaram no invólucro do legado (`src/legacy/LegacyLayout.jsx`).
- [x] **Mensagens de acesso por área** (`loginMessages`): CPF lê "CPF ou senha incorretos."; CNPJ lê "Documento ou senha incorretos." (o host aceita o CPF do colaborador, Q1); o legado diz o que sempre disse.
- [x] **Fronteira do build:** o plugin `areaBoundary` recusa o código do build legado em qualquer área, e o manifesto classifica os arquivos de empresa (painel, cartões, equipe, chave de repasse) como exclusivos do CNPJ.
- [x] **Prova:** `bundle-isolation.test.js` procura os marcadores da `ARQUITETURA.md` seção 5 em todo arquivo de saída e deriva do manifesto que cada `/api/...` chamado e cada link escrito existe na própria área.
- [x] **Testes:** 702 no total (shared 32, areas 37, core 90, api 391, web 152; eram 612 na base da 4c).
- [x] **Build legado:** o legado construído tem os mesmos literais de texto do commit `09348bc` (diferenças: só o nome de uma classe de CSS nova, e um texto de ambiente das Configurações que perdeu o espaço inicial); o HTML renderizado das rotas públicas é igual.

**Fica para depois (resíduos conhecidos):**

- O catálogo do perfil operacional (`packages/shared/src/operations`, ~1.200 linhas) e os rótulos de `platform.js` continuam comuns, filtrados por `accountType` em tempo de execução. Os dois bundles levam o vocabulário do outro ali dentro (por exemplo "Equipes" nos módulos). Dividir exige duplicar o catálogo por área (Q10) e é decisão de produto.
- Marca e módulo ainda fixos nas telas e no `packages/ui` ("TemPix" no `AppLayout`, rótulos do `MiniRadar`): ETAPA 6.
- A linha da ETAPA 3 e a da ETAPA 4 desta tabela não foram atualizadas por aquelas etapas.

## ETAPA 7 · O que foi feito

Nada foi publicado: sem push, sem migração fora do banco local, sem mudança em `railway.ts`, `.env` nem DNS.

- [x] **Suíte de isolamento** (`npm run test:isolation`, script `scripts/test-isolation.mjs`): 485 casos, por item: a 194, b 90, c 96, d 77, e 28. As listas vêm do `app.js` (`mountsOf`), do manifesto (`API_MOUNTS`, `PAGES`) e do catálogo de ações do motor; a coleta falha se uma vier vazia. Sem banco ou sem `build:areas` o grupo aparece como PULADO com o motivo; com `CI=true` ou `--strict` pular é falha.
- [x] **Marcadores de bundle** numa lista só (`packages/areas/src/markers.js`), lida pelo teste de bundle do web e pela suíte (o mesmo conjunto, aplicado ao que o servidor entrega a partir do build do deploy).
- [x] **Ponta a ponta** (`npm run test:e2e`, `@playwright/test` 1.56.1 fixo): 19 cenários verdes e 1 `test.fixme` (favicon com arte própria). Chromium já instalado, `--host-resolver-rules` com os nomes de produção trocando a porta.
- [x] **CI** (`.github/workflows/ci.yml`): Node 22, Postgres 16, `npm ci`, migração do banco de teste, `npm test`, lint, `build:areas`, `test:isolation`, Playwright. Escrito e validado como YAML; não foi executado no GitHub.
- [x] **Deploy preparado** (`docs/divisao/DEPLOY_AREAS.md`): serviço único, cinco hostnames, variáveis do web e do worker, 301, ordem do go-live e rollback R1 a R4. `apps/api/test/deploy-areas.test.js` segura o que o guia promete.
- [x] **Testes:** 1176 no `npm test` (shared 32, areas 43, core 90, api 826, web 185; eram 735).

**Achados:**

- O script `build` do `package.json` gerava só o `dist` legado, e o Railway roda `npm run build`: ligar as variáveis de host deixaria os dois hosts em 404. Passou a rodar `build:areas` também (`railway.ts` intacto, ele já chama o script). Muda o build da próxima publicação (cerca de 25 s a mais).
- Os dois `favicon.svg` e todos os ícones de `apps/web/areas/<área>/public/icons` são o mesmo desenho. Cada área serve o próprio arquivo, mas a arte própria depende da decisão de marca (Q7).
- A ARQUITETURA 6.3 diz que o host é conferido antes do dono da sessão; o código confere o dono primeiro (sessão forjada: 401 e revogada; sessão do dono, host errado: 403). Não muda a segurança; a tabela do item c fixa a ordem real.
- As contas do ponta a ponta nascem direto no banco de teste: o cadastro do CPF só entrega o token de ativação por e-mail.
- O que só se confere no go-live está listado na seção 6 do `DEPLOY_AREAS.md`.

## Pendências abertas (fora do plano, já conhecidas)

- Revert de `COMPANY_SIGNUP_FEE_CENTS` para `20000` no Railway. Hoje está em `100`. Antes dos anúncios.
- `EMAIL_API_KEY` e `EMAIL_PROVIDER` não configurados. Ativação por e-mail não é enviada.
- Confirmar `DEMO_MODE=false` em produção.
- Rotacionar o `BB_CLIENT_SECRET`, que apareceu no chat.
- Teste ponta a ponta com Pix real. A primeira cobrança já gerou QR, mas falta fechar o ciclo com pagamento confirmado.
- Decisão de marca (Pix). Consultar advogado de propriedade intelectual antes de comprar domínio e anúncio com "TemPix" (Q7).
- Disponibilidade de `temcnpj.com.br` e `temcpf.com.br` no registro.br. Não confirmada (Q14).
- Decidir se "5% a 2%" sai do texto da landing, do plano e do checkout. Ainda não foi decidido.

## Git

- Branch de trabalho: `claude/autopix-production-saas-yk053p`. O plano pede uma branch por etapa (`divisao/etapa-N-nome`), mas a instrução de branch designada desta sessão vale. Por isso as etapas vão para a branch designada, e cada uma termina com commit e parada para aprovação.
- Commits desta etapa: ver `git log` na branch.

## Como retomar

Responda às perguntas do inventário (Q1 a Q14). Com as respostas, a ETAPA 1 escreve `docs/divisao/ARQUITETURA.md` e para.
