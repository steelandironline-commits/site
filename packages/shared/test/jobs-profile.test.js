import { describe, expect, it } from 'vitest';
import { cleanLine, htmlToText, jobSearchSchema, readJobSearch, safeHttpUrl } from '../src/index.js';

describe('vagas · perfil de busca', () => {
  it('valida área da lista, cargo até 80 e preferência de contato', () => {
    expect(jobSearchSchema.parse({ workArea: 'metalurgia', jobTitle: '  Soldador  ', contactPreference: 'WHATSAPP' })).toEqual({
      workArea: 'metalurgia',
      jobTitle: 'Soldador',
      contactPreference: 'WHATSAPP',
    });
    expect(jobSearchSchema.safeParse({ workArea: 'inventada' }).success).toBe(false);
    expect(jobSearchSchema.safeParse({ jobTitle: 'x'.repeat(81) }).success).toBe(false);
    expect(jobSearchSchema.safeParse({ jobTitle: 'x'.repeat(80) }).success).toBe(true);
    expect(jobSearchSchema.safeParse({ contactPreference: 'TELEFONE' }).success).toBe(false);
    expect(jobSearchSchema.safeParse({ contactPreference: 'whatsapp' }).success).toBe(false);
  });

  it('texto vazio e null apagam o campo; ausente continua ausente', () => {
    expect(jobSearchSchema.parse({ workArea: '', jobTitle: '   ', contactPreference: null })).toEqual({ workArea: null, jobTitle: null, contactPreference: null });
    expect(jobSearchSchema.parse({})).toEqual({});
  });

  it('lê do perfil operacional guardado e limpa o que for inválido', () => {
    expect(readJobSearch({ jobSearch: { workArea: 'saude', jobTitle: ' Enfermeira ', contactPreference: 'EMAIL' } })).toEqual({
      workArea: 'saude',
      jobTitle: 'Enfermeira',
      contactPreference: 'EMAIL',
    });
    expect(readJobSearch({ jobSearch: { workArea: 'xx', jobTitle: 42, contactPreference: 'FAX' } })).toEqual({ workArea: null, jobTitle: null, contactPreference: null });
    for (const none of [null, undefined, {}, [], 'x', { jobSearch: null }]) expect(readJobSearch(none)).toEqual({ workArea: null, jobTitle: null, contactPreference: null });
  });
});

describe('vagas · texto de fonte externa', () => {
  it('tira marcação, script e estilo e decodifica entidades', () => {
    expect(htmlToText('<p>Vaga &amp; <b>benefícios</b></p><script>alert(1)</script><style>x{}</style>')).toBe('Vaga & benefícios');
    expect(htmlToText('Linha 1<br>Linha 2<ul><li>A</li><li>B</li></ul>')).toBe('Linha 1\nLinha 2\n- A\n- B');
    expect(htmlToText('&lt;script&gt;alert(1)&lt;/script&gt;texto')).toBe('texto');
    expect(htmlToText('<![CDATA[Soldador &#233; &#x41;]]>')).toBe('Soldador é A');
  });

  it('limita o tamanho e aceita vazio', () => {
    expect(htmlToText('a'.repeat(100), { maxLength: 10 })).toHaveLength(10);
    expect(htmlToText(null)).toBe('');
    expect(cleanLine('  Soldador \n\n MIG  ')).toBe('Soldador MIG');
    expect(cleanLine('<b>x</b>'.repeat(300), 20).length).toBeLessThanOrEqual(20);
  });

  it('só deixa passar link http e https', () => {
    expect(safeHttpUrl('https://www.adzuna.com.br/land/ad/123?se=x')).toBe('https://www.adzuna.com.br/land/ad/123?se=x');
    expect(safeHttpUrl('http://exemplo.com.br/vaga')).toBe('http://exemplo.com.br/vaga');
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//exemplo.com', 'exemplo.com', '', null, undefined, 42, `https://x.com/${'a'.repeat(3000)}`]) {
      expect(safeHttpUrl(bad), String(bad).slice(0, 30)).toBeNull();
    }
  });
});
