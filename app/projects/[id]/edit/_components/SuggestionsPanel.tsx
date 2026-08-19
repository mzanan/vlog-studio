'use client';

import { useMemo } from 'react';
import { Badge, Button, Divider, Drawer, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { Suggestion, SuggestionType } from '@/lib/suggestions';
import { SuggestionActions } from './SuggestionActions';
import { useSuggestionMutations } from './useSuggestionMutations';

const TYPE_LABELS: Record<SuggestionType, string> = {
  'trim-segment': 'Trim clip',
  'split-segment': 'Split clip',
  'hide-clip': 'Skip clip',
  'add-music-section': 'Add music',
  'replace-music-track': 'Change music',
  'set-vo-script': 'Voiceover',
  'add-vo-cue': 'VO cue',
};

const VIDEO_TYPES: SuggestionType[] = ['trim-segment', 'split-segment', 'hide-clip'];
const MUSIC_TYPES: SuggestionType[] = ['add-music-section', 'replace-music-track'];
const VO_TYPES: SuggestionType[] = ['set-vo-script', 'add-vo-cue'];

export function SuggestionsPanel({
  projectId,
  suggestions,
  opened,
  onClose,
  onChanged,
  onChatSuggestion,
}: {
  projectId: string;
  suggestions: Suggestion[];
  opened: boolean;
  onClose: () => void;
  onChanged: () => void;
  onChatSuggestion: (id: string) => void;
}) {
  const { accept, reject, bulk } = useSuggestionMutations(projectId, onChanged);

  const pending = useMemo(() => suggestions.filter((s) => s.status === 'pending'), [suggestions]);
  const videoPending = useMemo(() => pending.filter((s) => VIDEO_TYPES.includes(s.type)), [pending]);
  const musicPending = useMemo(() => pending.filter((s) => MUSIC_TYPES.includes(s.type)), [pending]);
  const voPending = useMemo(() => pending.filter((s) => VO_TYPES.includes(s.type)), [pending]);
  const applied = useMemo(() => suggestions.filter((s) => s.status === 'accepted'), [suggestions]);

  const bulkAction = (ids: string[], action: 'accept' | 'reject') => {
    if (ids.length === 0) return;
    bulk.mutate({ ids, action });
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      title={`AI suggestions (${pending.length} pending)`}
      overlayProps={{ opacity: 0.3 }}
    >
      <Stack gap="md">
        {pending.length === 0 ? (
          <Text c="dimmed" size="sm">
            No pending suggestions. Generate a new proposal from the &quot;Generate AI suggestion&quot; button.
          </Text>
        ) : (
          <>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                color="teal"
                onClick={() => bulkAction(pending.map((s) => s.id), 'accept')}
                loading={bulk.isPending}
              >
                Accept all ({pending.length})
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={() => bulkAction(pending.map((s) => s.id), 'reject')}
                loading={bulk.isPending}
              >
                Reject all
              </Button>
            </Group>

            <SectionBlock
              title="Video"
              suggestions={videoPending}
              onAcceptAll={() => bulkAction(videoPending.map((s) => s.id), 'accept')}
              onRejectAll={() => bulkAction(videoPending.map((s) => s.id), 'reject')}
              onAccept={(id) => accept.mutate(id)}
              onReject={(id) => reject.mutate(id)}
              onChat={(id) => { onChatSuggestion(id); onClose(); }}
              busy={accept.isPending || reject.isPending || bulk.isPending}
            />
            <SectionBlock
              title="Music"
              suggestions={musicPending}
              onAcceptAll={() => bulkAction(musicPending.map((s) => s.id), 'accept')}
              onRejectAll={() => bulkAction(musicPending.map((s) => s.id), 'reject')}
              onAccept={(id) => accept.mutate(id)}
              onReject={(id) => reject.mutate(id)}
              onChat={(id) => { onChatSuggestion(id); onClose(); }}
              busy={accept.isPending || reject.isPending || bulk.isPending}
            />
            <SectionBlock
              title="Voiceover"
              suggestions={voPending}
              onAcceptAll={() => bulkAction(voPending.map((s) => s.id), 'accept')}
              onRejectAll={() => bulkAction(voPending.map((s) => s.id), 'reject')}
              onAccept={(id) => accept.mutate(id)}
              onReject={(id) => reject.mutate(id)}
              onChat={(id) => { onChatSuggestion(id); onClose(); }}
              busy={accept.isPending || reject.isPending || bulk.isPending}
            />
          </>
        )}
        {applied.length > 0 && (
          <Stack gap={6}>
            <Divider
              labelPosition="left"
              label={
                <Group gap="xs">
                  <Text size="xs" fw={600}>Applied</Text>
                  <Badge size="xs" variant="light" color="teal">{applied.length}</Badge>
                </Group>
              }
            />
            <ScrollArea h={Math.min(300, applied.length * 60)} type="auto">
              <Stack gap={4}>
                {applied.map((s) => (
                  <Stack key={s.id} gap={0}>
                    <Text size="xs" c="dimmed">{TYPE_LABELS[s.type]}</Text>
                    <Text size="sm" lineClamp={2}>{s.rationale}</Text>
                  </Stack>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}

function SectionBlock({
  title,
  suggestions,
  onAcceptAll,
  onRejectAll,
  onAccept,
  onReject,
  onChat,
  busy,
}: {
  title: string;
  suggestions: Suggestion[];
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onChat: (id: string) => void;
  busy: boolean;
}) {
  if (suggestions.length === 0) return null;
  return (
    <Stack gap={6}>
      <Divider
        labelPosition="left"
        label={
          <Group gap="xs">
            <Text size="xs" fw={600}>{title}</Text>
            <Badge size="xs" variant="light">{suggestions.length}</Badge>
            <Button size="compact-xs" variant="subtle" color="teal" onClick={onAcceptAll} disabled={busy}>
              ✓ all
            </Button>
            <Button size="compact-xs" variant="subtle" color="red" onClick={onRejectAll} disabled={busy}>
              ✗ all
            </Button>
          </Group>
        }
      />
      <ScrollArea h={Math.min(300, suggestions.length * 80)} type="auto">
        <Stack gap={4}>
          {suggestions.map((s) => (
            <Group key={s.id} justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" c="dimmed">{TYPE_LABELS[s.type]}</Text>
                <Text size="sm" lineClamp={2}>{s.rationale}</Text>
              </Stack>
              <SuggestionActions
                onAccept={() => onAccept(s.id)}
                onReject={() => onReject(s.id)}
                onChat={() => onChat(s.id)}
                disabled={busy}
              />
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
