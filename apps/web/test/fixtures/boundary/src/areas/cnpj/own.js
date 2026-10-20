// Entrada da própria área CNPJ: pasta, página exclusiva e marca são dela.
import { SECRET } from './secret.js';
import { PAY } from '../../pages/pay/Pay.js';
import { AREA_NAME } from '@autopix/areas/brand/cnpj';
import { PLATFORM_NAME } from '@autopix/areas/brand/platform';

export default [SECRET, PAY, AREA_NAME, PLATFORM_NAME];
