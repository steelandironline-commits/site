# Go-live · Tem CNPJ e Tem CPF

ETAPA 8, item 2 · Data: 2026-10-20 · Base: `a4db776` · Plano: `docs/PLANO_DIVISAO.md` · Contrato: `docs/divisao/ARQUITETURA.md` (seções 3, 4, 7, 9, 12) · Passo a passo detalhado: `docs/divisao/DEPLOY_AREAS.md`

> **Nada aqui foi executado.** Sem push, sem migração fora do banco local, sem DNS, sem variável no Railway, sem mudança em `.railway/railway.ts` nem em `.env`. Este documento não traz valor de segredo. A publicação só acontece com a sua autorização explícita (PLANO, ETAPA 8, item 4).

## 0. Portões: o que precisa estar decidido antes do passo 3

| # | Portão | Por que segura o go-live | Estado |
|---|---|---|---|
| G1 | Aprovação do backup (seção 3) e do push que leva a migração `20261020120000_area_isolation` | O `preDeploy` roda `prisma migrate deploy` no deploy seguinte ao push | Aguardando você |
| G2 | **Q6 · admin da plataforma.** No modo de áreas o admin não tem tela: não existe build `admin` (`apps/web/vite.config.js:119` recusa `--mode admin`), o bundle do CNPJ recusa `Admin.jsx` (`packages/areas/src/manifest.js:105`) e a sessão `ADMIN` só alcança as montagens de administração | Reembolsos, disputas e conciliação ficam só pela API depois do passo 4 | Aguardando você (decidir Q6 e aceitar a lacuna, ou construir o `dist-admin` antes) |
| G3 | **E-mail configurado** (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`) | O cadastro do CPF termina no link de ativação por e-mail (`onboardingService.js:299-303`). Sem e-mail, ninguém conclui cadastro no Tem CPF | Pendente (já listado em PROGRESSO) |
| G4 | Q14 · domínios comprados e provedor de DNS do apex com ALIAS ou flattening | Sem isso não há passo 5 | Aguardando você |
| G5 | Q3, Q4 e Q13 · o que o CPF recebe de Pagamentos, Cargas e Equipes; se os dados atuais são reais | Contas `PERSON` com transações perdem a visão delas no CPF | Aguardando você |
| G6 | Q7 · marca. Os favicons e ícones das duas áreas são o mesmo desenho (e o do legado) | Identidade, não segurança | Aguardando você |
| G7 | Q10 · aceitar por escrito o resíduo do catálogo de perfil operacional, ou dividi-lo | O bundle do CPF leva textos de empresa do catálogo comum (e o do CNPJ, de autônomo). É texto, não dado, mas fere o critério "nenhum texto da área errada" | Aguardando você |
| G8 | O endereço de hoje (o host de `APP_URL`) | No modo de áreas qualquer host fora da lista responde 404. Decida: acrescentá-lo a `PUBLIC_HOST_CNPJ_REDIRECT` (301 para o CNPJ) ou aceitar o 404 | Aguardando você |

## 1. DNS e SSL (ARQUITETURA 9)

Todos os nomes entram como domínios personalizados do **mesmo** serviço `autopix-web`. O worker não tem domínio.

| Nome | Registro | Função | Quem faz o 301 |
|---|---|---|---|
| `temcnpj.com.br` (apex) | ALIAS, ANAME ou CNAME com flattening para o alvo do Railway | Área **Tem CNPJ** | — |
| `www.temcnpj.com.br` | CNAME para o alvo do Railway | **301** para `https://temcnpj.com.br` + caminho + consulta | o app (`PUBLIC_HOST_CNPJ_REDIRECT`) |
| `cpf.temcnpj.com.br` | CNAME para o alvo do Railway | Área **Tem CPF** | — |
| `temcpf.com.br` (apex) | ALIAS, ANAME ou CNAME com flattening | **301** para `https://cpf.temcnpj.com.br` + caminho + consulta | o app (`PUBLIC_HOST_CPF_REDIRECT`) |
| `www.temcpf.com.br` | CNAME | idem | o app |
| `ADMIN_HOST` (opcional, Q6) | CNAME | Admin da plataforma | — |
| TXT de verificação | conforme o painel do Railway | Posse do domínio | — |

- **Apex:** o Railway trabalha com CNAME. O DNS do registro.br não oferece ALIAS nem flattening (conferir). Caminho provável: delegar os NS para um provedor que ofereça, em modo **só DNS** (sem proxy), para o Railway emitir o certificado.
- **Certificados:** um por domínio personalizado, emitidos pelo Railway. **Sem curinga** (`*.temcnpj.com.br` levaria qualquer subdomínio ao app).
- **Limite de domínios:** são 5 nomes (6 com o admin). Se o plano do Railway não comportar, faça os três 301 (`www.temcnpj`, `temcpf`, `www.temcpf`) no provedor de DNS, mantendo caminho e consulta, e tire-os das variáveis `*_REDIRECT`.
- **HSTS:** o `helmet` já manda `includeSubDomains` em produção; no apex ele cobre o `cpf.`. Sem `preload` até estabilizar. O navegador guarda o HSTS por meses: o apex precisa continuar com certificado válido.
- **301 no app:** vale para qualquer método e caminho, inclusive `/api`, exceto `/api/health` e `/api/webhooks/*`. O apelido nunca serve conteúdo nem grava cookie.
- **E-mail:** o remetente continua em `tempix.com.br` (premissa Q7). SPF e DKIM não mudam.
- **Domínio `*.up.railway.app`:** continua ligado ao serviço até o webhook do Banco do Brasil ser registrado de novo no host CNPJ. No modo de áreas ele responde 404 no site e 200 em `/api/health` e `/api/webhooks/*`.

## 2. Variáveis

As mesmas, com os mesmos valores, no `autopix-web` **e** no `autopix-worker` (o worker monta os links de e-mail, push e WhatsApp com `urlFor(área)`). Os valores são nomes de host, públicos. **Não são segredos e não há segredo novo.**

| Variável | Valor do plano | Efeito |
|---|---|---|
| `PUBLIC_HOST_CNPJ` | `temcnpj.com.br` | Liga a área CNPJ. Liga o modo de áreas junto com a próxima |
| `PUBLIC_HOST_CPF` | `cpf.temcnpj.com.br` | Liga a área CPF |
| `PUBLIC_HOST_CNPJ_REDIRECT` | `www.temcnpj.com.br` (mais o host atual, se G8 decidir pelo 301) | 301 para o host CNPJ |
| `PUBLIC_HOST_CPF_REDIRECT` | `temcpf.com.br,www.temcpf.com.br` | 301 para o host CPF |
| `ADMIN_HOST` | vazio, ou o host do admin (Q6) | Opcional |

Regras (`packages/core/src/config.js`): host sem `https://`, sem caminho e sem espaço. Com só uma das duas `PUBLIC_HOST_CNPJ`/`PUBLIC_HOST_CPF`, a partida falha (o deploy não sobe e não substitui o anterior). Sem nenhuma, modo legado.

Outras variáveis que o go-live toca (só os nomes):

- `APP_URL` e `API_URL` (já existem, `preserve()`): no passo 6, `https://temcnpj.com.br`. Servem à URL de notificação do Mercado Pago e ao `npm run bb:register-webhook`.
- `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`: portão G3.
- `DEMO_MODE=false` e `COMPANY_SIGNUP_FEE_CENTS` de volta a `20000`: pendências que já estavam abertas.

Não coloque as `PUBLIC_HOST_*` como texto no `railway.ts`: aplicar o IaC com elas liga o modo de áreas. Antes de qualquer `railway config apply`, rode `railway config plan` e confira que nada do painel é removido.

## 3. Backup e restauração (ARQUITETURA 7.3)

Antes do push do passo 3. Comandos completos em `DEPLOY_AREAS.md`, passo 1.

1. Backup do Postgres no painel do Railway, se o plano tiver backup de volume.
2. `pg_dump --format=custom --no-owner` pela URL pública do banco, lida de variável só na sessão do terminal (`read -rs`), para um arquivo **fora do repositório**, em disco criptografado, com `sha256sum`.
3. **Teste de restauração** num banco local descartável: `createdb`, `pg_restore --no-owner`, contagem de `User`, `Company`, `Payment` e `MarketplaceTransaction`, `dropdb`.
4. Registre em `PROGRESSO.md` só a data e as quatro contagens, sem dados.

**Restauração de verdade (R4, só com aprovação explícita):** criar um Postgres **novo** no Railway, `pg_restore --no-owner --dbname=<URL do banco novo>` do arquivo conferido pelo checksum, conferir as quatro contagens, trocar `DATABASE_URL` do web e do worker para o banco novo e fazer redeploy dos dois. O banco antigo fica intacto até você decidir. Perde-se o que foi gravado depois do backup.

**LGPD (fato, não parecer):** o dump é uma cópia completa dos dados pessoais da base fora da plataforma. Falta definir quem guarda, onde, por quanto tempo e quando se apaga.

## 4. Ordem do go-live

Cada passo tem conferência. Se ela falhar, pare e vá ao rollback (seção 6); não ajuste em produção.

| Passo | O que fazer | Conferência |
|---|---|---|
| **1 · Backup e restauração de teste** | Seção 3 | Checksum confere, restauração sem erro, contagens iguais às de produção |
| **2 · Push do hotfix** | **Já feito.** `09348bc` (cadastro com taxa em jogo só reiniciado pela sessão do dono) está no remoto | — |
| **3 · Push das etapas 4a a 7, com a migração** (após G1) | Rever os 66 commits à frente do remoto (mais os documentos da ETAPA 8). Recomendado: empurrar antes para uma branch que o Railway **não** implanta, esperar o CI (`.github/workflows/ci.yml`, nunca executado no GitHub) ficar verde, e só então a branch do deploy. **Não defina nenhuma `PUBLIC_HOST_*`** | Deploy verde no healthcheck `/api/health`; log do web e do worker com `"areas":"off"`; o log do build mostra `dist-cnpj` e `dist-cpf`; a consulta abaixo devolve 4 linhas; um login no endereço de sempre funciona e a linha nova de `Session` tem `area` preenchida |
| **4 · `PUBLIC_HOST_*` no web e no worker** | Seção 2; redeploy dos dois serviços | Log do web (`TemPix API listening`) e do worker (`worker started`) com `"areas":"on"`. Se um disser `off`, a variável não chegou a ele |
| **5 · Domínios no Railway** | Os cinco nomes (seis com o admin) no `autopix-web`, registros DNS da seção 1, espera dos certificados | Cada nome válido no painel, `https://` sem aviso |
| **6 · Teste de fumaça com os cinco hostnames** | Comandos abaixo; `APP_URL` e `API_URL` para `https://temcnpj.com.br`; `npm run bb:register-webhook` | Todos os resultados esperados |
| **7 · Aviso de troca de sessão (Q12)** | Avisar os usuários | Ver texto mínimo abaixo |

Conferência da migração (passo 3):

```sql
select table_name from information_schema.columns
where table_name in ('Session','LoginChallenge','ActivationToken','PasswordResetToken') and column_name = 'area';
```

**Atenção à ordem 4 → 5.** Do passo 4 até os certificados do passo 5 saírem, o endereço de hoje responde 404 (a não ser que G8 o ponha no 301) e os nomes novos ainda não funcionam: **o site fica fora do ar nessa janela**. Para não haver janela, adiante a parte do DNS e dos certificados do passo 5 para antes do passo 4 (como no `DEPLOY_AREAS.md`, passos 4 e 5): com o modo de áreas desligado, os nomes novos servem por alguns minutos o site de antes, sem divulgação. Se mantiver 4 → 5, faça os dois na mesma janela, com o DNS já propagado.

Teste de fumaça (passo 6, no seu terminal, contra os domínios reais):

```bash
curl -s https://temcnpj.com.br/ | grep -o '<title>[^<]*</title>'                         # Tem CNPJ
curl -s https://cpf.temcnpj.com.br/ | grep -o '<title>[^<]*</title>'                     # Tem CPF
curl -sI https://www.temcnpj.com.br/login | grep -i '^location'                          # 301, https://temcnpj.com.br/login
curl -sI 'https://temcpf.com.br/onboarding?utm_source=x' | grep -i '^location'           # 301, https://cpf.temcnpj.com.br/onboarding?utm_source=x
curl -sI 'https://www.temcpf.com.br/login?a=1' | grep -i '^location'                     # 301, https://cpf.temcnpj.com.br/login?a=1
curl -s -o /dev/null -w '%{http_code}\n' https://cpf.temcnpj.com.br/app/licitacoes       # 404
curl -s -o /dev/null -w '%{http_code}\n' https://cpf.temcnpj.com.br/api/company          # 404
curl -s -o /dev/null -w '%{http_code}\n' https://temcnpj.com.br/api/profile              # 404
curl -s -o /dev/null -w '%{http_code}\n' https://temcnpj.com.br/api/health               # 200
curl -s -o /dev/null -w '%{http_code}\n' https://cpf.temcnpj.com.br/sitemap.xml          # 200, só URLs do próprio host
```

No navegador: um login em cada host grava um cookie só (`__Host-ap_session` no CNPJ, `__Host-ap_session_cpf` no CPF), `Secure`, `HttpOnly`, sem `Domain`; a sessão de um host não abre o outro. No banco: `select area, count(*) from "Session" group by area;` mostra só `CNPJ`, `CPF` e `ADMIN` nas sessões novas.

Aviso aos usuários (passo 7), o mínimo que ele precisa dizer:

- todos entram de novo, uma vez (os cookies mudam de nome);
- empresa entra em `temcnpj.com.br`; pessoa física, em `cpf.temcnpj.com.br`; quem tem as duas coisas usa dois logins, com dois e-mails (Q2);
- quem instalou o app no celular abre o endereço novo e instala de novo (o ícone antigo aponta para o endereço de antes);
- links de ativação (48 h) e de nova senha (1 h) enviados antes da virada deixam de valer: peça outro.

## 5. Monitoramento

| O que olhar | Onde | Normal | Alerta |
|---|---|---|---|
| Modo de áreas na partida | Logs do Railway: `TemPix API listening` (web) e `worker started` (worker), campo `areas` | `"on"` nos dois depois do passo 4 | `"off"` em qualquer um: o worker manda links com `APP_URL` |
| Build de área ausente | Log `areas: build da área ausente` na partida do web | Nunca | Os dois hosts em 404: rodar o build de novo |
| 404 por host | Logs HTTP do Railway, filtro por host e status (o app não registra 4xx) | Alto só nos primeiros minutos (links velhos, robôs) e no `*.up.railway.app` | 404 em `/`, `/login` ou `/assets/*` do próprio host |
| 403 por host em `/api` | Idem | Perto de zero depois da virada | Crescendo: alguém com sessão de uma área no host da outra (`WRONG_AREA`), ou CSRF por origem errada. O código `WRONG_AREA` está só no corpo da resposta, não no log |
| Erros 5xx | Log `unhandled error` (só nome, mensagem e código do erro) | Zero | Qualquer um em `/api/auth` ou `/api/onboarding` |
| Webhooks | Logs `payment webhook processed`, `whatsapp webhook processed` | Seguem chegando | Pararam depois do passo 6: conferir o `bb:register-webhook` |
| Healthcheck | Painel do Railway | Verde | Vermelho: o deploy não substitui o anterior |
| Sessões por área | `select area, count(*) from "Session" group by area;` | Só `CNPJ`, `CPF`, `ADMIN` nas novas | Sessão nova com `area` nula no modo de áreas |

Acompanhe de perto nas primeiras horas e confira de novo depois de 24 h e de 7 dias.

## 6. Rollback R1 a R4 (ARQUITETURA 7.4)

Do mais leve ao mais pesado. Use o menor que resolve e registre o motivo em `PROGRESSO.md` antes de tentar de novo.

| Nível | Quando | Como | Efeito | Perde dado? |
|---|---|---|---|---|
| **R1 · código** | Erro depois de um deploy | Railway, Deployments: redeploy da implantação anterior, no web e no worker | Volta o código anterior. O código de antes das áreas ignora as colunas novas e as `PUBLIC_HOST_*` (na prática, volta ao legado). Voltar a uma implantação que já tem as áreas mantém o modo ligado | Não |
| **R2 · modo** | Problema de isolamento depois do go-live | Apagar as `PUBLIC_HOST_*` (e `ADMIN_HOST`) do web **e** do worker; redeploy | Volta o modo legado: **todos os hosts servem o app misto**, inclusive `cpf.` e os apelidos (sem 301). Usar junto com a retirada dos domínios novos no Railway. As sessões das áreas caem; a tela de admin volta | Não |
| **R3 · migração falhou no meio** | `migrate deploy` com erro | As instruções são idempotentes: corrigir a causa, `npx prisma migrate resolve --rolled-back 20261020120000_area_isolation` contra o banco de produção, redeploy. Só com a sua aprovação | O deploy com erro não substitui o anterior; o site segue no código antigo | Não |
| **R4 · dados** | Corrupção | Seção 3, "Restauração de verdade". Só com aprovação explícita | Banco novo a partir do dump | **Sim:** o que foi gravado depois do backup |

Nenhum nível apaga coluna. Depois de R2, os webhooks seguem funcionando (respondem em qualquer host).

## 7. O que só se confere no go-live

- O `Host` que o healthcheck do Railway envia (documentado como `healthcheck.railway.app`). O `/api/health` responde em qualquer host, então não depende disso; confirme que o primeiro deploy passou.
- A emissão dos certificados e o limite de domínios personalizados do plano.
- O apex com ALIAS ou flattening no provedor escolhido.
- **Cabeçalho `X-Forwarded-Host`:** o app escolhe a área por `req.hostname`, que com `trust proxy 1` lê o `X-Forwarded-Host` (`apps/api/src/app.js:48`, `apps/api/src/middleware/area.js:63`). Confira que a borda do Railway sobrescreve esse cabeçalho e que **não há CDN nem cache** na frente do serviço. Não é furo de autorização (quem decide é a área gravada na sessão), mas com um cache na frente um pedido forjado poderia guardar a resposta de uma área no endereço da outra.
- Qual branch o Railway implanta (o push dessa branch dispara o deploy e o `preDeploy`).
- O comportamento do `railway config plan` com variáveis só no painel.
- A primeira execução do CI no GitHub.

## 8. O que o build de produção muda

- `npm run build` agora é `prisma generate` + build legado (`apps/web/dist`) + `npm run build:areas` (`dist-cnpj` e `dist-cpf`). O `railway.ts` não mudou: ele já chama `npm run build` nos **dois** serviços, então o worker também passa a construir as áreas.
- Tempo medido nesta máquina: legado 10,6 s, áreas 17,1 s (a ETAPA 7 estimou cerca de 25 s a mais). No Railway, conte de 20 a 30 s a mais por build, nos dois serviços.
- **Até o passo 4 o legado continua sendo o servido.** As pastas novas ficam sem uso no modo legado, e o servidor nunca serve `dist-*` nesse modo nem `dist/` no modo de áreas.
- Tamanho (bytes, `du -sb`):

| Build | Total | JS | CSS | Primeira carga (entrada + `react` + `motion` + CSS, gzip) |
|---|---|---|---|---|
| `dist` (legado) | 3.037.058 | 1.819.313 | 143.630 | 254.831 |
| `dist-cnpj` | 3.021.297 | 1.799.383 | 141.912 | 228.717 |
| `dist-cpf` | 1.775.575 | 610.798 | 87.947 | 134.297 |

- Depois que o go-live estabilizar, o build legado (`src/App.jsx`, `src/main.jsx`, `src/legacyNav.js`, `src/legacy/`) sai numa mudança à parte, aprovada (ARQUITETURA 11, item 6). Só então o R2 deixa de existir como opção.
