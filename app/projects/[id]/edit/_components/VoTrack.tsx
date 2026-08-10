'use client';

import { Tooltip } from '@mantine/core';
import { EdlVoiceoverCue } from '@/lib/edl';
import { Suggestion } from '@/lib/suggestions';
import { SuggestionActions } from './SuggestionActions';

export function VoTrack({
  cues,
  suggestions,
  pxPerSec,
  onAcceptSuggestion,
  onRejectSuggestion,
  onChatSuggestion,
}: {
  cues: EdlVoiceoverCue[];
  suggestions: Suggestion[];
  pxPerSec: number;
  onAcceptSuggestion: (id: string) => void;
  onRejectSuggestion: (id: string) => void;
  onChatSuggestion: (id: string) => void;
}) {
  const setScriptSuggestion = suggestions.find((s) => s.type === 'set-vo-script');
  const cueSuggestions = suggestions.filter((s) => s.type === 'add-vo-cue');

  if (cues.length === 0 && cueSuggestions.length === 0 && !setScriptSuggestion) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: 'var(--mantine-color-dimmed)',
        }}
      >
        Sin voiceover en este plan
      </div>
    );
  }

  return (
    <>
      {cues.map((cue, idx) => {
        const startPx = (cue.startMs / 1000) * pxPerSec;
        const widthPx = Math.max(20, ((cue.endMs - cue.startMs) / 1000) * pxPerSec - 2);
        return (
          <Tooltip key={`cue-${idx}`} label={cue.text} multiline w={300} withinPortal>
            <div
              style={{
                position: 'absolute',
                left: startPx,
                width: widthPx,
                height: '100%',
                background: 'var(--mantine-color-orange-light)',
                border: '1px solid var(--mantine-color-orange-6)',
                borderRadius: 4,
                padding: '4px 6px',
                overflow: 'hidden',
                fontSize: 11,
                color: 'var(--mantine-color-text)',
              }}
            >
              <div style={{ fontWeight: 600 }}>VO #{idx + 1}</div>
              <div style={{ fontSize: 10, opacity: 0.7, lineHeight: 1.1 }}>
                {cue.text.slice(0, 60)}
                {cue.text.length > 60 ? '…' : ''}
              </div>
            </div>
          </Tooltip>
        );
      })}

      {cueSuggestions.map((s) => {
        if (s.type !== 'add-vo-cue') return null;
        const startPx = (s.data.cue.startMs / 1000) * pxPerSec;
        const widthPx = Math.max(20, ((s.data.cue.endMs - s.data.cue.startMs) / 1000) * pxPerSec - 2);
        return (
          <Tooltip key={s.id} label={`AI propone: ${s.data.cue.text}`} multiline w={320} withinPortal>
            <div
              style={{
                position: 'absolute',
                left: startPx,
                width: widthPx,
                height: '100%',
                background: 'rgba(255, 165, 0, 0.12)',
                border: '2px dashed var(--mantine-color-orange-7)',
                borderRadius: 4,
                padding: '4px 6px',
                overflow: 'hidden',
                fontSize: 11,
                color: 'var(--mantine-color-text)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 10 }}>AI cue</div>
                <div style={{ fontSize: 9, opacity: 0.8, lineHeight: 1.1 }}>
                  {s.data.cue.text.slice(0, 40)}
                  {s.data.cue.text.length > 40 ? '…' : ''}
                </div>
              </div>
              <div style={{ alignSelf: 'flex-end' }}>
                <SuggestionActions
                  onAccept={() => onAcceptSuggestion(s.id)}
                  onReject={() => onRejectSuggestion(s.id)}
                  onChat={() => onChatSuggestion(s.id)}
                />
              </div>
            </div>
          </Tooltip>
        );
      })}

      {setScriptSuggestion && setScriptSuggestion.type === 'set-vo-script' && (
        <Tooltip
          label={`AI propone fullScript:\n${setScriptSuggestion.data.newFullScript.slice(0, 400)}${setScriptSuggestion.data.newFullScript.length > 400 ? '…' : ''}`}
          multiline
          w={420}
          withinPortal
        >
          <div
            style={{
              position: 'absolute',
              right: 4,
              top: 2,
              background: 'var(--mantine-color-orange-9)',
              color: 'white',
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 3,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              zIndex: 3,
            }}
          >
            AI: script disponible
            <SuggestionActions
              onAccept={() => onAcceptSuggestion(setScriptSuggestion.id)}
              onReject={() => onRejectSuggestion(setScriptSuggestion.id)}
              onChat={() => onChatSuggestion(setScriptSuggestion.id)}
            />
          </div>
        </Tooltip>
      )}
    </>
  );
}
