// Verificación del ID token de Firebase (JWT RS256 firmado por Google).
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export type Verifier = (token: string, projectId: string) => Promise<string>;

/** Devuelve el UID si el token es válido para ese proyecto; si no, lanza error. */
export function makeVerifier(getKey: JWTVerifyGetKey): Verifier {
  return async (token, projectId) => {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });
    if (!payload.sub || typeof payload.sub !== 'string') throw new Error('Token sin usuario');
    return payload.sub;
  };
}

let remote: JWTVerifyGetKey | null = null;

export const verifyFirebaseToken: Verifier = (token, projectId) => {
  remote ??= createRemoteJWKSet(new URL(JWKS_URL));
  return makeVerifier(remote)(token, projectId);
};
