# Deploy das áreas · Tem CNPJ e Tem CPF

ETAPA 7, item 3 · Preparado, **não publicado**. Plano: `docs/PLANO_DIVISAO.md` · Contrato: `docs/divisao/ARQUITETURA.md` (seções 3, 4, 7, 9 e 12).

> Nada aqui foi aplicado. Este guia descreve o que fazer, na ordem. Ninguém executou push, `railway config apply`, mudança de DNS, migração em produção nem troca de variável. O `.railway/railway.ts` não foi alterado. A publicação só acontece com a sua autorização explícita (ETAPA 8).
>
> Este guia não traz valor de segredo. Onde um comando precisa de uma URL de banco, ele lê de uma variável de ambiente que você preenche na hora, no seu terminal.

## 1. O que vai ao ar

Um serviço web só, `autopix-web`, que atende cinco hostnames, mais um sexto opcional. O worker (`autopix-worker`) segue separado, sem domínio.

| Hostname | Papel | Quem responde |
|---|---|---|
| `temcnpj.com.br` | Área **Tem CNPJ** (apex) | `autopix-web` |
| `www.temcnpj.com.br` | **301** para `https://temcnpj.com.br` (caminho e consulta mantidos) | `autopix-web` |
| `cpf.temcnpj.com.br` | Área **Tem CPF** | `autopix-web` |
| `temcpf.com.br` | **301** para `https://cpf.temcnpj.com.br` | `autopix-web` |
| `www.temcpf.com.br` | **301** para `https://cpf.temcnpj.com.br` | `autopix-web` |
| `ADMIN_HOST` (opcional) | Admin da plataforma (pergunta Q6, em aberto) | `autopix-web` |

- Sem `ADMIN_HOST`, o admin entra pelo host do CNPJ, só para quem é administrador da plataforma (sessão `ADMIN`). Com `ADMIN_HOST`, o `/api/admin` deixa de existir no host do CNPJ.
- O domínio antigo `*.up.railway.app` continua ligado ao serviço, mas em modo de áreas ele **não serve o site**: responde 404, exceto `/api/health` e `/api/webhooks/*`, que respondem em qualquer host (healthcheck do Railway e webhooks de pagamento e de WhatsApp).
- Certificados: o Railway emite um por domínio personalizado. Não use curinga: ele levaria qualquer `*.temcnpj.com.br` ao app.
- Confira o limite de domínios personalizados por serviço no plano do Railway: são 5, ou 6 com o admin. Se o plano não comportar, o plano B é fazer os dois `*.temcpf.com.br` e o `www.temcnpj.com.br` no provedor de DNS (redirecionamento 301 lá), e deixar no Railway só os dois hosts de área.

### O que o build precisa gerar

O `railway.ts` manda o Railway rodar `npm run build` nos dois serviços. Até esta etapa esse script gerava só o site de antes (`apps/web/dist`). **Em modo de áreas o servidor serve apenas `dist-cnpj` e `dist-cpf`**; sem eles, os dois hosts respondem 404 (o servidor só registra um aviso na partida).

Por isso o script `build` do `package.json` passou a rodar também `npm run build:areas` (um commit à parte, `build: ...`). No modo legado nada muda para o usuário: as pastas novas ficam sem uso. O custo é cerca de 25 s a mais no build. Um teste (`apps/api/test/deploy-areas.test.js`) garante que o script e o `railway.ts` seguem juntos.

## 2. Variáveis

As mesmas cinco, com os mesmos valores, no `autopix-web` **e** no `autopix-worker`. O worker não recebe tráfego, mas lê a mesma configuração (`loadConfig`) para montar os links de e-mail, de push e de WhatsApp com `urlFor(área)`. Sem as variáveis no worker, essas mensagens saem com o endereço antigo (`APP_URL`).

| Variável | Valor do plano | Efeito |
|---|---|---|
| `PUBLIC_HOST_CNPJ` | `temcnpj.com.br` | Liga a área CNPJ. **Liga o modo de áreas junto com a próxima.** |
| `PUBLIC_HOST_CPF` | `cpf.temcnpj.com.br` | Liga a área CPF. |
| `PUBLIC_HOST_CNPJ_REDIRECT` | `www.temcnpj.com.br` | 301 para o host do CNPJ. |
| `PUBLIC_HOST_CPF_REDIRECT` | `temcpf.com.br,www.temcpf.com.br` | 301 para o host do CPF (lista separada por vírgula). |
| `ADMIN_HOST` | vazio (ou o host do admin) | Opcional. |

Regras (`packages/core/src/config.js`):

- São hosts (`nome[:porta]`), sem `https://`, sem caminho e sem espaço. Minúsculas ou maiúsculas valem igual.
- O modo de áreas só liga com `PUBLIC_HOST_CNPJ` **e** `PUBLIC_HOST_CPF` juntos. Com só um, ou com os apelidos e o admin sem os dois, a partida **falha** (melhor um deploy que não sobe, e não substitui o anterior, do que um site isolado pela metade). Cada host tem um papel só.
- Sem nenhuma das duas, vale o modo legado: o host é ignorado e tudo funciona como antes.
- Os valores são públicos (são os nomes dos sites). Mesmo assim, não os coloque como texto no `railway.ts` antes do passo 5: aplicar o IaC com eles **liga** o modo de áreas.
- Se quiser versionar as variáveis no IaC depois do go-live, a proposta é declará-las em `shared` com `preserve()` (valor no painel). Isso é uma mudança do `railway.ts` que **não foi feita aqui**. Antes de qualquer `railway config apply`, rode `railway config plan` e confira que o plano não remove as variáveis que você pôs no painel.
- `APP_URL` e `API_URL` (já existem, `preserve()`): em modo de áreas, CORS, CSRF e links usam os hosts das áreas, não estas duas. Elas ainda servem a duas coisas: a URL de notificação do Mercado Pago e o `npm run bb:register-webhook` (registra `API_URL` + `/api/webhooks/payment/banco-do-brasil` no Banco do Brasil). No passo 6, aponte as duas para `https://temcnpj.com.br`.

## 3. Ordem do go-live

Faça na ordem. Cada passo tem uma conferência; só siga se ela passar. Os passos 1 a 3 não mudam nada para o usuário.

### Passo 0 · Antes de tudo

- [ ] CI verde no commit que vai subir: `npm test`, `npm run lint`, `npm run build:areas`, `npm run test:isolation` e `npm run test:e2e` (workflow `.github/workflows/ci.yml`).
- [ ] Você revisou todos os commits da branch que estão à frente do remoto (eram 55 antes da ETAPA 7): o push leva todos de uma vez, inclusive a migração `20261020120000_area_isolation`.
- [ ] Os domínios existem no registro (Q14, ainda não confirmado): `temcnpj.com.br` e `temcpf.com.br`.
- [ ] O provedor de DNS do apex aceita **ALIAS/ANAME ou CNAME com flattening**. O DNS do registro.br não oferece isso (conferir). Caminho provável: delegar os NS para um provedor que ofereça, em modo só DNS (sem proxy), para o Railway emitir o certificado.
- [ ] O limite de domínios do plano do Railway foi conferido (seção 1).
- [ ] Decisões em aberto que mudam o que sobe: Q3/Q4/Q13 (o que o CPF recebe de Pagamentos, Cargas e Equipes), Q6 (`ADMIN_HOST`), Q7 (marca; os dois favicons ainda são o mesmo desenho, ver o `test.fixme` em `e2e/areas.spec.js`).
- [ ] Sem links de ativação pendentes (48 h) nem de recuperação de senha (1 h): eles apontam para `APP_URL` e dão 404 depois da virada. Ou espere vencerem, ou reenvie.
- [ ] Avise os usuários: **todo mundo entra de novo, uma vez** (os cookies mudam de nome, pergunta Q12).

### Passo 1 · Backup do banco

Antes do push que leva a migração (ARQUITETURA 7.3). O `preDeploy` roda `prisma migrate deploy` no próximo deploy; depois dele, o esquema de produção já mudou.

1. Backup do Postgres no painel do Railway, se o plano tiver backup de volume.
2. Dump com formato customizado, para um arquivo **fora do repositório**, em disco criptografado (contém dados pessoais, LGPD), com checksum. A URL pública do banco vem do painel do Railway; coloque-a na variável só na sua sessão:

   ```bash
   read -rs DATABASE_PUBLIC_URL && export DATABASE_PUBLIC_URL
   pg_dump --format=custom --no-owner --file="tempix-$(date +%F).dump" "$DATABASE_PUBLIC_URL"
   sha256sum "tempix-$(date +%F).dump" > "tempix-$(date +%F).dump.sha256"
   unset DATABASE_PUBLIC_URL
   ```

3. Teste de restauração num banco **local descartável**, nunca no de produção:

   ```bash
   createdb tempix_restore_check
   pg_restore --no-owner --dbname=tempix_restore_check "tempix-$(date +%F).dump"
   psql tempix_restore_check -c 'select (select count(*) from "User") users, (select count(*) from "Company") companies, (select count(*) from "Payment") payments, (select count(*) from "MarketplaceTransaction") transactions;'
   dropdb tempix_restore_check
   ```

4. Registre em `docs/divisao/PROGRESSO.md` só a data e as quatro contagens, **sem dados**.

Conferência: o checksum bate, a restauração terminou sem erro e as contagens são as de produção.

### Passo 2 · Migração

Ela vai junto com o push, pelo `preDeploy` (`npm run db:migrate`, que é `prisma migrate deploy`). Não rode migração à mão em produção.

`prisma/migrations/20261020120000_area_isolation/migration.sql` é **só aditiva e idempotente**: cria o tipo `Area` (`CNPJ`, `CPF`, `ADMIN`) e quatro colunas **nulas, sem default e sem backfill** (`Session`, `LoginChallenge`, `ActivationToken` e `PasswordResetToken`, coluna `area`). Não apaga, não renomeia e não troca tipo de nada. O código antigo ignora as colunas novas, então o rollback de código funciona com o esquema novo.

Guardas que já rodam no CI: `migration-lint.test.js` (nenhum `DROP`, `TRUNCATE`, `DELETE`, `RENAME` nem `SET NOT NULL` nas migrações novas) e a suíte inteira contra o banco já migrado.

Conferência depois do deploy do passo 3:

```sql
select column_name from information_schema.columns
where table_name in ('Session','LoginChallenge','ActivationToken','PasswordResetToken') and column_name = 'area';
```

Devem voltar quatro linhas.

### Passo 3 · Deploy em modo legado (variáveis ausentes)

O push dispara build e `preDeploy` no Railway. **Não defina nenhuma `PUBLIC_HOST_*` ainda.** O site continua como hoje: o host é ignorado, o cookie segue `ap_session`, CORS e CSRF seguem `APP_URL`/`API_URL`. A diferença invisível: sessões e tokens novos já gravam a coluna `area`.

Conferência:

- [ ] O deploy do `autopix-web` ficou verde no healthcheck `/api/health` (o Railway o chama com o host `healthcheck.railway.app`; o endpoint responde em qualquer host, e um teste cobre isso. Confirme no primeiro deploy que o healthcheck passou).
- [ ] Um login no endereço de sempre funciona; a linha nova em `Session` tem `area` preenchida.
- [ ] O log do web e o do worker dizem `areas: 'off'`.
- [ ] O build do Railway gerou `apps/web/dist-cnpj` e `apps/web/dist-cpf` (aparece no log do build).

### Passo 4 · Domínios e DNS

No Railway, no `autopix-web` (Settings, Networking, Custom Domain), adicione os cinco nomes. No provedor de DNS, crie o que o painel pedir. Alvo (ARQUITETURA 9):

| Nome | Registro | Função |
|---|---|---|
| `temcnpj.com.br` (apex) | ALIAS ou CNAME com flattening para o alvo do Railway | Área CNPJ |
| `www.temcnpj.com.br` | CNAME | 301 para o apex |
| `cpf.temcnpj.com.br` | CNAME | Área CPF |
| `temcpf.com.br` (apex) | ALIAS ou CNAME com flattening | 301 para `https://cpf.temcnpj.com.br` |
| `www.temcpf.com.br` | CNAME | idem |
| `ADMIN_HOST` (opcional) | CNAME | Admin |
| TXT de verificação | conforme o Railway | Posse do domínio |

Enquanto o modo de áreas está desligado, os nomes novos servem o site misto de antes (o host é ignorado). Os nomes ainda não foram divulgados, então a janela é curta e de baixo risco; passe ao passo 5 assim que os certificados saírem. Não divulgue os endereços antes do passo 5.

Conferência:

- [ ] Os cinco domínios aparecem como válidos, com certificado emitido (`https://` abre sem aviso).
- [ ] HSTS: o `helmet` envia `includeSubDomains` em produção, então o apex cobre o `cpf.`. Sem `preload` até estabilizar. Atenção: HSTS dura um ano no navegador; se um dia o apex tiver de sair do Railway, o certificado precisa continuar válido.

### Passo 5 · Ligar o modo de áreas

No painel do Railway, defina **as mesmas** variáveis no `autopix-web` e no `autopix-worker` (seção 2):

```text
PUBLIC_HOST_CNPJ=temcnpj.com.br
PUBLIC_HOST_CPF=cpf.temcnpj.com.br
PUBLIC_HOST_CNPJ_REDIRECT=www.temcnpj.com.br
PUBLIC_HOST_CPF_REDIRECT=temcpf.com.br,www.temcpf.com.br
```

(`ADMIN_HOST` só se você decidir pelo host próprio na Q6.) Redeploy dos dois serviços.

O que muda no mesmo instante: cada host passa a servir só a sua área; `*.up.railway.app` passa a responder 404 no site; os cookies viram `__Host-ap_session` (CNPJ) e `__Host-ap_session_cpf` (CPF), então **todas as sessões caem uma vez**; os links de e-mail, push e WhatsApp passam a usar os hosts novos.

Conferência: o log do web e o do worker dizem `areas: 'on'`. Se um dos dois disser `off`, as variáveis não chegaram a ele: corrija antes de seguir.

### Passo 6 · Conferência no ar

Com rede (no seu terminal, contra os domínios de verdade):

```bash
curl -s https://temcnpj.com.br/ | grep -o '<title>[^<]*</title>'          # Tem CNPJ
curl -s https://cpf.temcnpj.com.br/ | grep -o '<title>[^<]*</title>'      # Tem CPF
curl -s -o /dev/null -w '%{http_code}\n' https://cpf.temcnpj.com.br/app/licitacoes   # 404
curl -s -o /dev/null -w '%{http_code}\n' https://cpf.temcnpj.com.br/api/company      # 404
curl -s -o /dev/null -w '%{http_code}\n' https://temcnpj.com.br/api/profile          # 404
curl -sI 'https://temcpf.com.br/onboarding?utm_source=x'                  # 301, location: https://cpf.temcnpj.com.br/onboarding?utm_source=x
curl -sI https://www.temcnpj.com.br/login                                 # 301, location: https://temcnpj.com.br/login
curl -s -o /dev/null -w '%{http_code}\n' https://temcnpj.com.br/api/health           # 200
```

Também: o domínio `*.up.railway.app` devolve 404 em `/` e 200 em `/api/health`; no navegador, um login em cada host grava um cookie só (`__Host-ap_session` ou `__Host-ap_session_cpf`, `Secure`, `HttpOnly`, sem `Domain`); a sessão de um host não abre o outro.

Acrescente a conferência do banco: `select area, count(*) from "Session" group by area;` mostra `CNPJ`, `CPF` e `ADMIN` nas sessões novas (as de antes do go-live aparecem com `area` nula e já caíram na virada).

Em seguida:

- [ ] `APP_URL` e `API_URL` apontam para `https://temcnpj.com.br`.
- [ ] Rode `npm run bb:register-webhook` (com `API_URL` novo) para o Banco do Brasil chamar o domínio novo. O webhook antigo continua funcionando em `*.up.railway.app` enquanto o domínio estiver no serviço.
- [ ] Acompanhe taxa de erro e logs por algumas horas.

Parada de segurança: se qualquer item do passo 6 falhar, vá ao rollback (seção 5), não ajuste em produção.

## 4. Redirecionamento 301 de `temcpf.com.br`

Implementado no próprio app (`hostArea`, `apps/api/src/middleware/area.js`), antes de qualquer outra coisa: o apelido nunca serve conteúdo nem define cookie. O destino usa `https://` em produção e `http://` fora dela, e preserva caminho e consulta (`req.originalUrl`). Vale para qualquer método e para `/api`, com a exceção de `/api/health` e `/api/webhooks/*`.

Teste de exemplo (ARQUITETURA seção 9): `Host: temcpf.com.br`, `GET /onboarding?utm_source=x` deve dar

```text
301 Location: https://cpf.temcnpj.com.br/onboarding?utm_source=x
```

- Automático, sem rede, em modo de produção: `apps/api/test/deploy-areas.test.js` (também cobre `www.temcpf.com.br`, `www.temcnpj.com.br`, HEAD e POST, e o host em maiúsculas).
- Num navegador de verdade: `e2e/areas.spec.js`, cenários "temcpf.com.br leva ao host do CPF com 301" e "www.temcnpj.com.br leva ao host do CNPJ com 301".
- Depois do DNS, na internet: `curl -sI 'https://temcpf.com.br/onboarding?utm_source=x'` (passo 6). Não adianta forçar o cabeçalho `Host` contra o domínio `*.up.railway.app`: o Railway escolhe o serviço pelo `Host`, e esse nome responde 404 no site.

Se o plano do Railway não comportar os dois `*.temcpf.com.br` como domínios do serviço, faça o 301 no provedor de DNS (redirecionamento de domínio) para `https://cpf.temcnpj.com.br`, mantendo caminho e consulta, e tire os dois nomes de `PUBLIC_HOST_CPF_REDIRECT`.

## 5. Rollback R1 a R4 (ARQUITETURA 7.4)

Do mais leve ao mais pesado. Use o menor que resolve.

| Nível | Quando | Como | Perde dado? |
|---|---|---|---|
| **R1 · código** | Erro depois do deploy | No Railway, Deployments, redeploy da implantação anterior (nos dois serviços). O código antigo ignora as colunas novas (esquema novo é compatível) | Não |
| **R2 · modo** | Problema de isolamento depois do go-live | Apague as `PUBLIC_HOST_*` (e `ADMIN_HOST`) do web **e** do worker e redeploy: volta o modo legado. **Atenção:** todos os hosts passam a servir o app misto (inclusive `cpf.` e os apelidos, que deixam de redirecionar). Use junto com a retirada dos domínios novos no Railway, ou aponte-os de volta. As sessões das áreas caem | Não |
| **R3 · migração falhou no meio** | `migrate deploy` terminou com erro | As instruções são idempotentes: corrija a causa, rode `npx prisma migrate resolve --rolled-back 20261020120000_area_isolation` contra o banco de produção e faça o redeploy. Só com a sua aprovação | Não |
| **R4 · dados** | Corrupção | Restaure o dump do passo 1 num banco **novo** e troque o `DATABASE_URL` dos dois serviços. Só com aprovação explícita | Sim: o que foi gravado depois do backup |

Notas:

- Nenhum nível apaga coluna. Se um dia as colunas saírem, será outra migração, aprovada à parte.
- O código de antes das áreas ignora as variáveis `PUBLIC_HOST_*`: voltar a ele (R1) é, na prática, voltar ao modo legado. Já voltar a uma implantação que tem as áreas mantém o modo ligado; aí o desligamento é R2.
- Depois de R2, o BB e os webhooks seguem funcionando (respondem em qualquer host).
- Depois de qualquer rollback, registre o motivo em `docs/divisao/PROGRESSO.md` antes de tentar de novo.

## 6. O que está coberto e o que só dá para ver no go-live

Coberto por teste, rodando no CI:

| Garantia | Onde |
|---|---|
| Rota e endpoint de uma área respondem 404 no host da outra; cookie e token não cruzam; bundle e arquivos não cruzam | `npm run test:isolation` (`apps/api/test/isolation`, `bundle-isolation`, `area-public`) |
| As duas áreas num navegador de verdade, com os nomes de produção | `npm run test:e2e` (`e2e/areas.spec.js`) |
| O build do Railway gera as áreas; o healthcheck passa; o 301; o worker monta os mesmos links; este guia cita as variáveis, os hostnames, a migração e R1 a R4 | `apps/api/test/deploy-areas.test.js` |
| Migração só aditiva; modo legado inerte | `migration-lint.test.js`, `legacy-inert*.test.js` |

Só dá para conferir no go-live (não há como simular aqui):

- O `Host` que o healthcheck do Railway realmente envia (a documentação diz `healthcheck.railway.app`; o endpoint não depende dele).
- A emissão dos certificados e o limite de domínios do plano.
- O apex com ALIAS/flattening no provedor de DNS escolhido.
- O comportamento do Railway ao aplicar o IaC com variáveis novas (rode `railway config plan` antes).
- Que o push da branch é o que dispara o deploy no seu projeto.
