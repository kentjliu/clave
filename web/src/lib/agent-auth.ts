import { createRemoteJWKSet, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

const REGION = process.env.AWS_REGION_NAME ?? 'us-east-1';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

const JWKS_URL = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;

// Cache the JWKS across Lambda warm invocations.
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export interface AgentIdentity {
  userId: string;   // Cognito sub
  email?: string;
}

/**
 * Extracts and verifies a Cognito Bearer token from the Authorization header.
 * Returns null if the token is missing or invalid.
 */
export async function verifyAgentToken(req: NextRequest): Promise<AgentIdentity | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;

  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
    });

    const sub = payload.sub;
    if (!sub) return null;

    return {
      userId: sub,
      email: payload.email as string | undefined,
    };
  } catch {
    return null;
  }
}
