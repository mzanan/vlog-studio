import Anthropic from '@anthropic-ai/sdk';
import { Edl, isValidEdl } from '../edl';
import { PLANNER_SYSTEM, PlanInput, buildUserMessage } from './prompts';

const EDL_TOOL: Anthropic.Tool = {
  name: 'emit_edl',
  description: 'Devuelve el Edit Decision List final.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      segments: {
        type: 'array',
        items: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: ['clip'] },
                clipId: { type: 'string' },
                inMs: { type: 'integer' },
                outMs: { type: 'integer' },
                reason: { type: 'string' },
              },
              required: ['kind', 'clipId', 'inMs', 'outMs', 'reason'],
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: ['voiceover'] },
                script: { type: 'string' },
                durationEstimateMs: { type: 'integer' },
                brollClipIds: { type: 'array', items: { type: 'string' } },
                reason: { type: 'string' },
              },
              required: ['kind', 'script', 'durationEstimateMs', 'brollClipIds', 'reason'],
            },
          ],
        },
      },
      musicHints: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            segmentIdx: { type: 'integer' },
            mood: { type: 'string' },
            energy: { type: 'string', enum: ['low', 'mid', 'high'] },
          },
          required: ['segmentIdx', 'mood', 'energy'],
        },
      },
    },
    required: ['segments', 'musicHints'],
  },
};

export async function generateEdlAnthropic(input: PlanInput): Promise<Edl> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: PLANNER_SYSTEM,
    tools: [EDL_TOOL],
    tool_choice: { type: 'tool', name: 'emit_edl' },
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'emit_edl',
  );
  if (!toolUse) throw new Error('Claude no devolvió tool_use de emit_edl');

  const data = toolUse.input as Record<string, unknown>;
  const edl: Edl = {
    segments: data.segments as Edl['segments'],
    musicHints: data.musicHints as Edl['musicHints'],
    intent: input.intent,
    targetDurationSec: input.targetDurationSec,
    generatedAt: new Date().toISOString(),
  };
  if (!isValidEdl(edl)) throw new Error('EDL devuelto por Claude no es válido');
  return edl;
}
