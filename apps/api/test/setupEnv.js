import { resolveTestDatabaseUrl } from './dbUrl.js';

process.env.NODE_ENV = 'test';
const url = resolveTestDatabaseUrl();
if (url) process.env.DATABASE_URL = url;
