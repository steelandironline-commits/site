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
| 5 · Separação das telas e funções | Sonnet (`implementador`) | Não iniciada | Depende das respostas do inventário |
| 6 · Textos, SEO e identidade | Haiku (`auxiliar`) | Não iniciada | Depende da decisão de marca (Q7) |
| 7 · Testes de isolamento, CI e deploy | Sonnet (`implementador`) | Não iniciada | Deploy configurado, **sem publicar** |
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
