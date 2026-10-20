import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { accountTypeForHost } from '../security/area.js';

const OPEN_DISPUTE = { in: ['OPEN', 'UNDER_REVIEW', 'BUYER_RESPONSE', 'SELLER_RESPONSE'] };
export const SUCCESSFUL_DELIVERY = {
  sellerCompletedAt: { not: null }, buyerConfirmedAt: { not: null },
  status: { in: ['PAID', 'READY_TO_RELEASE', 'RELEASED'] },
  payment: { status: 'CONFIRMED', refundedCents: 0, refunds: { none: { status: { in: ['REQUESTED', 'PROCESSING'] } } } },
  disputes: { none: { status: OPEN_DISPUTE } },
};
const authorSelect = { select: { name: true } };
const txSelect = { select: { type: true, buyerConfirmedAt: true, isSandbox: true, isDemo: true } };
const postSelect = {
  id: true, body: true, authorUserId: true, createdAt: true, author: authorSelect,
  transaction: txSelect, repostOfId: true,
  _count: { select: { comments: true, reposts: { where: { deletedAt: null } } } },
};

/**
 * Only opt-in content is public inside the authenticated community.
 *
 * Area mode (ARQUITETURA 6.6, Q9): a post has the area of its author's company, and the feed, the
 * comments, the reposts and the photo are filtered by the `area` the caller passes (the host's area
 * from the route, or the user's area from the ActionEngine). The service never reads an area from
 * global state; in area mode a missing or unknown area is an error, not "everything". Legacy mode
 * ignores `area` and behaves exactly as before.
 */
export class SocialService {
  constructor({ prisma, transactions, config = transactions?.config }) { this.prisma = prisma; this.transactions = transactions; this.config = config; }

  /** Filter on the author's company (COMPANY for CNPJ, PERSON for CPF). `{}` in legacy mode. */
  authorWhere(area) {
    if (!this.config?.areas?.enabled) return {};
    const accountType = accountTypeForHost(area);
    if (!accountType) throw new TypeError(`SocialService: área inválida: ${String(area)}`);
    return { author: { company: { accountType } } };
  }

  scope() {
    return { isSandbox: this.transactions.capabilities().sandbox, isDemo: Boolean(this.transactions.config.demoMode) };
  }
  deliveryWhere() { return { ...SUCCESSFUL_DELIVERY, ...this.scope() }; }
  visibleWhere(area) {
    const delivery = this.deliveryWhere();
    const byArea = this.authorWhere(area);
    // A repost is visible only when the original is too, and both authors are of the same area.
    return { deletedAt: null, ...byArea, OR: [
      { repostOfId: null, transaction: delivery },
      { repostOf: { deletedAt: null, repostOfId: null, transaction: delivery, ...byArea } },
    ] };
  }
  text(body, max = 2000) {
    if (typeof body !== 'string' || !body.trim() || body.trim().length > max) throw badRequest('Escreva uma opinião dentro do limite de caracteres.');
    return body.trim();
  }
  photo(value) {
    if (!value) return null;
    if (typeof value !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 614_450) throw badRequest('Use uma foto JPEG de até 450 KB.');
    const bytes = Buffer.from(value.split(',')[1], 'base64');
    if (bytes.length > 460_800 || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw badRequest('Foto inválida.');
    return value;
  }
  dto(p, userId, photoIds) {
    const root = p.repostOf || p;
    return {
      id: p.id, body: p.body, authorName: p.author.name, own: p.authorUserId === userId, createdAt: p.createdAt,
      commentCount: root._count.comments, repostCount: root._count.reposts,
      original: p.repostOf ? this.dto(root, userId, photoIds) : null,
      photoUrl: photoIds.has(root.id) ? `/api/social/posts/${root.id}/photo` : null,
      type: root.transaction.type, confirmedAt: root.transaction.buyerConfirmedAt,
      isSandbox: root.transaction.isSandbox, isDemo: root.transaction.isDemo,
      verified: !root.transaction.isSandbox && !root.transaction.isDemo,
    };
  }
  async list({ user, cursor, area }) {
    const items = await this.prisma.socialPost.findMany({
      where: this.visibleWhere(area), select: { ...postSelect, repostOf: { select: postSelect } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const rows = items.slice(0, 20);
    const photoRows = await this.prisma.socialPost.findMany({
      where: { id: { in: rows.map(p => p.repostOfId || p.id) }, photo: { not: null } }, select: { id: true },
    });
    const photos = new Set(photoRows.map(p => p.id));
    return { items: rows.map(p => this.dto(p, user.id, photos)), nextCursor: items.length > 20 ? rows.at(-1).id : null };
  }
  async eligible({ company, user }) {
    const rows = await this.prisma.marketplaceTransaction.findMany({
      where: { ...this.deliveryWhere(), OR: [{ sellerCompanyId: company.id }, { buyerCompanyId: company.id }],
        socialPosts: { none: { authorUserId: user.id } } },
      select: { id: true, description: true, type: true, buyerConfirmedAt: true, isDemo: true, isSandbox: true },
      orderBy: { buyerConfirmedAt: 'desc' }, take: 100,
    });
    return { items: rows };
  }
  async publish({ user, company, transactionId, body, photo }) {
    const opinion = this.text(body), image = this.photo(photo);
    const t = await this.prisma.marketplaceTransaction.findFirst({
      where: { id: transactionId, ...this.deliveryWhere(), OR: [{ sellerCompanyId: company.id }, { buyerCompanyId: company.id }] }, select: { id: true },
    });
    if (!t) throw conflict('Compartilhe somente um serviço seu, pago, entregue e confirmado pelo cliente, sem disputa ou reembolso.');
    try {
      const p = await this.prisma.socialPost.create({ data: { transactionId, authorUserId: user.id, body: opinion, photo: image } });
      return { post: { id: p.id } };
    } catch (e) { if (e.code === 'P2002') throw conflict('Você já compartilhou sua opinião sobre este contrato.'); throw e; }
  }
  async root(id, area) {
    const p = await this.prisma.socialPost.findFirst({ where: { id, ...this.visibleWhere(area) }, select: { id: true, repostOfId: true } });
    if (!p) throw notFound('Publicação não encontrada.');
    return p.repostOfId || p.id;
  }
  async repost({ user, postId, body = '', area }) {
    const repostOfId = await this.root(postId, area);
    if (body && (typeof body !== 'string' || body.length > 2000)) throw badRequest('Comentário muito longo.');
    const own = await this.prisma.socialPost.findUnique({ where: { id: repostOfId }, select: { authorUserId: true } });
    if (own.authorUserId === user.id) throw conflict('Esta publicação já está no seu perfil.');
    try {
      const p = await this.prisma.socialPost.create({ data: { repostOfId, authorUserId: user.id, body: body.trim() } });
      return { post: { id: p.id } };
    } catch (e) { if (e.code === 'P2002') throw conflict('Você já repostou esta publicação.'); throw e; }
  }
  async comments({ postId, cursor, user, area }) {
    const id = await this.root(postId, area);
    const items = await this.prisma.socialComment.findMany({ where: { postId: id, ...this.authorWhere(area) },
      select: { id: true, body: true, parentId: true, createdAt: true, authorUserId: true, author: authorSelect },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const rows = items.slice(0, 50);
    return { items: rows.map(p => ({ id: p.id, body: p.body, parentId: p.parentId, createdAt: p.createdAt, authorName: p.author.name, own: p.authorUserId === user.id })),
      nextCursor: items.length > 50 ? rows.at(-1).id : null };
  }
  async comment({ user, postId, parentId, body, area }) {
    const id = await this.root(postId, area), opinion = this.text(body, 1000);
    if (parentId && !await this.prisma.socialComment.findFirst({ where: { id: parentId, postId: id } })) throw badRequest('Resposta não pertence a esta publicação.');
    const p = await this.prisma.socialComment.create({ data: { postId: id, authorUserId: user.id, parentId: parentId || null, body: opinion } });
    return { comment: { id: p.id } };
  }
  async remove({ user, id }) {
    const p = await this.prisma.socialPost.findUnique({ where: { id }, select: { authorUserId: true } });
    if (!p || p.authorUserId !== user.id) throw forbidden('Você só pode remover suas próprias publicações.');
    await this.prisma.socialPost.update({ where: { id }, data: { deletedAt: new Date(), body: '', photo: null } });
    return { removed: true };
  }
  async image(id, { area } = {}) {
    // Require an original visible post, never expose photos from refunded/private contracts
    // (nor from the other area: it answers 404, like a post that does not exist).
    const p = await this.prisma.socialPost.findFirst({ where: { id, ...this.visibleWhere(area), repostOfId: null }, select: { photo: true } });
    if (!p?.photo) throw notFound('Foto não encontrada.');
    return Buffer.from(p.photo.split(',')[1], 'base64');
  }
}
