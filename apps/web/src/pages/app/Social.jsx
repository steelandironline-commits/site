import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle, Repeat2, Share2, ShieldCheck, Camera, Trash2 } from 'lucide-react';
import { TRANSACTION_TYPE_LABELS } from '@autopix/shared';
import { useApi } from '../../lib/hooks.js';
import { get } from '../../lib/api.js';
import { useAction } from '../../lib/actions.js';
import { useToast } from '../../lib/toast.jsx';
import { fmtDateTime } from '../../lib/time.js';
import { BRLText, Badge, Button, DemoBadge, ErrorState, Field, Select, SkeletonCard, Textarea } from '@autopix/ui';
import s from './Social.module.css';
import app from './app.module.css';

/** Canvas export removes EXIF and reduces uploads before persisting them. */
export async function preparePhoto(file) {
  if (!file.type.startsWith('image/') || file.size > 15_000_000) throw new Error('Escolha uma foto de até 15 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45, 0.3]) {
      const photo = canvas.toDataURL('image/jpeg', quality);
      if (photo.length <= 614450) return photo;
    }
    throw new Error('Esta foto ficou muito grande. Escolha outra imagem.');
  } finally { URL.revokeObjectURL(url); }
}

function Author({ post }) {
  return <div className={s.identity}>
    <span className={s.avatar} aria-hidden="true">{post.authorName.slice(0, 1).toUpperCase()}</span>
    <div className={s.meta}><strong><BRLText>{post.authorName}</BRLText></strong><time>{fmtDateTime(post.createdAt)}</time></div>
  </div>;
}
function Delivery({ post }) {
  return <>
    <div className={s.actions}>
      {post.verified ? <Badge tone="success"><ShieldCheck size={13} /> Contrato concluído e confirmado</Badge> : <DemoBadge label={post.isDemo ? 'DEMO · entrega simulada' : 'SANDBOX · entrega simulada'} />}
      <span className={s.note}>{TRANSACTION_TYPE_LABELS[post.type]}</span>
    </div>
    <p className={s.body}><BRLText>{post.body}</BRLText></p>
    {post.photoUrl && <img className={s.photo} src={post.photoUrl} alt={`Foto do serviço compartilhada por ${post.authorName}`} loading="lazy" />}
  </>;
}
function Comments({ postId, onChange }) {
  const { data, error, reload } = useApi(`/api/social/posts/${postId}/comments`);
  const { run, busy } = useAction();
  const toast = useToast();
  const [body, setBody] = useState(''), [reply, setReply] = useState(null), [more, setMore] = useState([]), [cursor, setCursor] = useState(undefined), [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { setMore([]); setCursor(undefined); }, [data]);
  const rows = [...(data?.items || []), ...more];
  const next = cursor === undefined ? data?.nextCursor : cursor;
  const submit = async () => {
    const out = await run('COMMENT_SOCIAL_POST', { postId, body, parentId: reply?.id }, { success: 'Opinião publicada.' });
    if (out?.status === 'SUCCEEDED') { setBody(''); setReply(null); reload(); onChange(); }
  };
  return <section className={s.comments} aria-label="Comentários">
    {error && <p role="alert">{error.message}</p>}
    {!data && !error && <SkeletonCard lines={2} />}
    {data && rows.length === 0 && <p className={s.note}>Seja a primeira pessoa a comentar.</p>}
    {rows.map(c => <div key={c.id} className={`${s.comment} ${c.parentId ? s.reply : ''}`}>
      <div className={s.meta}><strong><BRLText>{c.authorName}</BRLText></strong><time>{fmtDateTime(c.createdAt)}</time></div>
      {c.parentId && <span className={s.note}>Resposta a {rows.find(p => p.id === c.parentId)?.authorName || 'um comentário'}</span>}
      <p><BRLText>{c.body}</BRLText></p><Button size="sm" variant="ghost" onClick={() => setReply(c)}>Responder</Button>
    </div>)}
    {next && <Button variant="ghost" loading={loadingMore} onClick={async () => {
      setLoadingMore(true); try { const page = await get(`/api/social/posts/${postId}/comments?cursor=${encodeURIComponent(next)}`); setMore(old => [...old, ...page.items]); setCursor(page.nextCursor); } catch(e) { toast.error(e.message); } finally { setLoadingMore(false); }
    }}>Mais comentários</Button>}
    {reply && <div className={s.actions}><span className={s.note}>Respondendo a {reply.authorName}</span><Button size="sm" variant="ghost" onClick={() => setReply(null)}>Cancelar resposta</Button></div>}
    <Field label={reply ? 'Sua resposta' : 'Sua opinião'}>{a => <Textarea {...a} rows={2} value={body} onChange={e => setBody(e.target.value)} maxLength={1000} />}</Field>
    <Button size="sm" disabled={!body.trim()} loading={busy === 'COMMENT_SOCIAL_POST'} onClick={submit}>Publicar comentário</Button>
  </section>;
}
function Post({ post, onChange }) {
  const [comments, setComments] = useState(false), [reposting, setReposting] = useState(false), [opinion, setOpinion] = useState('');
  const { run, busy } = useAction();
  const original = post.original || post;
  const doRepost = async () => {
    const out = await run('REPOST_SOCIAL_POST', { postId: original.id, body: opinion }, { success: 'Repostado no Social.' });
    if (out?.status === 'SUCCEEDED') { setReposting(false); setOpinion(''); onChange(); }
  };
  return <article className={s.card}>
    <div className={s.heading}><Author post={post} />{post.own && <Button variant="ghost" size="sm" icon={Trash2} aria-label="Remover minha publicação" loading={busy === 'DELETE_SOCIAL_POST'} onClick={async () => {
      const out = await run('DELETE_SOCIAL_POST', { id: post.id }, { success: 'Publicação removida.' }); if (out?.status === 'SUCCEEDED') onChange();
    }}>Remover</Button>}</div>
    {post.original ? <><p className={s.note}><Repeat2 size={12} /> Repostou uma entrega</p>{post.body && <p className={s.body}><BRLText>{post.body}</BRLText></p>}<div className={s.original}><Author post={original} /><Delivery post={original} /></div></> : <Delivery post={post} />}
    <div className={s.actions}>
      <Button size="sm" variant="ghost" icon={MessageCircle} aria-expanded={comments} onClick={() => setComments(v => !v)}>Comentários ({post.commentCount})</Button>
      {!original.own && <Button size="sm" variant="ghost" icon={Repeat2} aria-expanded={reposting} onClick={() => setReposting(v => !v)}>Repostar ({post.repostCount})</Button>}
    </div>
    {reposting && <><Field label="Sua opinião sobre esta entrega" optional>{a => <Textarea {...a} rows={2} value={opinion} onChange={e => setOpinion(e.target.value)} maxLength={2000} />}</Field><Button size="sm" icon={Repeat2} loading={busy === 'REPOST_SOCIAL_POST'} onClick={doRepost}>Confirmar repostagem</Button></>}
    {comments && <Comments postId={original.id} onChange={onChange} />}
  </article>;
}

export default function Social() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('transaction');
  const feed = useApi('/api/social/posts'), eligible = useApi('/api/social/eligible');
  const toast = useToast(), { run, busy } = useAction();
  const [transactionId, setTransactionId] = useState(requested || ''), [body, setBody] = useState(''), [photo, setPhoto] = useState(null), [preparing, setPreparing] = useState(false);
  const [more, setMore] = useState([]), [cursor, setCursor] = useState(undefined), [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { document.title = 'Social — TemPix'; }, []);
  useEffect(() => { setMore([]); setCursor(undefined); }, [feed.data]);
  useEffect(() => { if (requested) setTransactionId(requested); }, [requested]);
  const contracts = eligible.data?.items || [];
  const selected = contracts.some(t => t.id === transactionId);
  const reload = () => { feed.reload(); eligible.reload(); };
  const publish = async () => {
    const out = await run('PUBLISH_SOCIAL_POST', { transactionId, body, photo }, { success: 'Entrega compartilhada no Social.' });
    if (out?.status === 'SUCCEEDED') { setBody(''); setPhoto(null); setTransactionId(''); setParams({}, { replace: true }); reload(); }
  };
  const next = cursor === undefined ? feed.data?.nextCursor : cursor;
  return <>
    <header className={app.pageHead}><div><p className="eyebrow">Entregas que conectam pessoas</p><h1 className={app.pageTitle}>Social</h1><p className={app.pageSub}>Serviço entregue, cliente confirmou. Agora compartilhe sua experiência.</p></div><Button variant="ghost" onClick={reload}>Atualizar</Button></header>
    <div className={s.layout}>
      <section className={s.card} aria-labelledby="share-title"><h2 id="share-title" className={app.panelTitle}><Share2 size={17} /> Compartilhar no Social</h2>
        {eligible.error ? <ErrorState message={eligible.error.message} onRetry={eligible.reload} /> : !eligible.data ? <SkeletonCard lines={2} /> : contracts.length ? <>
          <Field label="Contrato entregue e confirmado">{a => <Select {...a} value={transactionId} onChange={e => setTransactionId(e.target.value)}><option value="">Escolha uma entrega</option>{contracts.map(t => <option key={t.id} value={t.id}>{t.isDemo || t.isSandbox ? '[SIMULAÇÃO] ' : ''}{t.description} · {fmtDateTime(t.buyerConfirmedAt)}</option>)}</Select>}</Field>
          {requested && !selected && <p className={s.note}>Este contrato já foi publicado por você ou ainda não está disponível para compartilhar.</p>}
          <Field label="Como foi a experiência?">{a => <Textarea {...a} rows={4} placeholder="Conte como foi o serviço, o atendimento e a entrega…" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} />}</Field>
          <Field label="Foto do serviço" optional hint="Somente fotos que você tem autorização para publicar. Até 15 MB; ajustamos o tamanho automaticamente.">{a => <input {...a} type="file" accept="image/*" disabled={preparing} onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
            setPreparing(true); try { setPhoto(await preparePhoto(file)); } catch(err) { toast.error(err.message || 'Não foi possível preparar esta foto.'); } finally { setPreparing(false); }
          }} />}</Field>
          {preparing && <p role="status" className={s.note}>Preparando foto…</p>}
          {photo && <><img src={photo} className={s.preview} alt="Prévia da foto que será publicada" /><Button size="sm" variant="ghost" onClick={() => setPhoto(null)}>Remover foto</Button></>}
          <p className={s.note}>Ao publicar, sua opinião, seu nome e a foto ficarão visíveis à comunidade TemPix. Valor, dados do cliente e detalhes privados do contrato permanecem protegidos.</p>
          <Button icon={Share2} disabled={!selected || !body.trim() || preparing} loading={busy === 'PUBLISH_SOCIAL_POST'} onClick={publish}>Compartilhar minha opinião</Button>
        </> : <div className={s.empty}><Camera size={28} /><p>Suas próximas entregas merecem aparecer aqui.</p><p className={s.note}>{requested ? 'Este contrato já foi publicado ou ainda não está disponível. ' : ''}Depois que o cliente confirmar a conclusão de um serviço no TemPix Pay, você poderá compartilhar sua opinião e uma foto. Também vale para contratos do seu histórico.</p><Button to="/app/pay" variant="secondary">Ver meus contratos</Button></div>}
      </section>
      {feed.error ? <ErrorState message={feed.error.message} onRetry={feed.reload} /> : !feed.data ? <SkeletonCard lines={5} /> : <>
        {feed.data.items.length === 0 && <section className={`${s.card} ${s.empty}`}><ShieldCheck size={28} /><h2 className={app.panelTitle}>O primeiro serviço pode ser o seu</h2><p className={s.note}>As publicações aparecerão aqui quando alguém compartilhar uma entrega confirmada. Cada história começa com um trabalho concluído.</p></section>}
        {[...feed.data.items, ...more].map(p => <Post key={p.id} post={p} onChange={reload} />)}
        {next && <Button variant="secondary" loading={loadingMore} onClick={async () => {
          setLoadingMore(true); try { const page = await get(`/api/social/posts?cursor=${encodeURIComponent(next)}`); setMore(old => [...old, ...page.items]); setCursor(page.nextCursor); } catch(e) { toast.error(e.message); } finally { setLoadingMore(false); }
        }}>Ver mais entregas</Button>}
      </>}
    </div>
  </>;
}
