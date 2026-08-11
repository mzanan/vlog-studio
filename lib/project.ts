import { prisma } from './db';
import { Edl, isValidEdl } from './edl';
import { Suggestion, isValidSuggestionList } from './suggestions';

export type ProjectEdlAndSuggestions = {
  edl: Edl | null;
  suggestions: Suggestion[];
  planVersion: number;
};

export async function loadProjectPlan(projectId: string): Promise<ProjectEdlAndSuggestions | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { edl: true, suggestions: true, planVersion: true },
  });
  if (!project) return null;
  return {
    edl: isValidEdl(project.edl) ? (project.edl as unknown as Edl) : null,
    suggestions: isValidSuggestionList(project.suggestions) ? (project.suggestions as Suggestion[]) : [],
    planVersion: project.planVersion,
  };
}
