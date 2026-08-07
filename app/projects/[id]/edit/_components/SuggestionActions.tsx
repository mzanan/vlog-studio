'use client';

import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { IconCheck, IconX, IconMessage } from '@tabler/icons-react';

export function SuggestionActions({
  onAccept,
  onReject,
  onChat,
  disabled = false,
  size = 'xs',
}: {
  onAccept: () => void;
  onReject: () => void;
  onChat?: () => void;
  disabled?: boolean;
  size?: 'xs' | 'sm';
}) {
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  return (
    <Group gap={2} wrap="nowrap" onPointerDown={stop} onClick={stop}>
      <Tooltip label="Aceptar sugerencia AI" withinPortal>
        <ActionIcon
          size={size}
          variant="filled"
          color="teal"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onAccept();
          }}
          aria-label="Aceptar sugerencia"
        >
          <IconCheck size={12} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Rechazar sugerencia AI" withinPortal>
        <ActionIcon
          size={size}
          variant="filled"
          color="red"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onReject();
          }}
          aria-label="Rechazar sugerencia"
        >
          <IconX size={12} />
        </ActionIcon>
      </Tooltip>
      {onChat && (
        <Tooltip label="Chatear sobre esto con la AI" withinPortal>
          <ActionIcon
            size={size}
            variant="filled"
            color="violet"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onChat();
            }}
            aria-label="Chatear sobre esta sugerencia"
          >
            <IconMessage size={12} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
