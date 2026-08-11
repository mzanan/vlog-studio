'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { IconCheck, IconX, IconSend } from '@tabler/icons-react';
import { Suggestion, SuggestionType } from '@/lib/suggestions';
import { useApiMutation } from './useApiMutation';
import { useSuggestionMutations } from './useSuggestionMutations';
import { PlanResponse } from './Editor';

const TYPE_LABELS: Record<SuggestionType, string> = {
  'trim-segment': 'Recortar clip',
  'split-segment': 'Partir clip',
  'hide-clip': 'Omitir clip',
  'add-music-section': 'Agregar música',
  'replace-music-track': 'Cambiar música',
  'set-vo-script': 'Voiceover script',
  'add-vo-cue': 'VO cue',
};

function payloadPreview(s: Suggestion): string {
  switch (s.type) {
    case 'trim-segment':
      return `${(s.data.newInMs / 1000).toFixed(1)}s → ${(s.data.newOutMs / 1000).toFixed(1)}s · ${s.data.newCutReason}`;
    case 'split-segment':
      return `${s.data.splits.length} pedazos: ${s.data.splits.map((sp) => `${(sp.inMs / 1000).toFixed(1)}-${(sp.outMs / 1000).toFixed(1)}s`).join(' · ')}`;
    case 'hide-clip':
      return `Omitir clip ${s.data.clipId}`;
    case 'add-music-section':
      return `${s.data.section.mood} · ${s.data.section.energy} · query: ${s.data.section.query}`;
    case 'replace-music-track':
      return `${s.data.next.mood} · query nueva: ${s.data.next.query}`;
    case 'set-vo-script':
      return s.data.newFullScript.slice(0, 200) + (s.data.newFullScript.length > 200 ? '…' : '');
    case 'add-vo-cue':
      return `[${(s.data.cue.startMs / 1000).toFixed(1)}-${(s.data.cue.endMs / 1000).toFixed(1)}s] ${s.data.cue.text.slice(0, 80)}`;
  }
}

export function SuggestionChatModal({
  projectId,
  suggestion,
  opened,
  onClose,
  onChanged,
}: {
  projectId: string;
  suggestion: Suggestion | null;
  opened: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const chatMutation = useApiMutation({
    mutationFn: async (args: { suggestionId: string; message: string }) => {
      const planVersion = qc.getQueryData<PlanResponse>(['edl', projectId])?.planVersion;
      if (typeof planVersion !== 'number') throw new Error('estado del proyecto no cargado todavía, esperá y reintentá');
      const res = await fetch(
        `/api/projects/${projectId}/suggestions/${args.suggestionId}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: args.message, expectedPlanVersion: planVersion }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body as { suggestion: Suggestion; suggestions: Suggestion[]; planVersion: number };
    },
    invalidateKeys: [['render-props', projectId]],
    errorInvalidateKeys: [['edl', projectId]],
    syncPlanCache: { projectId },
    onSuccessExtra: () => {
      setDraft('');
      onChanged();
    },
    errorAutoClose: 6000,
  });

  const { accept, reject } = useSuggestionMutations(projectId, () => {
    onChanged();
    onClose();
  });

  // Auto-scroll al fondo del chat cuando llega un mensaje nuevo.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [suggestion?.chat?.length]);

  if (!suggestion) {
    return (
      <Modal opened={opened} onClose={onClose} title="Chat sobre sugerencia" size="lg">
        <Text c="dimmed" size="sm">Sin sugerencia seleccionada.</Text>
      </Modal>
    );
  }

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    chatMutation.mutate({ suggestionId: suggestion.id, message: text });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={
        <Group gap="xs">
          <Badge color="violet" variant="light">{TYPE_LABELS[suggestion.type]}</Badge>
          <Text size="sm" c="dimmed">chat con la AI</Text>
        </Group>
      }
    >
      <Stack gap="sm">
        <Paper withBorder p="xs" bg="var(--mantine-color-dark-7)" style={{ background: 'var(--mantine-color-gray-0)' }}>
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={600}>Propuesta actual</Text>
            <Text size="sm">{suggestion.rationale}</Text>
            <Text size="xs" c="dimmed">{payloadPreview(suggestion)}</Text>
          </Stack>
        </Paper>

        <ScrollArea h={280} viewportRef={scrollRef} type="auto">
          <Stack gap="xs" p="xs">
            {(!suggestion.chat || suggestion.chat.length === 0) && (
              <Text size="sm" c="dimmed" ta="center">
                Sin mensajes todavía. Pedile al AI un cambio puntual sobre esta sugerencia (ej. &quot;recortá solo del 5s al 8s&quot;).
              </Text>
            )}
            {suggestion.chat?.map((m, i) => (
              <ChatBubble key={i} role={m.role} content={m.content} />
            ))}
            {chatMutation.isPending && (
              <Text size="xs" c="dimmed" ta="center">AI pensando…</Text>
            )}
          </Stack>
        </ScrollArea>

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          placeholder="Pedile al AI un cambio sobre esta sugerencia…"
          autosize
          minRows={2}
          maxRows={6}
          disabled={chatMutation.isPending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <Group justify="space-between">
          <Group gap="xs">
            <Button
              size="sm"
              color="teal"
              leftSection={<IconCheck size={14} />}
              onClick={() => accept.mutate(suggestion.id)}
              loading={accept.isPending}
              disabled={chatMutation.isPending}
            >
              Aceptar versión actual
            </Button>
            <Button
              size="sm"
              variant="default"
              leftSection={<IconX size={14} />}
              onClick={() => reject.mutate(suggestion.id)}
              loading={reject.isPending}
              disabled={chatMutation.isPending}
            >
              Rechazar
            </Button>
          </Group>
          <Button
            size="sm"
            color="violet"
            leftSection={<IconSend size={14} />}
            onClick={handleSend}
            loading={chatMutation.isPending}
            disabled={!draft.trim()}
          >
            Enviar (⌘↵)
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ChatBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          background: isUser ? 'var(--mantine-color-violet-light)' : 'var(--mantine-color-gray-1)',
          color: 'var(--mantine-color-text)',
          padding: '6px 10px',
          borderRadius: 8,
          fontSize: 13,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </div>
    </div>
  );
}
