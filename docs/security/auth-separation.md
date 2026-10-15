# Separar cadastro e login do restante do sistema

Status: plano aprovado para início. Nenhuma mudança de produção nesta etapa.

## Por que
Hoje a API, o worker e o painel usam o mesmo banco. Se a API for comprometida,
o atacante alcança senhas (hash), sessões e vínculos de WhatsApp. A separação
limita esse alcance: a camada de identidade fica num serviço e num banco próprios.
O navegador nunca recebe credenciais de banco (já é assim; isso não muda).

## O que é identidade (vai para o banco de identidade)
Tabelas com o estado de conta e autenticação, hoje em `prisma/schema.prisma`:

| Modelo | Conteúdo |
|---|---|
| `User` | e-mail, CPF/CNPJ de login (`loginId`), hash da senha, status, papel, admin da plataforma |
| `Session` | sessões de login (token guardado só como hash) |
| `LoginChallenge` | códigos de confirmação de login |
| `ActivationToken` | link de ativação da conta |
| `PasswordResetToken` | recuperação de senha |
| `SensitiveActionChallenge` | confirmação extra de ações sensíveis |
| `WhatsAppConnection` | número WhatsApp vinculado à conta |

## O que é negócio (fica no banco atual)
`Company`, `Subscription`, `Payment`, `Opportunity`, `Contact`, `Agent*`,
`Freight*`, `Workforce*`, `Marketplace*`, `Commission*`, `Refund`, `Payout`,
`ActionLog`, `FinancialAuditLog`, notificações, redes sociais, etc.

## Ligações que atravessam os dois bancos
Chaves estrangeiras não funcionam entre bancos. Pontos a tratar:
- `User.companyId -> Company` (cascata). No banco de identidade vira só um `companyId` (texto), sem FK.
- `Company.users` (relação inversa): removida do lado de negócio.
- Modelos de negócio com `userId` / `authorUserId` (notificações, push, atividade,
  redes sociais, WhatsApp de mensagens): viram texto sem FK. Quem precisa do
  nome/e-mail busca no serviço de identidade, pelo id.

## Como a API valida a sessão hoje
`apps/api/src/middleware/session.js` lê o cookie `ap_session` (ou um bearer) e
chama `auth.resolveSession(token)`, que consulta a tabela `Session` a cada
requisição. Na nova arquitetura essa consulta sai da API.

## Etapas
1. **Banco de identidade separado (sem trocar o comportamento).** Criar um segundo
   Postgres no Railway, um segundo schema Prisma só com os modelos de identidade e
   a variável `AUTH_DATABASE_URL`. Migrar os dados com `pg_dump` das tabelas listadas
   e conferir contagens. Janela curta de manutenção; sessões ativas continuam válidas.
2. **Serviço de identidade separado (mesmo repositório).** Novo `apps/auth` com
   login, cadastro, ativação, recuperação de senha e WhatsApp. A API e o worker
   deixam de ter `AUTH_DATABASE_URL`. A API passa a validar o token pedindo ao
   serviço de identidade (rede privada do Railway).
3. **Token curto e assinado.** O serviço de identidade emite um token de acesso
   assinado (chave assimétrica) de curta duração e um refresh token. A API valida
   o token localmente com a chave pública, sem consultar o banco. Revogação de
   sessão passa a valer em até a duração do token de acesso.
4. **Endurecimento.** Usuários de banco mínimos por serviço (leitura/escrita só nas
   tabelas necessárias), rede privada entre serviços, segredos rotacionados, log
   de auditoria das ações administrativas sobre contas.

## O que a separação não resolve sozinha
Vazamento entre empresas (uma conta vendo dados de outra), XSS, configurações
erradas e lógica de permissão quebrada continuam sendo problemas de código. Eles
são tratados em paralelo com testes de autorização por empresa, Content Security
Policy e revisão de cookies (HttpOnly, Secure, SameSite).

## Riscos e cuidados
- Migração de usuários e sessões precisa de backup e de teste em uma cópia do banco.
- Quem está logado durante a troca não deve ser derrubado (etapa 1 preserva sessões).
- Cada etapa tem testes próprios antes de ir para produção.
