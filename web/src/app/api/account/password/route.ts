import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  CognitoIdentityProviderClient,
  ChangePasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION_NAME ?? 'us-east-1',
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.accessToken) return NextResponse.json({ error: 'No access token in session' }, { status: 401 });

  const { currentPassword, newPassword } = await req.json() as {
    currentPassword: string;
    newPassword: string;
  };

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both passwords are required' }, { status: 400 });
  }

  try {
    await cognito.send(new ChangePasswordCommand({
      AccessToken: session.accessToken,
      PreviousPassword: currentPassword,
      ProposedPassword: newPassword,
    }));
  } catch (err: unknown) {
    const code = (err as { name?: string }).name;
    if (code === 'NotAuthorizedException') {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }
    if (code === 'InvalidPasswordException') {
      return NextResponse.json({ error: 'New password does not meet requirements.' }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
