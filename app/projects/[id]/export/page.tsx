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
          <Anchor href={`/projects/${id}/music`} size="sm" c="dimmed">← Music</Anchor>
          <Title order={1}>{project.name} — Export</Title>
          <Text c="dimmed">Generate a plan first.</Text>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Stack gap={4}>
          <Anchor href={`/projects/${id}/music`} size="sm" c="dimmed">← Music</Anchor>
          <Title order={1}>{project.name} — Export 16:9</Title>
          <Text c="dimmed" size="sm">
            Renders MP4 1920×1080 H.264 at 30fps. Mixes original clip audio + VO + music (music ducked to 15%).
            Takes several minutes depending on total length.
          </Text>
        </Stack>

        <ExportView projectId={id} />
      </Stack>
    </Container>
  );
}
