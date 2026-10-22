# Roadmap · Migração para VPS

Status: **planejado, nada executado.** Este arquivo guarda o que fazer quando a migração do Railway para a VPS começar. Enquanto isso, não há ação de emergência pendente na lista ativa.

## Ação de emergência agora

- (vazio) Nenhuma medida pendente nesta lista. Tudo que estava como emergência foi movido para a seção "Antes de sair do Railway", abaixo.

## Antes de sair do Railway

Ordem sugerida. Cada item é feito na conta do serviço correspondente, pelo responsável pela conta.

1. Trocar todos os segredos guardados no Railway:
   - Senha do Postgres e `DATABASE_URL`
   - `SESSION_SECRET`, `ACTIVATION_TOKEN_SECRET`, `PASSWORD_RESET_SECRET`
   - `PAYMENT_WEBHOOK_SECRET` e `BB_WEBHOOK_SECRET`
   - `BB_CLIENT_SECRET` e o certificado mTLS (novo PFX gerado no portal do BB)
   - Chaves de WhatsApp, de e-mail e de busca
2. Conta do Railway: 2FA, revogação de tokens de API e de sessões antigas, remoção de membros não reconhecidos, revisão do log de auditoria.
3. GitHub: 2FA, revisão de tokens de acesso pessoal, remoção de apps e deploy keys não reconhecidos, revogação da autorização do Railway, revisão do log de auditoria.
4. Conta Google: revogar apps de terceiros que não são usados (principalmente apps de IA), ativar passkey ou 2FA.
5. Banco de dados: revisar contas e pagamentos sem dono conhecido. Se houver indício de vazamento de dados pessoais, avaliar a comunicação à ANPD e aos titulares (LGPD, art. 48), com orientação jurídica.
6. Backup: `pg_dump` cifrado, baixado de uma máquina limpa e guardado fora do Railway, com teste de restauração.
7. Serviço `tempix-reset-once`: manter neutralizado (variável `TEMP_MAINTENANCE_ACTION` com valor que impede a execução). Não reativar.
8. registro.br: bloqueio de transferência, 2FA, conferência de que o DNS não mudou.

## Montagem da VPS (Hostinger KVM 2, Ubuntu 24.04)

1. Criar a VPS com chave SSH, sem senha.
2. Desativar login por senha. Criar usuário comum com sudo.
3. Firewall (`ufw`): liberar só 22, 80 e 443. Instalar `fail2ban` e atualizações automáticas.
4. Instalar Docker e Node 22.
5. Instalar o Claude Code na VPS (`npm i -g @anthropic-ai/claude-code`) e entrar com a conta do responsável. Assim o assistente opera direto no repositório clonado lá.
6. Segredos em `.env` com permissão `600`, fora do repositório. Token do GitHub só de leitura, a ser trocado depois da migração.

## Kit de deploy (a fazer no repositório)

- `Dockerfile` e `docker-compose.yml` (web, worker, Postgres com volume).
- Caddy como proxy, com HTTPS automático para `temcnpj.com.br`, `www`, `cpf.`, e os redirecionamentos de `temcpf.com.br`.
- Workflow de deploy (GitHub Actions) com SSH para a VPS: baixa o código, roda a migração, reinicia web e worker e confere `/api/health`.
- Backup diário do banco, cifrado, guardado fora da VPS.
- Script de restauração do `pg_dump`.

## Migração dos dados

1. Parar escrita no Railway (ou aceitar a janela de manutenção).
2. `pg_dump` final, cifrado, com checksum.
3. Restaurar na VPS num banco novo; conferir contagens de `User`, `Company`, `Payment` e `MarketplaceTransaction`.
4. Apontar `DATABASE_URL` da VPS e subir web e worker.
5. Registrar de novo o webhook do BB no domínio novo (`npm run bb:register-webhook`).
6. Trocar os DNS. Só depois, desligar o serviço no Railway.

## Pendências que dependem de você

- Confirmar se há anúncio oficial de invasão do Railway (não encontrei fonte oficial na pesquisa). Se houver, o item 1 deixa de ser preventivo e passa a ser obrigatório antes de qualquer migração.
- Chaves da Adzuna (`ADZUNA_APP_ID` e `ADZUNA_APP_KEY`) para as vagas funcionarem.
- `EMAIL_API_KEY` para a ativação de conta do CPF chegar por e-mail.
- Decidir se o `homologacao` no Railway é apagado ou fica desligado.
