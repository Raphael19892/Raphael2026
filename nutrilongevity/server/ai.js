// AI integration (Claude via the official Anthropic SDK) with a transparent rule-based fallback
// that works without an API key. The model may only cite references from the curated library.
import Anthropic from '@anthropic-ai/sdk';
import { buildContext, extractRefs, stripUnknownRefs, fallbackAnswer, SYSTEM_PROMPT as SYSTEM } from '../shared/assistant.js';

export { buildContext };

const MODEL = process.env.NL_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.NL_EFFORT || 'medium';

let client = null;
export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}



export async function chat({ history, message, contextText }) {
  if (!aiAvailable()) return { ...fallbackAnswer(message, contextText), mode: 'offline' };
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: `<user_context>\n${contextText}\n</user_context>\n\n${message}` },
  ];
  const resp = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: EFFORT },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  if (resp.stop_reason === 'refusal') {
    return { text: 'I can’t help with that request. For medical questions please speak with your physician or a registered dietitian.', refs: [], mode: 'ai' };
  }
  const text = stripUnknownRefs(resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim());
  return { text, refs: extractRefs(text), mode: 'ai', model: resp.model };
}

const LABEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['productName', 'ingredientsText', 'per100', 'basis', 'servingSizeG', 'confidenceNotes'],
  properties: {
    productName: { type: 'string' },
    ingredientsText: { type: 'string' },
    basis: { type: 'string', enum: ['per100g', 'per100ml', 'perServingConverted', 'unknown'] },
    servingSizeG: { type: ['number', 'null'] },
    per100: {
      type: 'object', additionalProperties: false,
      required: ['kcal', 'protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'fiber', 'sodium'],
      properties: Object.fromEntries(['kcal', 'protein', 'carbs', 'sugars', 'addedSugar', 'fat', 'satFat', 'fiber', 'sodium'].map((k) => [k, { type: ['number', 'null'] }])),
    },
    confidenceNotes: { type: 'string' },
  },
};

/** Read a nutrition label / ingredient list photo. Returns values exactly as printed (converted to per 100 g). */
export async function readLabel(imageBase64, mediaType) {
  if (!aiAvailable()) { const e = new Error('AI not configured'); e.status = 503; throw e; }
  const resp = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: LABEL_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: 'Transcribe this food label. Copy the ingredient list verbatim (translate to English only if it is not in English or Hebrew; keep Hebrew as is). Give nutrition values per 100 g (or per 100 ml); if only per-serving values are printed and the serving weight is printed, convert to per 100 g and set basis to perServingConverted. Sodium in mg (if only salt is printed, sodium = salt × 400 mg per g). Use null for anything not printed — never guess. Note any unreadable parts in confidenceNotes.' },
      ],
    }],
  });
  if (resp.stop_reason === 'refusal') { const e = new Error('Label could not be processed'); e.status = 422; throw e; }
  const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

