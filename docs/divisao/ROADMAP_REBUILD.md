# Roadmap de reconstrução · TemPix fora do Railway

Status: **planejado, nada executado.** Execute na ordem. Não pule fase: cada uma tem critério de saída, e a seguinte depende dele.

Substitui a parte de migração de `ROADMAP_VPS.md` (que continua valendo como referência de contas e segredos).

---

## 0. Estado atual (análise do repositório)

| Item | Situação |
|---|---|
| Código-fonte | Git: `claude/autopix-production-saas-yk053p`, no remoto em `9d02fa2`, mais o commit local `7902d80` (roadmap). Fonte de verdade do código. |
| Stack | Node 22, Express (apps/api), worker (apps/worker), React + Vite (apps/web), Prisma 6 com PostgreSQL 16. |
| Migrações | 14 em `prisma/migrations/`. As duas últimas (`20261020120000_area_isolation`, `20261021120000_job_listings`) são aditivas e ainda não estão em produção. |
| Testes | 1434 testes unitários e de integração (vitest), 485 casos de isolamento, 19 de E2E (Playwright). |
| Acoplamento ao Railway | Só a pasta `.railway/` (IaC, `railway.ts`) e comentários. Nenhuma variável `RAILWAY_*` é lida pelo código. Remover é tarefa de limpeza, não de reescrita. |
| Dockerfile / Caddy / compose | Não existem. Precisam ser criados. |
| Segredos | Todos em variáveis de ambiente (ver tabela da seção 2). `.env` está no `.gitignore`. |
| Arquivo sensível no git | `packages/core/src/payments/providers/certs/bb-mtls-intermediate.pem` é certificado **intermediário público**, não chave privada. Pode ficar. |

---

## 1. O que NÃO dá para fazer sem chave (decisão sua)

Você pediu para refazer sem nenhuma chave nem API. Isso é possível para a maior parte do sistema, mas **estas partes dependem de terceiros por natureza**:

| Função | Por que precisa de terceiro | Alternativa sem chave |
|---|---|---|
| Pix (cobrança da taxa e repasses) | Só o Banco do Brasil emite as credenciais (client id/secret e certificado mTLS). Sem elas, não há Pix real. | Nenhuma. Para subir sem cobrança, mude o produto para cadastro gratuito por um tempo (decisão de produto, ver seção 6). |
| WhatsApp | A API oficial da Meta exige token e número verificados. | Sem WhatsApp no MVP. O canal fica desligado e o site segue. |
| E-mail transacional (ativação, reset) | Entrega confiável exige IP com reputação e DNS (SPF, DKIM) corretos. Um SMTP próprio na VPS costuma cair no spam. | Usar um SMTP de provedor (exige chave) ou aceitar que as mensagens podem não chegar. Recomendo chave de provedor só para e-mail. |
| Vagas (Adzuna) | API de terceiro, com chave gratuita. | Sem fonte de vagas no MVP. A página mostra "fonte não configurada". |
| Push, VAPID | Gerado por nós, sem terceiro. | Nenhuma necessária. |
| Segredos da aplicação (sessão, tokens) | Gerados por nós. | Nenhuma necessária. |

**Decisão necessária antes da fase 6:** você quer lançar o MVP (a) com Pix e chaves do BB, (b) sem cobrança e sem WhatsApp, ou (c) só a parte sem terceiros? A recomendação é (b) para não bloquear a VPS por causa das credenciais do BB.

---

## 2. Inventário de segredos (a recriar, nunca copiar do Railway)

Todos devem ser **gerados novos** na VPS. Os antigos ficaram expostos ao Railway durante o incidente.

| Variável | Origem do valor |
|---|---|
| `DATABASE_URL`, senha do Postgres | Gerado na VPS (`openssl rand -base64 32`) |
| `SESSION_SECRET`, `ACTIVATION_TOKEN_SECRET`, `PASSWORD_RESET_SECRET` | Gerados na VPS |
| `PAYMENT_WEBHOOK_SECRET`, `BB_WEBHOOK_SECRET` | Gerados na VPS; o BB exige registrar o novo webhook |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` | Gerados na VPS (`npx web-push generate-vapid-keys`) |
| `BB_CLIENT_ID`, `BB_CLIENT_SECRET`, `BB_DEVELOPER_APPLICATION_KEY`, certificado mTLS | BB (novo, após revogar os antigos) |
| `WHATSAPP_*`, `EMAIL_API_KEY`, `ADZUNA_*`, `SEARCH_API_KEY` | Fornecedor, só se a decisão da seção 1 incluir |

---

## 3. Fases

### Fase 0 · Contenção (antes de qualquer outra coisa)

- [ ] Desconectar o Railway de todos os projetos (você faz). Não apagar os serviços ainda: eles guardam os dados até a fase 1.
- [ ] Revogar no Railway: tokens de API, tokens de projeto, variáveis de ambiente, sessões. Confirmar que o Railway enviou o e-mail de comunicação, se houver.
- [ ] GitHub: revisar autorizações do Railway e de apps; ativar 2FA; revisar log de auditoria.
- [ ] Google: revogar apps de terceiros que não são usados.
- [ ] Conferir se existe ação não reconhecida em qualquer dos serviços (banco, e-mail, GitHub).

**Saída:** nenhum acesso de terceiro ao Railway, GitHub e Google que você não reconheça.

### Fase 1 · Recuperação dos dados de produção

Esta fase é a mais importante e não pode ser pulada.

- [ ] Ver se o projeto `autopix` e o volume `postgres-volume` (5 GB) ainda existem no Railway. **Não apagar nada.**
- [ ] Se o banco estiver acessível: `pg_dump --format=custom --no-owner` pela URL pública, de uma máquina limpa.
- [ ] Se houver backup agendado no Railway (aba de backups do serviço Postgres): baixar e guardar.
- [ ] Guardar o dump cifrado (`age` ou `gpg`), offline, com checksum (`sha256sum`).
- [ ] Testar a restauração num Postgres local descartável: contagens de `User`, `Company`, `Payment`, `MarketplaceTransaction`.
- [ ] Se nada for recuperável: procurar cópias fora do Railway (backup seu anterior, dados do BB, logs do provedor de e-mail). Registrar o que se perdeu.
- [ ] Só depois do dump válido: aceitar que o Railway pode ser apagado.

**Saída:** dump cifrado e testado, guardado fora do Railway. Se não houver dump, o projeto volta a zero e a fase 5 vira "início limpo".

### Fase 2 · VPS

- [ ] Comprar a VPS (Hostinger KVM 2, Ubuntu 24.04, datacenter no Brasil se disponível). Adicionar a chave SSH na criação; **sem senha**.
- [ ] Usuário comum com `sudo`; desativar login root e por senha em `/etc/ssh/sshd_config`.
- [ ] `ufw`: liberar 22 (ou só do seu IP), 80 e 443. Negar o resto.
- [ ] `fail2ban` e `unattended-upgrades` ativos.
- [ ] Instalar Docker Engine e Docker Compose plugin.
- [ ] Instalar Node 22 (para rodar scripts de manutenção e o Prisma CLI).
- [ ] Instalar o Claude Code (`npm i -g @anthropic-ai/claude-code`) e entrar com a sua conta, para eu operar a máquina.
- [ ] Criar diretórios: `/srv/tempix/app` (código), `/srv/tempix/secrets` (`chmod 700`, arquivos `600`), `/srv/tempix/backups` (`chmod 700`).

**Saída:** `ssh` funciona só com chave; `ufw status` mostra só 22, 80, 443; `docker run hello-world` passa.

### Fase 3 · Infraestrutura em containers

- [ ] Criar `Dockerfile` (multi-stage): build do web (`npm run build` gerando `dist`, dist-cnpj e dist-cpf), imagem final com Node 22 e só o necessário.
- [ ] Criar `docker-compose.yml` com quatro serviços: `postgres` (volume nomeado, sem porta exposta), `web` (apps/api, porta interna), `worker` (apps/worker), `caddy` (portas 80 e 443).
- [ ] Criar `Caddyfile`: HTTPS automático para `temcnpj.com.br`, `www.temcnpj.com.br` (redireciona para o apex), `cpf.temcnpj.com.br`, e o redirecionamento 301 de `temcpf.com.br` e `www.temcpf.com.br` preservando caminho e query. O `Caddyfile` deve ter o mesmo comportamento do `PUBLIC_HOST_*` do app.
- [ ] Healthcheck do compose em `/api/health`.
- [ ] `restart: unless-stopped` em todos os serviços.
- [ ] Segredos entram por `env_file: /srv/tempix/secrets/app.env` (permissão 600), nunca no compose.

**Saída:** `docker compose up -d` sobe os quatro serviços, e `curl -k https://IP/api/health` responde 200 (antes de ter DNS).

### Fase 4 · Ajustes no código para sair do Railway

Pequenas mudanças, cada uma com teste:

- [ ] Remover `.railway/` do repositório (IaC do Railway deixa de ser usado). Manter só a documentação de deploy novo.
- [ ] Atualizar comentários que citam o Railway em `app.js`, `worker.js`, `apps/worker/src/index.js` e `README.md`.
- [ ] `trust proxy` continua em 1 (agora o Caddy é o proxy).
- [ ] Confirmar que o `Host` chega ao app pelo Caddy (`reverse_proxy` preserva o cabeçalho `Host` por padrão).
- [ ] Atualizar `.env.example` com os nomes das variáveis da seção 2, sem valores.
- [ ] Rodar a suíte inteira (`npm test`, `npm run test:isolation`, `npm run lint`, `npm run build:areas`) antes de qualquer deploy.

**Saída:** suíte verde no commit de reconstrução; nenhuma referência ao Railway no código que roda.

### Fase 5 · Banco de dados

- [ ] Subir o `postgres` do compose com volume nomeado.
- [ ] **Se houver dump:** `pg_restore --no-owner` no banco novo; conferir contagens contra o teste da fase 1.
- [ ] **Se não houver dump:** aplicar `npx prisma migrate deploy` do zero; criar o administrador da plataforma com `scripts/create-platform-admin.mjs`.
- [ ] Rodar `npx prisma migrate status` e confirmar que não há migração pendente.
- [ ] Confirmar que as duas migrações de área e vagas (`20261020120000`, `20261021120000`) estão aplicadas.

**Saída:** banco com todas as migrações e contagens conferidas (ou zerado, se não houver dump).

### Fase 6 · Integrações

Só entra o que foi decidido na seção 1.

- [ ] **Pix/BB:** primeiro no ambiente de homologação do BB (`BB_ENVIRONMENT=homologacao`), com credenciais de teste. Só depois, produção. Registrar o novo webhook no domínio novo (`npm run bb:register-webhook`).
- [ ] **E-mail:** se houver chave de provedor, configurar `EMAIL_PROVIDER` e `EMAIL_API_KEY`; testar ativação e reset em e-mail real. Configurar SPF e DKIM no DNS.
- [ ] **WhatsApp:** só se decidido. Número verificado na Meta, token e `WHATSAPP_APP_SECRET`.
- [ ] **Vagas (Adzuna):** só se decidido. `ADZUNA_APP_ID` e `ADZUNA_APP_KEY`, `JOBS_SYNC_ENABLED=true`.
- [ ] **Web Push:** gerar chaves VAPID na VPS (fase 2).

**Saída:** cada integração ativa tem um teste real feito e registrado; as desativadas estão marcadas como tal na tela ou no texto.

### Fase 7 · Testes na VPS

- [ ] Rodar `npm test`, `npm run test:isolation` e `npm run test:e2e` contra o Postgres do compose (banco de teste separado do de produção).
- [ ] Conferir que os testes de isolamento passam com os hosts reais (`temcnpj.com.br`, `cpf.temcnpj.com.br`) mapeados no Caddy de teste.
- [ ] Teste de restauração do backup: restaurar o dump diário num banco descartável e conferir contagens. **Sem teste de restauração, o backup não conta.**

**Saída:** suíte verde na VPS, e restauração testada.

### Fase 8 · Corte (cutover)

- [ ] Escolher a janela de manutenção. Avisar usuários se houver.
- [ ] Último dump do banco antigo (se ele ainda estiver acessível) e restauração na VPS.
- [ ] Trocar o DNS: `temcnpj.com.br`, `cpf.temcnpj.com.br`, `www` e os redirecionamentos de `temcpf.com.br`. Usar TTL baixo antes da troca.
- [ ] Ligar o modo de áreas: `PUBLIC_HOST_CNPJ=temcnpj.com.br`, `PUBLIC_HOST_CPF=cpf.temcnpj.com.br`, e os redirecionamentos. **Só depois que o build de áreas estiver na imagem.**
- [ ] Teste de fumaça com os cinco nomes: home, login, cadastro, painel e `/api/health`.
- [ ] Usuários com sessão antiga precisam entrar de novo (troca de cookie, decisão Q12).

**Saída:** os cinco nomes respondem, com o comportamento esperado de cada área.

### Fase 9 · Operação

- [ ] Backup diário do Postgres cifrado (`pg_dump` + `age`), fora da VPS (armazenamento de outro provedor ou disco externo).
- [ ] Retenção: 7 diários, 4 semanais, 3 mensais.
- [ ] Teste de restauração mensal, anotado.
- [ ] Logs: `docker compose logs` com rotação (`max-size`, `max-file`).
- [ ] Monitoramento simples: `/api/health` a cada 5 minutos, com alerta por e-mail ou mensagem (depende de chave, ver seção 1). Sem monitoramento pago.
- [ ] Atualizações: `unattended-upgrades` para o sistema; atualização do Node e das dependências só de propósito, com `package-lock.json` revisado.

**Saída:** backup, restauração e monitoramento rodando há uma semana sem falha.

### Fase 10 · Hardening e obrigações

- [ ] 2FA em GitHub, VPS (chave SSH com senha), registro.br, provedor de DNS, BB e provedor de e-mail.
- [ ] Revisão de acesso a cada 3 meses: quem tem chave SSH, quem tem token do GitHub.
- [ ] LGPD: avaliar com advogado se o incidente exige comunicação à ANPD e aos titulares (art. 48). Registrar a decisão.
- [ ] Trocar o token do GitHub usado na VPS por um de leitura só, com validade curta.
- [ ] Revisar o que ficou de fora (WhatsApp, vagas, cobrança) e decidir a próxima entrega.

**Saída:** checklist de segurança assinado por você.

---

## 4. Pendências de produto (bloqueiam partes da fase 6 e da fase 8)

- **Q3 e Q4:** o que a área CPF recebe de Pagamentos, Cargas, Equipes e Intermediação; de quem é a conta de repasse.
- **Q6:** admin em host próprio ou no CNPJ (hoje o admin não tem tela no modo de áreas).
- **Q7:** marca (ícones iguais nas duas áreas).
- **Q10:** catálogo do perfil operacional comum às duas áreas.
- **Q13:** os dados atuais são reais? Cargas e Equipes vão ao ar?
- **Q14:** domínios comprados e provedor de DNS do apex (ALIAS ou flattening).
- **Decisão da seção 1:** Pix, WhatsApp, e-mail e vagas entram no MVP?

---

## 5. Riscos conhecidos

| Risco | Efeito | Mitigação |
|---|---|---|
| Dump não recuperado | Perda de dados de usuários e pagamentos | Fase 1 primeiro; registrar o que se perdeu; aviso aos clientes |
| Segredo antigo ainda válido em algum lugar | Acesso indevido | Fase 0 e fase 2: tudo gerado de novo |
| Pix sem credencial do BB | Sem cobrança | Decisão da seção 1; cadastro gratuito como plano B |
| E-mail indo para o spam | Ativação não chega | SPF/DKIM; provedor com chave |
| Backup não testado | Backup inútil quando precisar | Fase 7 e fase 9 exigem restauração |
| Caddy/DNS mal configurado | Site fora do ar no corte | Fase 3 testa sem DNS; fase 8 com TTL baixo |

---

## 6. Próximo passo

Responda à decisão da seção 1 (Pix, WhatsApp, e-mail e vagas) e à seção 4. Com isso, a fase 0 é sua (acessos) e a fase 1 é a primeira que eu ajudo a executar na VPS, quando você conectar o Claude Code lá.
