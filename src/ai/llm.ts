/**
 * BYOK AI layer — the user's API key lives in localStorage and is sent ONLY to
 * the provider they chose. Gemini works directly from the browser; any
 * OpenAI-compatible endpoint (OpenAI, OpenRouter, GLM…) is supported too.
 */

export type ProviderKind = 'gemini' | 'openai-compat';

export interface AiConfig {
  provider: ProviderKind;
  apiKey: string;
  /** openai-compat only: e.g. https://api.openai.com/v1 */
  baseUrl?: string;
  model: string;
}

const STORAGE_KEY = 'sesemi-office-ai';
const defaults: AiConfig = { provider: 'gemini', apiKey: '', model: 'gemini-2.0-flash' };

export function loadConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    return { ...defaults, ...parsed };
  } catch { return { ...defaults }; }
}

export function saveConfig(config: AiConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* private mode */ }
}

export const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
export const OPENAI_COMPAT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'glm-4-flash', 'openai/gpt-4o-mini'];

export class AiError extends Error {}

export async function runCompletion(config: AiConfig, system: string, userPrompt: string, maxTokens = 2000): Promise<string> {
  if (!config.apiKey.trim()) throw new AiError('کلید API تنظیم نشده است — از بخش «تنظیمات» کلیدت را وارد کن.');
  const key = config.apiKey.trim();
  if (config.provider === 'gemini') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(45000),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AiError(`گوگل پاسخ ${response.status} داد. کلید یا مدل را بررسی کن. ${body.slice(0, 160)}`);
    }
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!reply) throw new AiError('مدل پاسخ خالی داد — دوباره تلاش کن.');
    return reply;
  }
  // OpenAI-compatible chat completions
  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AiError(`سرویس‌دهنده پاسخ ${response.status} داد. ${body.slice(0, 160)}`);
  }
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new AiError('مدل پاسخ خالی داد — دوباره تلاش کن.');
  return reply;
}

/** Per-task prompt builders — the office work contracts. */
export function taskPrompt(kind: 'email' | 'content' | 'research' | 'schedule', detail: string): string {
  switch (kind) {
    case 'email':
      return `یک ایمیل فارسیِ حرفه‌ای بنویس.\nدرخواست: ${detail}\nقالب: موضوع + بدنهٔ کامل + امضای «تیم سسِمی». لحن: گرم، حرفه‌ای، بدون اغراق.`;
    case 'content':
      return `محتوای فارسی آمادهٔ انتشار تولید کن.\nدرخواست: ${detail}\nاگر کپشن است چند گزینه بده؛ اگر پست/مقاله است با تیتر و پاراگراف‌بندی تمیز. لحن برند: خلاق، روشن، بدون کلیشه.`;
    case 'research':
      return `یک گزارش تحقیقی فارسی کوتاه (حداکثر ۴۰۰ کلمه) تهیه کن.\nموضوع: ${detail}\nساختار: خلاصهٔ یک‌خطی، ۳ نکتهٔ کلیدی، جمع‌بندی عملی. اگر چیزی مطمئن نیستی صریح بگو «نیاز به راستی‌آزمایی».`;
    case 'schedule':
      return `یک برنامهٔ اجرایی فارسی بچین.\nهدف: ${detail}\nخروجی: جدول زمانی گام‌به‌گام با تخمین زمان و مسئول پیشنهادی. کوتاه و قابل اجرا.`;
  }
}
