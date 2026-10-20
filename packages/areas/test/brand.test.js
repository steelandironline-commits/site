import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as platform from '../src/brand/platform.js';
import * as cnpj from '../src/brand/cnpj.js';
import * as cpf from '../src/brand/cpf.js';

const brandDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/brand');
const source = (name) => fs.readFileSync(path.join(brandDir, name), 'utf8');

describe('marca', () => {
  it('cada arquivo exporta só o que é seu', () => {
    expect(Object.keys(platform)).toEqual(['PLATFORM_NAME']);
    expect(Object.keys(cnpj)).toEqual(['AREA_NAME']);
    expect(Object.keys(cpf)).toEqual(['AREA_NAME']);
    expect(platform.PLATFORM_NAME).toBe('TemPix');
    expect(cnpj.AREA_NAME).toBe('Tem CNPJ');
    expect(cpf.AREA_NAME).toBe('Tem CPF');
  });

  it('o arquivo de uma área não cita a outra nem importa nada', () => {
    expect(source('cnpj.js')).not.toMatch(/\bCPF\b|pessoa f[ií]sica/i);
    expect(source('cpf.js')).not.toMatch(/\bCNPJ\b|empresa/i);
    for (const name of ['cnpj.js', 'cpf.js', 'platform.js']) {
      expect(source(name), name).not.toMatch(/^\s*(import|export\s+\*|export\s+\{[^}]*\}\s+from)/m);
    }
    expect(source('platform.js')).not.toMatch(/\bCPF\b|\bCNPJ\b/);
  });

  it('não existe um brand.js único com as duas marcas', () => {
    expect(fs.existsSync(path.join(brandDir, '../brand.js'))).toBe(false);
    expect(fs.existsSync(path.join(brandDir, 'index.js'))).toBe(false);
  });
});
