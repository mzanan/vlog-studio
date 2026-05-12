import { Anchor, Container, Stack, Table, TableTbody, TableTd, TableTh, TableThead, TableTr, Text, Title } from '@mantine/core';
import { prisma } from '@/lib/db';
import { NewProjectButton } from './_components/NewProjectButton';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { clips: true } } },
  });

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Title order={1}>vlog-studio</Title>

        <NewProjectButton />

        {projects.length === 0 ? (
          <Text c="dimmed">Sin proyectos aún. Crea uno arriba.</Text>
        ) : (
          <Table withTableBorder verticalSpacing="sm">
            <TableThead>
              <TableTr>
                <TableTh>Proyecto</TableTh>
                <TableTh>Clips</TableTh>
                <TableTh>Actualizado</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {projects.map((p) => (
                <TableTr key={p.id}>
                  <TableTd>
                    <Anchor href={`/projects/${p.id}/ingest`}>{p.name}</Anchor>
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
