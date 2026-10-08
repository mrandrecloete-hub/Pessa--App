// Makes the signing key pair for the Developer panel token. Run on YOUR computer:  node tools/make_keys.mjs
// Prints two lines. The PRIVATE one goes into Supabase secrets (DEV_PRIVATE_JWK), together with the PUBLIC one (DEV_PUBLIC_JWK).
// The PUBLIC one also goes into the app (DEV_PUBLIC_JWK in tools/verticals.js). Never put the private key in the repository.
import { generateKeyPairSync } from 'node:crypto';
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve:'P-256' });
console.log('PRIVATE (secret):\n' + JSON.stringify(privateKey.export({ format:'jwk' })));
console.log('\nPUBLIC (secret and app):\n' + JSON.stringify(publicKey.export({ format:'jwk' })));
