# Sol6.1 — próximas melhorias do TemPix

Lista do que ficou para a próxima rodada (Sol6.1), em ordem de prioridade.

## 1. Destravar o cadastro de empresas (bloqueante)
- Pix está desligado em produção (`PAYMENT_PROVIDER=none`). O cadastro de empresas fica grátis com `COMPANY_SIGNUP_FEE_CENTS=0`.
- Implementado no código: cadastro sem Pix e ativação por e-mail. A variável de produção já está definida como zero; a Railway mascara o valor na integração.
- Se a empresa optar por cobrar cadastro no futuro, configure credenciais do Banco do Brasil ou outro provedor suportado.

## 2. WhatsApp como verificação em duas etapas (2FA)
- Configurar o WhatsApp Business (Meta WhatsApp Cloud API) na Railway; sem isso o vínculo do número não aparece em produção.
- Já existe: um único número por conta, confirmado pela pessoa, bloqueado para outras contas; após criar a senha a pessoa é levada a vincular.
- Implementado para contas com número verificado usando template Meta de autenticação para OTP. Ainda depende das credenciais da Meta, de aprovar/configurar `WHATSAPP_TEMPLATE_AUTH` e de vincular um número em produção.

## 3. Cobrar as taxas de contratação (regras no README, seção "Fees")
- Entrevista: taxa Pix de R$ 1,00 paga pela empresa ao agendar; o candidato não paga para participar. Implementado com confirmação do provedor, idempotência, auditoria e devolução à empresa se ela cancelar.
- Empresa: 3% do salário oferecido, sobre o valor acordado, cobrado quando a contratação for acordada (via ActionEngine, com auditoria).
- A regra de cobrar o candidato foi alterada porque o MPT publicou decisão contra cobrança de trabalhadores para encaminhamento a entrevistas e vagas: <https://www.prt4.mpt.mp.br/procuradorias/prt-porto-alegre/12608-mpt-obtem-decisao-judicial-contra-empresa-de-recursos-humanos-por-cobranca-de-taxa-de-inscricao>.

## 4. Ajustes de site
- Celulares pequenos (360px): o botão "Continuar rolando" fica em cima da ilha na primeira tela.
- Corrigido com recuo do botão e respeito à safe area.
- Opcional: deixar dourados também os demais ícones do site; deixar azul os detalhes amarelos da primeira tela.

## 5. Conta e domínio
- Domínio próprio (a URL da Railway ainda tem "autopix") e `EMAIL_FROM` real.
- Verificação de e-mail no cadastro grátis.
- Implementada: link de verificação enviado antes de criar a senha e ativar a conta.
- Domínio e remetente verificado seguem pendentes de DNS e credenciais do provedor de e-mail.
