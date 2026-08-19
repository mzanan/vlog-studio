import { rm } from 'node:fs/promises';
import { prisma } from './db';
import { Prisma } from './generated/prisma/client';
import { Edl, isValidEdl } from './edl';
import { Suggestion, isValidSuggestionList } from './suggestions';
import { projectDir, momentScoresPath } from './paths';

export type ProjectEdlAndSuggestions = {
  edl: Edl | null;
  suggestions: Suggestion[];
  planVersion: number;
};

export type PlanResponse = {
  edl: Edl | null;
  suggestions: Suggestion[];
  isDefault: boolean;
  planVersion: number | null;
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

export async function renameProject(projectId: string, name: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  return prisma.project.update({ where: { id: projectId }, data: { name } });
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return false;

  await rm(projectDir(projectId), { recursive: true, force: true });
  await rm(momentScoresPath(projectId), { force: true });

  try {
    await prisma.project.delete({ where: { id: projectId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return false;
    throw err;
  }

  return true;
}
