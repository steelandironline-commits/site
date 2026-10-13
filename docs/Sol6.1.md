# Sol6.1 — próximas melhorias do TemPix

Lista do que ficou para a próxima rodada (Sol6.1), em ordem de prioridade.

## 1. Destravar o cadastro de empresas (bloqueante)
- Hoje o Pix está desligado em produção (`PAYMENT_PROVIDER=none`): nenhuma empresa consegue pagar a taxa única de R$ 200,00.
- Opção A: configurar as credenciais do Banco do Brasil (Pix) na Railway.
- Opção B: `COMPANY_SIGNUP_FEE_CENTS=0` na Railway até o Pix estar ligado (cadastro de empresa grátis).

## 2. WhatsApp como verificação em duas etapas (2FA)
- Configurar o WhatsApp Business (Meta WhatsApp Cloud API) na Railway; sem isso o vínculo do número não aparece em produção.
- Já existe: um único número por conta, confirmado pela pessoa, bloqueado para outras contas; após criar a senha a pessoa é levada a vincular.
- Falta: pedir o código no WhatsApp vinculado no login (segunda etapa, nunca a única) e nas ações sensíveis.

## 3. Cobrar as taxas de contratação (regras no README, seção "Fees")
- Candidato: R$ 1,00 por Pix para confirmar presença na entrevista (novo tipo de pagamento, confirmação do provedor, idempotência, regra de devolução se a empresa cancelar).
- Empresa: 3% do salário oferecido, sobre o valor acordado, cobrado quando a contratação for acordada (via ActionEngine, com auditoria).

## 4. Ajustes de site
- Celulares pequenos (360px): o botão "Continuar rolando" fica em cima da ilha na primeira tela.
- Opcional: deixar dourados também os demais ícones do site; deixar azul os detalhes amarelos da primeira tela.

## 5. Conta e domínio
- Domínio próprio (a URL da Railway ainda tem "autopix") e `EMAIL_FROM` real.
- Verificação de e-mail no cadastro grátis.
