// areaHtml: a página de entrada da área.
//   - troca %AREA_NAME% pelo nome da marca da área (packages/areas/src/brand/<área>.js);
//   - no build, grava o HTML em index.html na raiz do dist-<área> (o Vite o gravaria em
//     areas/<área>/index.html, o caminho dele em apps/web);
//   - no dev, responde às navegações com o HTML da área em vez do index.html do build legado.
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function areaHtml(area, brandName) {
  const own = area.toLowerCase();
  const entry = `areas/${own}/index.html`;
  return {
    name: 'area-html',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%AREA_NAME%', escapeHtml(brandName)),
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [pathname] = (req.url ?? '').split('?');
        const isPage = (req.method === 'GET' || req.method === 'HEAD') && req.headers.accept?.includes('text/html');
        const isFile = /\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith('/@') || pathname.startsWith('/api/');
        if (isPage && !isFile) req.url = `/${entry}`;
        next();
      });
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const page = bundle[entry];
        if (!page) this.error(`areaHtml: o build não gerou ${entry}.`);
        page.fileName = 'index.html';
        bundle['index.html'] = page;
        delete bundle[entry];
      },
    },
  };
}
