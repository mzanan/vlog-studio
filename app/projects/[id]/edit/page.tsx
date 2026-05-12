import { notFound } from 'next/navigation';
import { Anchor, Container, Stack, Text, Title } from '@mantine/core';
import { prisma } from '@/lib/db';
import { Editor } from './_components/Editor';

export const dynamic = 'force-dynamic';

export default async function EditPage(props: PageProps<'/projects/[id]/edit'>) {
  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { clips: { orderBy: { createdAt: 'asc' } } },
  });
  if (!project) notFound();

  return (
    <Container size="xl" py="md" fluid>
      <Stack gap="md">
        <Stack gap={2}>
          <Anchor href="/" size="sm" c="dimmed">← Proyectos</Anchor>
          <Title order={2}>{project.name}</Title>
          {project.intent && <Text c="dimmed" size="sm">{project.intent}</Text>}
        </Stack>
        <Editor
          projectId={id}
          projectName={project.name}
          clips={project.clips.map((c) => ({
            id: c.id,
            filename: c.filename,
            durationMs: c.durationMs,
            hasVoice: c.hasVoice,
            transcribedAt: c.transcribedAt?.toISOString() ?? null,
          }))}
        />
      </Stack>
    </Container>
  );
}
