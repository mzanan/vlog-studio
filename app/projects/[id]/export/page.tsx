import { notFound } from 'next/navigation';
import { Anchor, Container, Stack, Text, Title } from '@mantine/core';
import { prisma } from '@/lib/db';
import { isValidEdl } from '@/lib/edl';
import { ExportView } from './_components/ExportView';

export const dynamic = 'force-dynamic';

export default async function ExportPage(props: PageProps<'/projects/[id]/export'>) {
  const { id } = await props.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  if (!isValidEdl(project.edl)) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="md">
          <Anchor href={`/projects/${id}/music`} size="sm" c="dimmed">← Música</Anchor>
          <Title order={1}>{project.name} — Export</Title>
          <Text c="dimmed">Generá un plan primero.</Text>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Stack gap={4}>
          <Anchor href={`/projects/${id}/music`} size="sm" c="dimmed">← Música</Anchor>
          <Title order={1}>{project.name} — Export 16:9</Title>
          <Text c="dimmed" size="sm">
            Renderiza MP4 1920×1080 H.264 a 30fps. Mixea audio original de los clips + VO + música (música ducked al 15%).
            Tarda varios minutos según largo total.
          </Text>
        </Stack>

        <ExportView projectId={id} />
      </Stack>
    </Container>
  );
}
