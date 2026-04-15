import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getProfileByUsername,
  getProfile,
  getMessages,
  sendMessage,
  makeConversationId,
  markConversationRead,
} from '@/lib/dynamo';

type Params = { params: Promise<{ username: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { username } = await params;
  const other = await getProfileByUsername(username);
  if (!other) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const conversationId = makeConversationId(session.user.id, other.user_id);
  const [messages] = await Promise.all([
    getMessages(conversationId),
    markConversationRead(session.user.id, conversationId),
  ]);

  return NextResponse.json({ messages, other_user: {
    user_id:      other.user_id,
    username:     other.username,
    display_name: other.display_name,
    avatar_url:   other.avatar_url ?? null,
  }});
}

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { username } = await params;
  if (!username) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const { content } = await req.json() as { content: string };
  if (!content?.trim()) return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: 'Message too long.' }, { status: 400 });

  const [senderProfile, recipientProfile] = await Promise.all([
    getProfile(session.user.id),
    getProfileByUsername(username),
  ]);

  if (!senderProfile) return NextResponse.json({ error: 'Set up your profile first.' }, { status: 403 });
  if (!recipientProfile) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  if (senderProfile.user_id === recipientProfile.user_id) {
    return NextResponse.json({ error: 'Cannot message yourself.' }, { status: 400 });
  }

  const message = await sendMessage({
    senderId:         session.user.id,
    senderProfile,
    recipientId:      recipientProfile.user_id,
    recipientProfile,
    content:          content.trim(),
  });

  return NextResponse.json(message, { status: 201 });
}
