import argon2 from 'argon2';

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations).
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) throw new Error('Invalid password');
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash, plain) {
  if (!hash || typeof plain !== 'string') return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Used to equalize timing when the user does not exist.
let dummyHash;
export async function burnPasswordCheck(plain) {
  if (!dummyHash) dummyHash = await argon2.hash('autopix-timing-equalizer', OPTIONS);
  await verifyPassword(dummyHash, plain || 'x');
  return false;
}
