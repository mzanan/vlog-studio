import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name || typeof body.name !== 'string') {
    return Response.json({ error: 'name required' }, { status: 400 });
  }
  const project = await prisma.project.create({
    data: { name: body.name.trim(), intent: body.intent ?? null },
  });
  return Response.json({ id: project.id }, { status: 201 });
}
