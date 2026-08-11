'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ActionIcon, Group, Paper, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import { PlayerRef } from '@remotion/player';
import { Edl, EdlSegment, MusicSection, segmentDurationMs } from '@/lib/edl';
import { Suggestion, SuggestionType } from '@/lib/suggestions';
import { useLocalStorageValue, setLocalStorageValue } from '@/hooks/useLocalStorageValue';
import { ClipMeta } from './Editor';
import { VideoTrack, VideoSegmentItem } from './VideoTrack';
import { MusicTrack } from './MusicTrack';
import { VoTrack } from './VoTrack';
import { useApiMutation } from './useApiMutation';
import { useSuggestionMutations } from './useSuggestionMutations';
import { requirePlanVersion, syncPlanCache } from '@/lib/plan-version';
import { MusicPickerModal, NewSectionMeta, SectionMeta } from './MusicPickerModal';
import { Playhead } from './Playhead';

export const DEFAULT_PX_PER_SEC = 50;
export const TRACK_HEIGHT = 64;
const LABEL_GUTTER_PX = 68; // 60 label + 8 gap
const RULER_HEIGHT = 20;
const STACK_GAP = 6;
const MIN_PX_PER_SEC = 15;
const MAX_PX_PER_SEC = 200;
const ZOOM_STEP = 1.4;

function parsePxPerSec(raw: string | null): number {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= MIN_PX_PER_SEC && n <= MAX_PX_PER_SEC ? n : DEFAULT_PX_PER_SEC;
}

const VIDEO_TYPES: SuggestionType[] = ['trim-segment', 'split-segment', 'hide-clip'];
const MUSIC_TYPES: SuggestionType[] = ['add-music-section', 'replace-music-track'];
const VO_TYPES: SuggestionType[] = ['set-vo-script', 'add-vo-cue'];

export function Timeline({
  projectId,
  edl,
  suggestions,
  clips,
  onChanged,
  playerRef,
  currentFrame,
  fps,
  onChatSuggestion,
}: {
  projectId: string;
  edl: Edl;
  suggestions: Suggestion[];
  clips: ClipMeta[];
  onChanged: () => void;
  playerRef: React.RefObject<PlayerRef | null>;
  currentFrame: number;
  fps: number;
  onChatSuggestion: (id: string) => void;
}) {
  // Zoom: persiste por proyecto en localStorage.
  const zoomKey = `vlog-studio:zoom:${projectId}`;
  const pxPerSec = useLocalStorageValue(zoomKey, parsePxPerSec);
  const updateZoom = (factor: number) => {
    const next = Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, pxPerSec * factor));
    setLocalStorageValue(zoomKey, String(next));
  };

  const videoItems = useMemo<VideoSegmentItem[]>(
    () =>
      edl.segments.map((seg, idx) => ({
        id: seg.id,
        idx,
        seg,
        widthPx: (segmentDurationMs(seg) / 1000) * pxPerSec,
      })),
    [edl.segments, pxPerSec],
  );

  const totalMs = videoItems.reduce((acc, it) => acc + segmentDurationMs(it.seg), 0);
  const totalWidthPx = Math.max(600, (totalMs / 1000) * pxPerSec + 40);
  const clipsLookup = useMemo(() => Object.fromEntries(clips.map((c) => [c.id, c])), [clips]);

  const pending = useMemo(() => suggestions.filter((s) => s.status === 'pending'), [suggestions]);
  const videoSuggestions = useMemo(() => pending.filter((s) => VIDEO_TYPES.includes(s.type)), [pending]);
  const musicSuggestions = useMemo(() => pending.filter((s) => MUSIC_TYPES.includes(s.type)), [pending]);
  const voSuggestions = useMemo(() => pending.filter((s) => VO_TYPES.includes(s.type)), [pending]);

  const { accept, reject } = useSuggestionMutations(projectId, onChanged);
  const qc = useQueryClient();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const totalDurationFrames = Math.max(1, Math.round((totalMs / 1000) * fps));
  const currentMs = fps > 0 ? (currentFrame / fps) * 1000 : 0;

  // Auto-scroll: cuando el playhead cae fuera de la zona visible (típico durante
  // playback), corrimos el scroll horizontal para mantenerlo a la vista.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const playheadX = LABEL_GUTTER_PX + (currentMs / 1000) * pxPerSec;
    if (!Number.isFinite(playheadX)) return;
    const { scrollLeft, clientWidth } = viewport;
    const margin = 100;
    if (playheadX > scrollLeft + clientWidth - margin) {
      // Saltó al sector derecho — corremos para poner el playhead al 30% desde el borde izquierdo.
      viewport.scrollLeft = playheadX - clientWidth * 0.3;
    } else if (playheadX < scrollLeft + margin) {
      viewport.scrollLeft = Math.max(0, playheadX - margin);
    }
  }, [currentMs, pxPerSec]);

  const seekToMs = (ms: number) => {
    if (!playerRef.current) return;
    const frame = Math.max(0, Math.min(totalDurationFrames, Math.round((ms / 1000) * fps)));
    playerRef.current.seekTo(frame);
  };

  const patchEdl = useApiMutation({
    mutationFn: async (newEdl: Edl) => {
      const res = await fetch(`/api/projects/${projectId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edl: newEdl, expectedPlanVersion: requirePlanVersion(qc, projectId) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body as { edl: Edl; planVersion: number };
    },
    invalidateKeys: [['render-props', projectId]],
    errorInvalidateKeys: [['edl', projectId]],
    onSuccessCache: (result) => syncPlanCache(qc, projectId, result),
    onSuccessExtra: () => onChanged(),
    errorAutoClose: 6000,
  });

  const handleReorder = (newOrder: string[]) => {
    const byId = new Map(videoItems.map((it) => [it.id, it.seg]));
    const newSegments = newOrder
      .map((id) => byId.get(id))
      .filter((s): s is EdlSegment => Boolean(s));
    if (newSegments.length !== edl.segments.length) return;
    patchEdl.mutate({ ...edl, segments: newSegments });
  };

  const handleRestoreClip = (segmentItemId: string) => {
    const idx = videoItems.findIndex((it) => it.id === segmentItemId);
    if (idx < 0) return;
    const seg = videoItems[idx].seg;
    const clip = clipsLookup[seg.clipId];
    if (!clip) return;
    if (seg.inMs === 0 && seg.outMs === clip.durationMs) return;
    const restored: EdlSegment =
      seg.kind === 'clip'
        ? { ...seg, inMs: 0, outMs: clip.durationMs, cutReason: '' }
        : { ...seg, inMs: 0, outMs: clip.durationMs };
    const newSegments = [...edl.segments];
    newSegments[idx] = restored;
    patchEdl.mutate({ ...edl, segments: newSegments });
  };

  const [pickerSection, setPickerSection] = useState<SectionMeta | null>(null);
  const [pickerNew, setPickerNew] = useState<NewSectionMeta | null>(null);
  // Se recuerda el key del último target abierto para no cambiarlo al cerrar:
  // eso mantendría montado el mismo MusicPickerModal durante su transición de
  // salida en vez de desmontarlo en seco. Patrón "storing information from
  // previous renders" de React: setState condicional durante el render.
  const [pickerKey, setPickerKey] = useState('closed');
  const pickerOpenKey = pickerSection?.id ?? (pickerNew ? `new-${pickerNew.startMs}-${pickerNew.endMs}` : null);
  if (pickerOpenKey !== null && pickerOpenKey !== pickerKey) setPickerKey(pickerOpenKey);

  const handlePickMusic = (sec: MusicSection) => {
    setPickerSection({
      id: sec.id,
      query: sec.query,
      mood: sec.mood,
      energy: sec.energy,
      durationMs: sec.endMs - sec.startMs,
      trackId: sec.trackId,
      baseVolume: sec.baseVolume,
    });
  };

  const handleInsertMusic = (startMs: number, endMs: number) => {
    setPickerNew({ startMs, endMs });
  };

  const onAcceptSug = (id: string) => accept.mutate(id);
  const onRejectSug = (id: string) => reject.mutate(id);

  const innerHeight = RULER_HEIGHT + STACK_GAP + TRACK_HEIGHT * 3 + STACK_GAP * 2;

  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Space play/pause · ←/→ ±5s · shift+←/→ ±10s · click regla o arrastrá playhead · click zona vacía de música para insertar
          </Text>
          <Group gap={4}>
            <Tooltip label="Zoom out" withinPortal>
              <ActionIcon
                size="sm"
                variant="default"
                onClick={() => updateZoom(1 / ZOOM_STEP)}
                disabled={pxPerSec <= MIN_PX_PER_SEC + 0.01}
              >
                <IconZoomOut size={14} />
              </ActionIcon>
            </Tooltip>
            <Text size="xs" c="dimmed" style={{ minWidth: 40, textAlign: 'center' }}>
              {Math.round(pxPerSec)}px/s
            </Text>
            <Tooltip label="Zoom in" withinPortal>
              <ActionIcon
                size="sm"
                variant="default"
                onClick={() => updateZoom(ZOOM_STEP)}
                disabled={pxPerSec >= MAX_PX_PER_SEC - 0.01}
              >
                <IconZoomIn size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        <ScrollArea type="hover" offsetScrollbars viewportRef={viewportRef}>
          <div ref={containerRef} style={{ position: 'relative', minWidth: totalWidthPx }}>
            <Stack gap={STACK_GAP}>
              <Ruler
                totalMs={totalMs}
                widthPx={totalWidthPx}
                pxPerSec={pxPerSec}
                onSeekMs={seekToMs}
              />
              <TrackRow label="Video">
                <VideoTrack
                  items={videoItems}
                  clipsLookup={clipsLookup}
                  suggestions={videoSuggestions}
                  onReorder={handleReorder}
                  onRestoreClip={handleRestoreClip}
                  onAcceptSuggestion={onAcceptSug}
                  onRejectSuggestion={onRejectSug}
                  onChatSuggestion={onChatSuggestion}
                />
              </TrackRow>
              <TrackRow label="Música">
                <MusicTrack
                  sections={edl.music.sections}
                  suggestions={musicSuggestions}
                  pxPerSec={pxPerSec}
                  totalMs={totalMs}
                  onPick={handlePickMusic}
                  onInsert={handleInsertMusic}
                  onAcceptSuggestion={onAcceptSug}
                  onRejectSuggestion={onRejectSug}
                  onChatSuggestion={onChatSuggestion}
                />
              </TrackRow>
              <TrackRow label="Voz">
                <VoTrack
                  cues={edl.voiceover.cues}
                  suggestions={voSuggestions}
                  pxPerSec={pxPerSec}
                  onAcceptSuggestion={onAcceptSug}
                  onRejectSuggestion={onRejectSug}
                  onChatSuggestion={onChatSuggestion}
                />
              </TrackRow>
            </Stack>
            {totalMs > 0 && (
              <Playhead
                currentMs={currentMs}
                totalMs={totalMs}
                leftOffset={LABEL_GUTTER_PX}
                pxPerSec={pxPerSec}
                height={innerHeight}
                containerRef={containerRef}
                onSeekMs={seekToMs}
              />
            )}
          </div>
        </ScrollArea>
      </Stack>
      <MusicPickerModal
        key={pickerKey}
        projectId={projectId}
        section={pickerSection}
        newSection={pickerNew}
        opened={pickerSection !== null || pickerNew !== null}
        onClose={() => {
          setPickerSection(null);
          setPickerNew(null);
        }}
        onChanged={onChanged}
      />
    </Paper>
  );
}

function TrackRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
      <div
        style={{
          width: 60,
          flexShrink: 0,
          fontSize: 12,
          color: 'var(--mantine-color-dimmed)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, position: 'relative', height: TRACK_HEIGHT }}>{children}</div>
    </div>
  );
}

function Ruler({
  totalMs,
  widthPx,
  pxPerSec,
  onSeekMs,
}: {
  totalMs: number;
  widthPx: number;
  pxPerSec: number;
  onSeekMs: (ms: number) => void;
}) {
  const totalSec = totalMs / 1000;
  const step = totalSec > 60 ? 10 : totalSec > 30 ? 5 : 2;
  const ticks: number[] = [];
  for (let s = 0; s <= totalSec; s += step) ticks.push(s);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xWithin = e.clientX - rect.left;
    const ms = Math.max(0, Math.min(totalMs, (xWithin / pxPerSec) * 1000));
    onSeekMs(ms);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        marginLeft: 68,
        position: 'relative',
        height: RULER_HEIGHT,
        minWidth: widthPx,
        cursor: 'pointer',
      }}
      title="Click para mover el playhead"
    >
      {ticks.map((s) => (
        <div
          key={s}
          style={{
            position: 'absolute',
            left: s * pxPerSec,
            top: 0,
            fontSize: 10,
            color: 'var(--mantine-color-dimmed)',
            pointerEvents: 'none',
          }}
        >
          {s}s
        </div>
      ))}
    </div>
  );
}
