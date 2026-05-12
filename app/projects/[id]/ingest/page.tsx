import { notFound } from 'next/navigation';
import { Anchor, Container, Stack, Title, Text, Group } from '@mantine/core';
import { prisma } from '@/lib/db';
import { IngestDropzone } from './_components/IngestDropzone';
import { ClipGrid } from './_components/ClipGrid';

export const dynamic = 'force-dynamic';

export default async function IngestPage(props: PageProps<'/projects/[id]/ingest'>) {
  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { clips: { orderBy: { createdAt: 'asc' } } },
  });
  if (!project) notFound();

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <Stack gap={4}>
            <Anchor href="/" size="sm" c="dimmed">← Proyectos</Anchor>
            <Title order={1}>{project.name}</Title>
            {project.intent && <Text c="dimmed" size="sm">{project.intent}</Text>}
          </Stack>
        </Group>

        <IngestDropzone projectId={id} />
        <ClipGrid projectId={id} initialClips={project.clips} />
      </Stack>
    </Container>
  );
}
