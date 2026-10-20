import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonWhereFields } from '../src/areas/cpf/PersonWhereFields.jsx';

describe('pessoa física: onde trabalha', () => {
  it('asks only the CEP and the km accepted, with the travel time at 80 km/h', () => {
    const html = renderToStaticMarkup(<PersonWhereFields form={{ postalCode: '89201000', serviceRadiusKm: 80 }} set={() => () => {}} errors={{}} />);
    expect(html).toContain('CEP onde você mora');
    expect(html).toContain('89201-000');
    expect(html).toContain('Até quantos km você aceita ir para o trabalho: 80 km');
    expect(html).toContain('1 h 00 min só de ida');
    expect(html).toContain('2 h 00 min ida e volta');
    expect(html).not.toMatch(/cidade|regiões|UF/);
  });
});
