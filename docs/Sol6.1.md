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

## 3. Taxa de intermediação e Social
- Taxa fixa de **2% sobre o valor intermediado com sucesso**, em todos os contratos do TemPix Pay.
- O acordo de contratação não gera mais a cobrança separada de 3%. Valores existentes já cobrados permanecem no histórico.
- Orçamentos exibem taxa prevista; comissões concluídas exigem confirmação do cliente e pagamento confirmado, sem reembolso.
- Social: opinião e foto opcionais após entrega confirmada; comentários, respostas e repostagens.
- Botão “Compartilhar no Social” no contrato e seleção pelo histórico no Social.
- Sem exposição automática de valores, dados pessoais do cliente ou descrição privada do contrato.
- Pix continua dependente da ativação do provedor em produção.

## 4. Ajustes de site
- Celulares pequenos (360px): o botão "Continuar rolando" fica em cima da ilha na primeira tela.
- Corrigido com recuo do botão e respeito à safe area.
- Opcional: deixar dourados também os demais ícones do site; deixar azul os detalhes amarelos da primeira tela.

## 5. Conta e domínio
- Domínio próprio (a URL da Railway ainda tem "autopix") e `EMAIL_FROM` real.
- Verificação de e-mail no cadastro grátis.
- Implementada: link de verificação enviado antes de criar a senha e ativar a conta.
- Domínio e remetente verificado seguem pendentes de DNS e credenciais do provedor de e-mail.

