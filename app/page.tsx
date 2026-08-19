import { Anchor, Container, Stack, Table, TableTbody, TableTd, TableTh, TableThead, TableTr, Text, Title } from '@mantine/core';
import { prisma } from '@/lib/db';
import { loadGrouping } from '@/lib/chapters';
import { loadImportProgress } from '@/lib/chapterImport';
import { NewProjectButton } from './_components/NewProjectButton';
import { GenerateChaptersButton } from './_components/GenerateChaptersButton';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { clips: true } } },
  });
  const grouping = await loadGrouping();
  const importProgress = await loadImportProgress();

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Title order={1}>vlog-studio</Title>

        <NewProjectButton />
        <GenerateChaptersButton
          initialGrouping={
            grouping
              ? {
                  generatedAt: grouping.generatedAt,
                  chapters: grouping.chapters.map((c) => ({ title: c.title, reason: c.reason, clipCount: c.clips.length })),
                }
              : null
          }
          initialImportProgress={importProgress}
        />

        {projects.length === 0 ? (
          <Text c="dimmed">No projects yet. Create one above.</Text>
        ) : (
          <Table withTableBorder verticalSpacing="sm">
            <TableThead>
              <TableTr>
                <TableTh>Project</TableTh>
                <TableTh>Clips</TableTh>
                <TableTh>Updated</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {projects.map((p) => (
                <TableTr key={p.id}>
                  <TableTd>
                    <Anchor href={`/projects/${p.id}/edit`}>{p.name}</Anchor>
                  </TableTd>
                  <TableTd>{p._count.clips}</TableTd>
                  <TableTd>{new Date(p.updatedAt).toLocaleString()}</TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
