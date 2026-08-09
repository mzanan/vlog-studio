import Anthropic from '@anthropic-ai/sdk';
import { Edl } from '../edl';
import { Chapter, VisionTag } from '../chapters';
import { LlmEdl, PlanInput, buildPlannerSystem, buildUserMessage, resolveLlmEdl } from './prompts';
import {
  LlmChaptersResult,
  buildChapterPlannerSystem,
  buildChapterUserMessage,
  resolveLlmChapters,
} from './chapterPrompts';

const EDL_TOOL: Anthropic.Tool = {
  name: 'emit_edl',
  description: 'Devuelve el Edit Decision List intermedio (segmentIdx-based, el server resuelve a tiempos absolutos).',
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
                keepFromWordIdx: { type: 'integer' },
                keepToWordIdx: { type: 'integer' },
                cutReason: { type: 'string' },
              },
              required: ['kind', 'clipId', 'keepFromWordIdx', 'keepToWordIdx', 'cutReason'],
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: ['broll'] },
                clipId: { type: 'string' },
                inMs: { type: 'integer' },
                outMs: { type: 'integer' },
              },
              required: ['kind', 'clipId', 'inMs', 'outMs'],
            },
          ],
        },
      },
      voiceover: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fullScript: { type: 'string' },
          cues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                startSegmentIdx: { type: 'integer' },
                text: { type: 'string' },
              },
              required: ['startSegmentIdx', 'text'],
            },
          },
        },
        required: ['fullScript', 'cues'],
      },
      music: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                startSegmentIdx: { type: 'integer' },
                endSegmentIdx: { type: 'integer' },
                query: { type: 'string' },
                mood: { type: 'string' },
                energy: { type: 'string', enum: ['low', 'mid', 'high'] },
                baseVolume: { type: 'number' },
                reason: { type: 'string' },
              },
              required: ['startSegmentIdx', 'endSegmentIdx', 'query', 'mood', 'energy', 'reason'],
            },
          },
        },
        required: ['sections'],
      },
    },
    required: ['segments', 'voiceover', 'music'],
  },
};

export async function generateEdlAnthropic(input: PlanInput): Promise<{ edl: Edl; llmEdl: LlmEdl }> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: buildPlannerSystem(input.cutPreset),
    tools: [EDL_TOOL],
    tool_choice: { type: 'tool', name: 'emit_edl' },
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'emit_edl',
  );
  if (!toolUse) throw new Error('Claude no devolvió tool_use de emit_edl');

  const llmEdl = toolUse.input as LlmEdl;
  return { edl: resolveLlmEdl(llmEdl, input), llmEdl };
}

const CHAPTERS_TOOL: Anthropic.Tool = {
  name: 'emit_chapters',
  description: 'Devuelve la agrupación de clips en capítulos de video, cada uno con título, ids ordenados y razón.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      chapters: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            clipIds: { type: 'array', items: { type: 'string' } },
            reason: { type: 'string' },
          },
          required: ['title', 'clipIds', 'reason'],
        },
      },
    },
    required: ['chapters'],
  },
};

export async function generateChaptersAnthropic(
  tags: VisionTag[]
): Promise<{ chapters: Chapter[]; llmResult: LlmChaptersResult }> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: buildChapterPlannerSystem(),
    tools: [CHAPTERS_TOOL],
    tool_choice: { type: 'tool', name: 'emit_chapters' },
    messages: [{ role: 'user', content: buildChapterUserMessage(tags) }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'emit_chapters'
  );
  if (!toolUse) throw new Error('Claude no devolvió tool_use de emit_chapters');

  const llmResult = toolUse.input as LlmChaptersResult;
  return { chapters: resolveLlmChapters(llmResult, tags), llmResult };
}
