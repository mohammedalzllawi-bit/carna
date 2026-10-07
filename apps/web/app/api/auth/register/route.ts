import { authResponse, callAuthApi, forwardError, type AuthResult } from '../../../../lib/auth-server';

export async function POST(request: Request) {
  const upstream = await callAuthApi('/v1/auth/register', await request.json());
  if (!upstream?.ok) return forwardError(upstream);
  return authResponse((await upstream.json()) as AuthResult, 201);
}
