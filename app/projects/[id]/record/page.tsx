import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Anchor, Container, Group, Stack, Text, Title } from '@mantine/core';
import { prisma } from '@/lib/db';
import { isValidEdl, EdlVoiceoverSegment } from '@/lib/edl';
import { voDir } from '@/lib/paths';
import { RecorderList } from './_components/RecorderList';

export const dynamic = 'force-dynamic';

type SegmentStatus = { idx: number; segment: EdlVoiceoverSegment; recorded: { durationMs: number; recordedAt: string } | null };

export default async function RecordPage(props: PageProps<'/projects/[id]/record'>) {
  const { id } = await props.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  if (!isValidEdl(project.edl)) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="md">
          <Anchor href={`/projects/${id}/plan`} size="sm" c="dimmed">← Plan</Anchor>
          <Title order={1}>{project.name}</Title>
          <Text c="dimmed">Generá un plan primero.</Text>
        </Stack>
      </Container>
    );
  }

  const edl = project.edl;
  const dir = voDir(id);
  const statuses: SegmentStatus[] = [];

  for (let i = 0; i < edl.segments.length; i++) {
    const seg = edl.segments[i];
    if (seg.kind !== 'voiceover') continue;
    let recorded: { durationMs: number; recordedAt: string } | null = null;
    try {
      const meta = await readFile(path.join(dir, `seg-${i}.meta.json`), 'utf8');
      recorded = JSON.parse(meta);
    } catch {
      // not recorded
    }
    statuses.push({ idx: i, segment: seg, recorded });
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Stack gap={4}>
          <Anchor href={`/projects/${id}/plan`} size="sm" c="dimmed">← Plan</Anchor>
          <Title order={1}>{project.name} — Grabación VO</Title>
          <Text c="dimmed" size="sm">
            {statuses.length} segmento(s) de voiceover a grabar
          </Text>
        </Stack>

        {statuses.length === 0 ? (
          <Text c="dimmed">El plan no tiene segmentos de voiceover.</Text>
        ) : (
          <RecorderList projectId={id} initialStatuses={statuses} />
        )}
      </Stack>
    </Container>
  );
}
