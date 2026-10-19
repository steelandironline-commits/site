# Progresso · Tem CNPJ / Tem CPF

Plano: `docs/PLANO_DIVISAO.md` · Inventário: `docs/divisao/INVENTARIO.md`

Atualizado: 2026-10-19

## Etapas

| Etapa | Modelo | Estado | Entrega |
|---|---|---|---|
| 0 · Inventário | Opus (`arquiteto`) | **Concluída. Aguardando aprovação** | `docs/divisao/INVENTARIO.md`, subagentes em `.claude/agents/` |
| 1 · Arquitetura | Opus (`arquiteto`) | Não iniciada | `docs/divisao/ARQUITETURA.md` |
| 2 · Base compartilhada sem mudar comportamento | Sonnet (`implementador`) | Não iniciada | — |
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
