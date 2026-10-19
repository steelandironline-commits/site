# Plano de divisão v2: Tem CNPJ + Tem CPF num site só

> **Como usar:** salve este arquivo no repositório como `docs/PLANO_DIVISAO.md`.
> No Claude Code, envie:
> `Leia docs/PLANO_DIVISAO.md inteiro e execute a ETAPA 0. Pare ao final dela.`
> Depois de aprovar cada etapa: `Aprovado. Execute a próxima etapa.`

---

## 1. Objetivo

Um **único site e um único deploy** em `temcnpj.com.br`, com duas áreas **totalmente isoladas**:

| Endereço | Área | Quem acessa |
|---|---|---|
| `temcnpj.com.br` e `www.temcnpj.com.br` | **Tem CNPJ** | Pessoa jurídica |
| `cpf.temcnpj.com.br` | **Tem CPF** | Pessoa física |
| `temcpf.com.br` e `www.temcpf.com.br` | Redirecionamento 301 para `cpf.temcnpj.com.br`, mantendo caminho e parâmetros | — |

Mesmo template, mesmo código-base, mesmo backend, mesmo servidor. Cada área tem tema próprio (logo, cor de destaque, textos).

---

## 2. REGRA ABSOLUTA: isolamento total

**Quem entra pelo CPF não tem acesso a NADA do CNPJ, e quem entra pelo CNPJ não tem acesso a NADA do CPF.** Isso inclui telas, rotas, menus, links, textos, dados, endpoints, arquivos e sessão.

O isolamento é aplicado em **todas as camadas**, nunca só escondendo no frontend:

| Camada | Regra |
|---|---|
| **Roteamento** | Um middleware identifica a área pelo hostname. Qualquer rota da outra área retorna **404**, nunca um redirecionamento que revele que ela existe. |
| **Código enviado ao navegador** | O HTML e o JS servidos em `cpf.temcnpj.com.br` não contêm telas, componentes, textos ou rotas exclusivos de CNPJ, e vice-versa. Usar entradas de build separadas por área. |
| **Menus e links** | Nenhum link, botão ou menção cruzada entre as áreas. |
| **Sessão e cookies** | Cookies **host-only**, sem o atributo `Domain`, de preferência com o prefixo `__Host-`. Um cookie de `temcnpj.com.br` nunca pode valer em `cpf.temcnpj.com.br` nem o contrário. Logins separados por área. |
| **Token / autenticação** | Todo token carrega a área (`aud=cpf` ou `aud=cnpj`). O backend rejeita com 403 qualquer token usado na área errada. |
| **API** | Cada área usa a própria API na mesma origem (`cpf.temcnpj.com.br/api/...` e `temcnpj.com.br/api/...`). O backend valida hostname **e** área do token em todo endpoint. CORS sem curinga. |
| **Banco de dados** | Todo registro tem dono e área (`area: CPF|CNPJ`). As consultas filtram sempre pela área da sessão. |
| **Arquivos e uploads** | Armazenamento separado por área (prefixo ou bucket próprio), com URLs assinadas e checagem de área. |
| **SEO** | `robots.txt`, `sitemap.xml`, título, favicon e Open Graph próprios por host. |
| **Logs e e-mails** | E-mails, notificações e mensagens de erro de uma área nunca citam a outra. |

Uma pessoa que é PF e também tem empresa usa **dois logins separados**, um em cada área. Não existe troca de perfil entre as áreas.

---

## 3. Arquitetura recomendada

```
/
├── apps/
│   └── web/               → um único app/deploy, roteado por hostname
│       ├── areas/cpf/     → telas exclusivas do CPF (entrada de build própria)
│       ├── areas/cnpj/    → telas exclusivas do CNPJ (entrada de build própria)
│       └── middleware     → host → área; rota de outra área = 404
├── packages/
│   ├── ui/                → template compartilhado (layout, componentes, tema base)
│   ├── core/              → regras comuns e validações
│   ├── auth/              → login com escopo por área (aud=cpf | aud=cnpj)
│   └── areas/             → manifesto: o que pertence a cpf, cnpj ou comum
├── api/                   → backend único com guarda de área em todos os endpoints
└── docs/divisao/          → inventário, arquitetura, progresso, go-live
```

**Manifesto de áreas** (`packages/areas`): uma lista única que diz, para cada rota, endpoint, menu e texto, se pertence a `cpf`, `cnpj` ou `comum`. Somente componentes **genéricos** do template podem ser `comum`. Nada que fale de empresa entra no CPF, e nada de pessoa física entra no CNPJ.

---

## 4. Eficiência

| Item | Este modelo (site único com subdomínio) |
|---|---|
| Deploys | **1** serviço web + API |
| Certificados SSL | `temcnpj.com.br`, `www`, `cpf.` (ou um curinga `*.temcnpj.com.br`) + `temcpf.com.br` só para redirecionar |
| Código compartilhado | ~85–90% (template, regras genéricas, infraestrutura) |
| Manutenção | Uma correção no template vale para as duas áreas |
| Custo de infra | O menor entre as opções avaliadas |
| Risco principal | Vazamento entre áreas no mesmo deploy, mitigado pela seção 2 e pela suíte de testes de isolamento (ETAPA 7) |

---

## 5. Divisão por modelo

| Modelo | Uso | Etapas |
|---|---|---|
| **Opus** | Inventário, arquitetura, isolamento/segurança, revisão final | 0, 1, 4 (desenho e revisão), 8 |
| **Sonnet** | Implementação, testes, CI, deploy | 2, 3, 4 (código), 5, 7 |
| **Haiku** | Textos, SEO, metadados, README, `.env.example`, lint, checklists | 6 e tarefas auxiliares |

Volume estimado: **~20% Opus, ~55% Sonnet, ~25% Haiku**.

Trocar de modelo no meio da sessão invalida o cache de prompt do Claude Code. Por isso o plano usa subagentes, cada um no seu modelo. Se preferir trocar na mão, use `/model opus`, `/model sonnet` ou `/model haiku` só no início de cada etapa, e `/clear` entre etapas. O estado fica salvo em `docs/divisao/PROGRESSO.md`.

### Subagentes (criados na ETAPA 0)

`.claude/agents/arquiteto.md`
```markdown
---
name: arquiteto
description: Arquitetura, isolamento entre áreas CPF e CNPJ, segurança, sessões, modelo de dados e revisão final do site Tem CNPJ / Tem CPF.
model: opus
---
Você é o arquiteto do site único Tem CNPJ (temcnpj.com.br) / Tem CPF (cpf.temcnpj.com.br). Siga docs/PLANO_DIVISAO.md.
A regra absoluta é o isolamento total entre as áreas (seção 2). Rejeite qualquer solução que dependa só de esconder coisas no frontend.
```

`.claude/agents/implementador.md`
```markdown
---
name: implementador
description: Implementa roteamento por hostname, separação de áreas, guardas de API, testes, CI e deploy do site Tem CNPJ / Tem CPF.
model: sonnet
---
Você implementa o que está em docs/divisao/ARQUITETURA.md. Mudanças pequenas e testáveis, um commit por bloco lógico.
Toda rota e todo endpoint novo precisa declarar sua área no manifesto e ter teste de isolamento.
```

`.claude/agents/auxiliar.md`
```markdown
---
name: auxiliar
description: Tarefas mecânicas do site Tem CNPJ / Tem CPF: textos, SEO por host, metadados, ícones, README, .env.example, lint e checklists.
model: haiku
---
Você faz tarefas mecânicas exatamente como pedido. Não altere lógica, rotas nem autenticação.
Nunca coloque texto de uma área na outra. Se algo exigir decisão, pare e informe.
```

---

## 6. Regras gerais para o Claude Code

1. Uma branch por etapa: `divisao/etapa-N-nome`.
2. Ao fim de cada etapa: atualize `docs/divisao/PROGRESSO.md`, faça commit e **pare para aprovação**.
3. **Nunca** rode migração destrutiva, apague dados, altere DNS ou publique em produção sem minha aprovação explícita.
4. Nunca coloque segredos no código; mantenha `.env.example` atualizado.
5. O site atual continua funcionando ao fim de cada etapa.
6. Adapte ferramentas e nomes de pastas à stack real. Se a stack exigir mudar o plano, proponha na ETAPA 1.

---

## 7. Etapas

### ETAPA 0 · Inventário · Opus (`arquiteto`)
1. Crie os três subagentes da seção 5.
2. Mapeie stack, rotas, telas, componentes, textos, endpoints, tabelas, arquivos, autenticação e deploy atual.
3. Classifique **cada item** como `CPF`, `CNPJ`, `COMUM` (só genérico) ou `DÚVIDA`.
4. Entregue `docs/divisao/INVENTARIO.md` com a matriz e as dúvidas para eu responder.
5. **PARE.**

### ETAPA 1 · Arquitetura · Opus (`arquiteto`)
Escreva `docs/divisao/ARQUITETURA.md` com:
- roteamento por hostname e resposta 404 para rotas da outra área;
- como as entradas de build garantem que o código de uma área não vai para a outra;
- sessões host-only, tokens com `aud` e guarda de área na API;
- modelo de dados com campo de área e plano de migração **não destrutiva**, com backup e rollback;
- armazenamento de arquivos separado por área;
- DNS e SSL: `temcnpj.com.br`, `www`, `cpf.`, e o redirecionamento 301 de `temcpf.com.br`;
- riscos e o que pode quebrar.

**PARE.**

### ETAPA 2 · Base compartilhada sem mudar comportamento · Sonnet (`implementador`)
1. Extraia o template para `packages/ui` e as regras genéricas para `packages/core`.
2. Nada muda para o usuário. Testes e build verdes.
3. **PARE.**

### ETAPA 3 · Roteamento por host e temas · Sonnet (`implementador`)
1. Crie o manifesto de áreas e o middleware de hostname.
2. Crie as entradas `areas/cpf` e `areas/cnpj` com tema próprio.
3. Ambiente local respondendo para os dois hosts (por exemplo `cpf.localhost` e `localhost`).
4. Rotas da outra área já retornam 404.
5. **PARE.**

### ETAPA 4 · Autenticação e API isoladas · Opus desenha, Sonnet implementa
1. `arquiteto`: confira o desenho contra o código real.
2. `implementador`: logins separados por área, cookies host-only, tokens com `aud`, guarda de área em **todos** os endpoints, filtro de área no banco e nos arquivos.
3. Migração não destrutiva, rodada primeiro só no local ou em teste.
4. `arquiteto`: revisão de segurança antes de seguir.
5. **PARE.**

### ETAPA 5 · Separação das telas e funções · Sonnet (`implementador`)
1. Mova cada item para a sua área conforme o inventário aprovado.
2. Remova qualquer link, menu ou texto cruzado.
3. Confirme no build final que o bundle de uma área não contém nomes de telas nem textos da outra.
4. **PARE.**

### ETAPA 6 · Textos, SEO e identidade · Haiku (`auxiliar`)
1. Título, descrição, favicon, manifest PWA, Open Graph, `robots.txt` e `sitemap.xml` próprios por host.
2. Linguagem de pessoa física no Tem CPF e de empresa no Tem CNPJ.
3. Rodapé: *"Tem CPF e Tem CNPJ não têm vínculo com a Receita Federal."*
4. README e `.env.example`; lint em todo o projeto.
5. **PARE.**

### ETAPA 7 · Testes de isolamento, CI e deploy · Sonnet (`implementador`)
1. **Suíte automática de isolamento**, obrigatória no CI:
   - a partir de `cpf.temcnpj.com.br`, toda rota e endpoint do CNPJ → 404 ou 403;
   - a partir de `temcnpj.com.br`, toda rota e endpoint do CPF → 404 ou 403;
   - cookie de uma área não autentica na outra;
   - token `aud=cpf` rejeitado na API do CNPJ e vice-versa;
   - bundle de cada área sem textos e nomes de telas da outra;
   - arquivos de uma área inacessíveis pela outra.
2. Testes ponta a ponta das duas áreas.
3. Configuração de deploy pronta (um serviço, três hostnames) e do redirecionamento 301 de `temcpf.com.br`, **sem publicar**.
4. **PARE.**

### ETAPA 8 · Revisão final · Opus (`arquiteto`)
1. Revisão completa de isolamento, segurança, LGPD, performance e duplicação de código.
2. `docs/divisao/GO_LIVE.md` com DNS, SSL, redirecionamento, variáveis, backup, monitoramento e rollback.
3. Relatório final em `docs/divisao/PROGRESSO.md` com o percentual real de código compartilhado.
4. **PARE e aguarde minha autorização para publicar.**

---

## 8. Critérios de pronto

- [ ] `temcnpj.com.br` serve só o Tem CNPJ; `cpf.temcnpj.com.br` serve só o Tem CPF.
- [ ] `temcpf.com.br` redireciona com 301 para `cpf.temcnpj.com.br`, mantendo o caminho.
- [ ] Suíte de isolamento 100% verde no CI.
- [ ] Nenhuma tela, rota, texto, link, cookie, token, dado ou arquivo acessível da área errada.
- [ ] Um único deploy, mesmo template, temas distintos.
- [ ] Checklist de go-live revisado.
