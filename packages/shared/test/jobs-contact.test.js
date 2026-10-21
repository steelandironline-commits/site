import { describe, expect, it } from 'vitest';
import { extractContacts, extractEmails, extractPhones, formatPhone, isOwnDomainEmail, mailtoLink, whatsappLink } from '../src/index.js';

describe('vagas · telefone', () => {
  it('lê celular em vários formatos e monta o número com 55', () => {
    for (const text of ['(47) 99999-8888', '47 99999-8888', '47999998888', '+55 47 99999-8888', '55 (47) 9 9999-8888'.replace('9 9999', '99999'), 'WhatsApp: 47.99999.8888']) {
      expect(extractContacts(text).whatsapp, text).toBe('5547999998888');
    }
  });

  it('celular tem WhatsApp, fixo não', () => {
    const c = extractContacts('Ligue (47) 3333-4444 ou chame no zap (47) 98888-7777');
    expect(c.whatsapp).toBe('5547988887777');
    expect(c.phone).toBe('4733334444');
    const fixo = extractContacts('Telefone (11) 3333-4444');
    expect(fixo.whatsapp).toBeNull();
    expect(fixo.phone).toBe('1133334444');
  });

  it('DDD 55 sem parênteses não é tomado pelo prefixo do país', () => {
    expect(extractContacts('55 99999-8888').whatsapp).toBe('5555999998888');
  });

  it('não toma por telefone CEP, CNPJ, CPF, data nem protocolo', () => {
    const noise = 'CEP 89201-000. CNPJ 12.345.678/0001-95. CPF 123.456.789-09. Data 2026-10-21. Protocolo 202610150001. Salário R$ 2.500,00. 20 vagas.';
    expect(extractPhones(noise)).toEqual([]);
  });

  it('rejeita DDD que não existe', () => {
    expect(extractPhones('(20) 99999-8888')).toEqual([]);
    expect(extractPhones('(10) 3333-4444')).toEqual([]);
  });

  it('não repete o mesmo número', () => {
    expect(extractPhones('(47) 99999-8888 e 47999998888')).toHaveLength(1);
  });

  it('formata para exibir', () => {
    expect(formatPhone('5547999998888')).toBe('(47) 99999-8888');
    expect(formatPhone('4733334444')).toBe('(47) 3333-4444');
    expect(formatPhone('abc')).toBeNull();
    expect(formatPhone(null)).toBeNull();
  });
});

describe('vagas · e-mail', () => {
  it('acha e-mails, em minúsculas e sem repetir', () => {
    expect(extractEmails('Envie para RH@Empresa.com.br, ou rh@empresa.com.br. Outro: vagas@exemplo.org')).toEqual(['rh@empresa.com.br', 'vagas@exemplo.org']);
  });

  it('ignora nome de arquivo que parece e-mail', () => {
    expect(extractEmails('logo@2x.png e banner@site.jpg')).toEqual([]);
  });

  it('distingue domínio próprio de e-mail gratuito', () => {
    expect(isOwnDomainEmail('rh@empresa.com.br')).toBe(true);
    for (const free of ['joao@gmail.com', 'maria@hotmail.com', 'x@outlook.com', 'y@yahoo.com.br', 'z@uol.com.br']) expect(isOwnDomainEmail(free), free).toBe(false);
  });

  it('prefere o e-mail de domínio próprio ao gratuito', () => {
    const c = extractContacts('Contato: joao@gmail.com ou rh@empresa.com.br');
    expect(c.email).toBe('rh@empresa.com.br');
    expect(c.emailOwnDomain).toBe(true);
    const free = extractContacts('Contato: joao@gmail.com');
    expect(free.email).toBe('joao@gmail.com');
    expect(free.emailOwnDomain).toBe(false);
  });
});

describe('vagas · contato de várias fontes de texto', () => {
  it('junta o texto da descrição e os campos da fonte', () => {
    const c = extractContacts(['Vaga de soldador. Interessados, enviar currículo.', '(47) 99999-8888', 'rh@empresa.com.br']);
    expect(c).toEqual({ whatsapp: '5547999998888', phone: null, email: 'rh@empresa.com.br', emailOwnDomain: true });
  });

  it('sem contato, tudo nulo', () => {
    expect(extractContacts('Sem contato aqui.')).toEqual({ whatsapp: null, phone: null, email: null, emailOwnDomain: false });
    expect(extractContacts(undefined)).toEqual({ whatsapp: null, phone: null, email: null, emailOwnDomain: false });
    expect(extractContacts([null, undefined, ''])).toEqual({ whatsapp: null, phone: null, email: null, emailOwnDomain: false });
  });
});

describe('vagas · links wa.me e mailto', () => {
  it('gera https://wa.me/55DDDNUMERO', () => {
    expect(whatsappLink('5547999998888')).toBe('https://wa.me/5547999998888');
  });

  it('põe a mensagem de abertura codificada', () => {
    expect(whatsappLink('5547999998888', 'Olá, vi a vaga "Soldador" & tenho interesse')).toBe(
      'https://wa.me/5547999998888?text=Ol%C3%A1%2C%20vi%20a%20vaga%20%22Soldador%22%20%26%20tenho%20interesse',
    );
  });

  it('recusa número fora do formato', () => {
    for (const bad of ['4799999888', '47999998888', '55479999', 'abc', null, '5547999998888?x=1', 'javascript:alert(1)']) expect(whatsappLink(bad), String(bad)).toBeNull();
  });

  it('gera mailto: com assunto codificado', () => {
    expect(mailtoLink('rh@empresa.com.br')).toBe('mailto:rh@empresa.com.br');
    expect(mailtoLink('rh@empresa.com.br', { subject: 'Vaga: Soldador & Caldeireiro' })).toBe('mailto:rh@empresa.com.br?subject=Vaga%3A%20Soldador%20%26%20Caldeireiro');
  });

  it('recusa e-mail com injeção de cabeçalho ou fora do formato', () => {
    for (const bad of ['rh@empresa.com.br?bcc=x@y.com', 'rh@empresa.com.br\nbcc:x@y.com', 'sem-arroba', '', null, 'a@b']) expect(mailtoLink(bad), String(bad)).toBeNull();
  });
});
