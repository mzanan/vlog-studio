import { NextRequest } from 'next/server';
import { renameProject, deleteProject } from '@/lib/project';

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/projects/[id]'>) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const rawName = body?.name;
  if (typeof rawName !== 'string') return Response.json({ error: 'name required' }, { status: 400 });

  const name = rawName.trim();
  if (name.length < 1 || name.length > 120) {
    return Response.json({ error: 'name must be 1-120 characters' }, { status: 400 });
  }

  const project = await renameProject(id, name);
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });

  return Response.json({ project });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]'>) {
  const { id } = await ctx.params;

  const deleted = await deleteProject(id);
  if (!deleted) return Response.json({ error: 'project not found' }, { status: 404 });

  return new Response(null, { status: 204 });
}
