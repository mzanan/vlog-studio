import { prisma } from './db';
import { Prisma } from './generated/prisma/client';

export class StaleWriteError extends Error {
  constructor() {
    super('The project changed in another tab or session while you were editing. Reload to see the current state.');
    this.name = 'StaleWriteError';
  }
}

// Optimistic concurrency sobre Project.edl/suggestions, keyed en un contador
// dedicado (`planVersion`), NO en `updatedAt`: ese campo lo tocan también rutas
// no relacionadas (upload de clips, import-inbox) y generaría falsos conflictos.
// El caller pasa la versión que leyó antes de mutar; si otro write la incrementó
// primero, el WHERE no matchea ninguna fila y `count === 0`.
export async function updateProjectIfFresh(
  projectId: string,
  expectedPlanVersion: number,
  data: Prisma.ProjectUpdateInput,
): Promise<number> {
  const result = await prisma.project.updateMany({
    where: { id: projectId, planVersion: expectedPlanVersion },
    data: { ...data, planVersion: { increment: 1 } },
  });
  if (result.count === 0) throw new StaleWriteError();
  return expectedPlanVersion + 1;
}

export function parseExpectedPlanVersion(body: unknown): number | null {
  const v = (body as { expectedPlanVersion?: unknown } | null)?.expectedPlanVersion;
  return Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null;
}

export function staleWriteResponse(err: unknown): Response | null {
  if (!(err instanceof StaleWriteError)) return null;
  return Response.json({ error: err.message, conflict: true }, { status: 409 });
}
