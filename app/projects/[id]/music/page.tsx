import { notFound } from 'next/navigation';
import { Anchor, Container, Group, Stack, Title, Text } from '@mantine/core';
import { prisma } from '@/lib/db';
import { isValidEdl } from '@/lib/edl';
import { MusicView } from './_components/MusicView';

export const dynamic = 'force-dynamic';

export default async function MusicPage(props: PageProps<'/projects/[id]/music'>) {
  const { id } = await props.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  if (!isValidEdl(project.edl)) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="md">
          <Anchor href={`/projects/${id}/plan`} size="sm" c="dimmed">← Plan</Anchor>
          <Title order={1}>{project.name} — Música</Title>
          <Text c="dimmed">Generá un plan primero.</Text>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <Stack gap={4}>
            <Anchor href={`/projects/${id}/record`} size="sm" c="dimmed">← Grabación VO</Anchor>
            <Title order={1}>{project.name} — Música</Title>
            <Text c="dimmed" size="sm">
              Un track por bloque. Podés dividir o unir bloques según cuántos segmentos quieras musicalizar con la misma canción.
            </Text>
          </Stack>
          <Anchor href={`/projects/${id}/export`}>Export →</Anchor>
        </Group>
        <MusicView projectId={id} edl={project.edl} />
      </Stack>
    </Container>
  );
}
