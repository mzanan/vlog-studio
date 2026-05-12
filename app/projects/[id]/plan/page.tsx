import { notFound } from 'next/navigation';
import { Anchor, Container, Group, Stack, Title, Text } from '@mantine/core';
import { prisma } from '@/lib/db';
import { isValidEdl } from '@/lib/edl';
import { PlanView } from './_components/PlanView';

export const dynamic = 'force-dynamic';

export default async function PlanPage(props: PageProps<'/projects/[id]/plan'>) {
  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { clips: { orderBy: { createdAt: 'asc' } } },
  });
  if (!project) notFound();

  const edl = isValidEdl(project.edl) ? project.edl : null;
  const clipsLookup = Object.fromEntries(project.clips.map((c) => [c.id, { id: c.id, filename: c.filename, hasVoice: c.hasVoice, durationMs: c.durationMs }]));

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <Stack gap={4}>
            <Anchor href={`/projects/${id}/ingest`} size="sm" c="dimmed">← Ingest</Anchor>
            <Title order={1}>{project.name}</Title>
            {project.intent && <Text c="dimmed" size="sm">{project.intent}</Text>}
          </Stack>
          <Anchor href={`/projects/${id}/record`}>Grabar VO →</Anchor>
        </Group>

        <PlanView
          projectId={id}
          initialEdl={edl}
          clipsLookup={clipsLookup}
          hasClips={project.clips.length > 0}
        />
      </Stack>
    </Container>
  );
}
