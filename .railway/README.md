# Railway configuration

`railway.ts` describes the AutoPix project on Railway (Postgres + web/API + worker)
using Railway Infrastructure as Code (the replacement for the deprecated `railway.json`).

```bash
npm i -D railway          # TypeScript SDK used by the CLI to evaluate railway.ts
railway login && railway link
railway config plan       # preview
railway config apply      # apply after review
```

Variables marked `preserve()` must be set in the Railway dashboard (they are
never written to the repository). See the root README, section "Deploy on Railway".
