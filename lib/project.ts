import { prisma } from './db';
import { Edl, isValidEdl } from './edl';

export type ProjectEdls = {
  edl: Edl | null;
  suggestion: Edl | null;
};

export async function loadProjectEdls(projectId: string): Promise<ProjectEdls | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { edl: true, edlSuggestion: true },
  });
  if (!project) return null;
  return {
    edl: isValidEdl(project.edl) ? (project.edl as unknown as Edl) : null,
    suggestion: isValidEdl(project.edlSuggestion) ? (project.edlSuggestion as unknown as Edl) : null,
  };
}
