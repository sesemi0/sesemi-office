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
// نکته: پیش‌فرض قبلی 'gemini-2.0-flash' بود که در GEMINI_MODELS (llm.ts:33) وجود نداشت —
// کاربر تازه‌کلید اولین وظیفهٔ واقعی را با مدلی می‌فرستاد که نه در dropdown است و نه روی API
// (احتمالاً 400/404). حالا با آیتم اول GEMINI_MODELS منطبق است. حالت demo بی‌کلید مستقل از این است.
const defaults: AiConfig = { provider: 'gemini', apiKey: '', model: 'gemini-3.5-flash' };

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

export class AiError extends Error {
  /** 'invalid_key' → کلید باطل/غیرمجاز؛ store با آن سقوط نرم به حالت نمایشی می‌کند */
  code: 'invalid_key' | 'transient' | 'other' = 'other';
  /** وضعیت HTTP وقتی از سرویس‌دهنده آمده باشد (503/429/…) */
  status?: number;
  constructor(message: string, code: 'invalid_key' | 'transient' | 'other' = 'other', status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function runCompletion(config: AiConfig, system: string, userPrompt: string, maxTokens = 2000): Promise<string> {
  if (!config.apiKey.trim()) throw new AiError('کلید API تنظیم نشده است — از بخش «تنظیمات» کلیدت را وارد کن.');
  const key = config.apiKey.trim();
  if (config.provider === 'gemini') {
    // زنجیرهٔ جایگزین: مدل انتخابی اول؛ روی خطای موقت سرور (429/5xx) مدل بعدی امتحان می‌شود
    const candidates = [config.model, ...GEMINI_MODELS.filter(m => m !== config.model)].slice(0, 3);
    let lastStatus = 0;
    let lastBody = '';
    for (const model of candidates) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
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
        lastStatus = response.status;
        lastBody = await response.text().catch(() => '');
        // خطای کلید (401/403) → همان اول قطع با کد invalid_key تا دفتر سقوط نرم کند
        if (response.status === 401 || response.status === 403) {
          throw new AiError('کلید API نامعتبر است — یک کلید جدید از aistudio.google.com بگیر و در تنظیمات وارد کن.', 'invalid_key', response.status);
        }
        // 400/429/5xx → مدل بعدی
        continue;
      }
      const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
      if (!reply) throw new AiError('مدل پاسخ خالی داد — دوباره تلاش کن.');
      return reply;
    }
    throw new AiError(
      `گوگل پاسخ ${lastStatus} داد (حتی با مدل جایگزین) — سرویس موقتاً شلوغ است. کمی بعد «تلاش دوباره» بزن.`,
      lastStatus === 429 || lastStatus >= 500 ? 'transient' : 'other',
      lastStatus,
    );
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
    const code = response.status === 401 || response.status === 403 ? 'invalid_key'
      : (response.status === 429 || response.status >= 500) ? 'transient' : 'other';
    throw new AiError(`سرویس‌دهنده پاسخ ${response.status} داد. ${body.slice(0, 160)}`, code, response.status);
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

/* ---- حالت نمایشی (بدون کلید API) — کاملاً محلی، صفر فراخوانی شبکه ---- */

/** true یعنی هیچ کلیدی تنظیم نشده → وظایف باید با خروجی نمایشی جواب بگیرند نه خطا. */
export function isDemoMode(config: AiConfig): boolean {
  return !config.apiKey.trim();
}

/** هش قطعی FNV-1a برای انتخاب hash-picked تأخیر و واریانت قالب. */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const DEMO_HEADER = '⚠️ نمایشی — این خروجی بدون کلید API تولید شده است.';
const DEMO_FOOTER = '(نمایشی — برای کار واقعی کلید AI بده)';

type DemoKind = 'email' | 'content' | 'research' | 'schedule';

/** مخزن قالب نمایشی: ۳ واریانت باکیفیت فارسی برای هر kind — agentName و لحن نقش را بازتاب می‌دهد. */
const DEMO_TEMPLATES: Record<DemoKind, ((agentName: string, persona: string, detail: string) => string)[]> = {
  email: [
    (name, persona, detail) => `موضوع: پیگیری درخواست شما

سلام و احترام،

از پیام و توجه شما سپاسگزاریم. درخواست شما دربارهٔ «${detail}» بررسی شد و پاسخ کامل تا پایان همین روز کاری برایتان ارسال می‌شود. اگر موضوع فوری‌تری در میان باشد، کافی است همین ایمیل را پاسخ دهید.

با احترام،
${name} — تیم سِسِمی
(لحن پاسخ: ${persona})`,
    (name, persona, detail) => `موضوع: پاسخ به استعلام شما

سلام و روز بخیر،

ممنون از پیام شما دربارهٔ «${detail}». بررسی اولیه انجام شد و همهٔ نکات لازم جمع‌آوری شده است؛ جمع‌بندی نهایی با جزئیات کامل در ایمیل بعدی می‌رسد. پیشنهاد می‌کنیم یک زمان کوتاه هم برای هم‌راستایی تلفنی کنار بگذاریم.

منتظر پاسخ شما هستیم.

${name}
(لحن پاسخ: ${persona})`,
    (name, persona, detail) => `موضوع: ثبت موفق درخواست شما

سلام و احترام،

درخواست شما با موضوع «${detail}» ثبت شد و شمارهٔ پیگیری برای آن صادر گردید. یک نمونهٔ اولیه نیز برای بازبینی شما آماده کرده‌ایم؛ پس از تأیید شما، نسخهٔ نهایی طی دو روز کاری ارسال می‌شود.

با تشکر از اعتماد شما.

${name} — تیم سِسِمی
(لحن پاسخ: ${persona})`,
  ],
  content: [
    (name, persona, detail) => `✨ کپشن پیشنهادی

«ایدهٔ بزرگ از جزئیات کوچک شروع می‌شود.»

${detail} — داستانی که ارزش تعریف‌شدن دارد؛ ما فقط پشت‌صحنهٔ واقعی‌اش را نشان می‌دهیم.

#نوآوری #استودیو #سسِمی

تهیه: ${name} | لحن: ${persona}`,
    (name, persona, detail) => `پست پیشنهادی (اینستاگرام / لینکدین)

عنوان: چطور «${detail}» را ساده بگوییم؟

سه نکتهٔ اجرایی:
۱) پیام اصلی را در خط اول بگذار، نه در پاراگراف آخر.
۲) یک مثال واقعی بیاور، به‌جای ادعای کلی.
۳) با یک دعوت به اقدام روشن تمام کن؛ مثلاً «نظرت را بنویس».

پیش‌نویس: ${name} | لحن: ${persona}`,
    (name, persona, detail) => `کپشن کوتاه و پرانرژی

${detail} 🌱

کار خوب، همان کاری است که پشت‌صحنه‌اش دیده نمی‌شود؛ ما همین را نمایش می‌دهیم. سه خط بیشتر نه — مخاطب امروز عجله دارد.

تهیه: ${name} | لحن: ${persona}`,
  ],
  research: [
    (name, persona, detail) => `گزارش کوتاه تحقیقی — ${detail}

خلاصهٔ یک‌خطی: نشانه‌های اولیه نشان می‌دهد بازار مورد نظر در فاز رشد آرام است و رقابت روی «سادگی تجربه» متمرکز شده.

نکات کلیدی:
۱) تقاضای اصلی از کاربران حرفه‌ای می‌آید، نه کاربران موردی.
۲) رقبا کمتر سراغ افزودن امکانات می‌روند و بیشتر روی ساده‌سازی کار می‌کنند.
۳) مدل قیمت‌گذاری لایه‌ای رایج‌ترین الگو در این حوزه است.

جمع‌بندی عملی: با یک نمونهٔ کوچک شروع کن، تمرکز را روی سادگی بگذار و بعد از هر انتشار بازخورد جمع کن.

⚠️ ارقام این گزارش در حالت نمایشی ساخته شده‌اند و پیش از استفاده نیاز به راستی‌آزمایی دارند.
تحلیلگر: ${name} | سبک: ${persona}`,
    (name, persona, detail) => `بررسی کوتاه بازار — ${detail}

خلاصهٔ یک‌خطی: فاصلهٔ میان عرضه و انتظار کاربر در «زمان پاسخ‌گویی» بیشترین فرصت را می‌سازد.

نکات کلیدی:
۱) مطالعه‌های موجود روی سه گروه هدف قابل دسته‌بندی‌اند: نوآوران، عموم و سازمانی‌ها.
۲) ترند جاری به سمت ابزارهای کم‌دکمه و پاسخ‌دهی سریع است.
۳) رقبای قوی از شبکهٔ معرفی مشتری به‌عنوان کانال رشد اصلی استفاده می‌کنند.

جمع‌بندی عملی: ابتدا گروه «نوآوران» را هدف بگیر، سپس با بهبود زمان پاسخ‌گویی به گروه عموم سوییچ کن.

⚠️ این یافته‌ها نمایشی است و نیاز به راستی‌آزمایی دارد.
تحلیلگر: ${name} | سبک: ${persona}`,
    (name, persona, detail) => `گزارش تحلیل رقبا — ${detail}

خلاصهٔ یک‌خطی: سه بازیگر اصلی این فضا را می‌توان با تفاوت اصلی «کیفیت پشتیبانی» از هم جدا کرد.

نکات کلیدی:
۱) بازیگر اول روی برند و قیمت تکیه دارد؛ ضعفش پاسخ‌دهی کند است.
۲) بازیگر دوم سریع است ولی مستندسازی و آموزش کاربر ضعیفی دارد.
۳) بازیگر سوم کوچک است اما با جامعهٔ کاربری وفادار در حال رشد است.

جمع‌بندی عملی: مزیت رقابتی خود را روی «پشتیبانی سریع + آموزش ساخت‌یافته» تعریف کن.

⚠️ داده‌های این تحلیل نمایشی است و نیاز به راستی‌آزمایی دارد.
تحلیلگر: ${name} | سبک: ${persona}`,
  ],
  schedule: [
    (name, persona, detail) => `برنامهٔ اجرایی «${detail}»

۰۹:۰۰ — تعریف گام‌ها و تقسیم مسئولیت‌ها
۱۰:۳۰ — اجرای گام اول (نمونهٔ اولیه)
۱۳:۰۰ — بازبینی سریع و اصلاح
۱۵:۰۰ — اجرای گام دوم (بهبود بر اساس بازخورد)
۱۷:۰۰ — جمع‌بندی روز و ثبت آموخته‌ها

مسئول هماهنگی: ${name}
سبک اجرا: ${persona}`,
    (name, persona, detail) => `برنامهٔ زمان‌بندی «${detail}» (دو روزه)

روز اول:
• صبح — جمع‌آوری پیش‌نیازها و اولویت‌بندی گام‌ها
• عصر — ساخت نسخهٔ اول

روز دوم:
• صبح — بازخوردگیری و اصلاح
• عصر — نهایی‌سازی و اعلام به تیم

نکته: هر گام یک مسئول مشخص داشته باشد تا کار موازی گم نشود.

هماهنگ‌کننده: ${name}
سبک اجرا: ${persona}`,
    (name, persona, detail) => `چیدمان اولویت برای «${detail}»

۱) فوری و مهم: انجام امروز
۲) مهم ولی نه فوری: زمان‌بندی فردا
۳) فوری ولی نه مهم: واگذاری به تیم
۴) نه فوری نه مهم: حذف یا تعویق

پس از رتبه‌بندی، برای هر آیتم یک بازهٔ زمانی ثابت بگذار تا برنامه واقع‌بینانه بماند.

تهیه‌کننده: ${name}
سبک اجرا: ${persona}`,
  ],
};

/**
 * خروجی نمایشی برای حالت بی‌کلید: هیچ fetchی ندارد. تأخیر شبیه‌سازی 4200–7800ms
 * (hash-picked از kind+نام+detail)، سپس یکی از ۳ واریانت قالب هر kind (hash-picked).
 * خط اول همیشه برچسب نمایشی است و پایان متن هم برچسب دارد، تا کپی/اشتراک هم برچسب را حمل کند.
 */
export async function runDemoCompletion(
  kind: DemoKind,
  agentName: string,
  agentPersona: string,
  detail: string,
): Promise<string> {
  const seed = hashString(`${kind}::${agentName}::${detail}`);
  const delay = 4200 + (seed % 3601); // 4200..7800ms
  await new Promise(resolve => setTimeout(resolve, delay));
  const persona = agentPersona.replace(/^رویکردت:\s*/, '').trim() || 'استاندارد برند';
  const variants = DEMO_TEMPLATES[kind];
  const body = variants[seed % variants.length](agentName, persona, detail);
  return `${DEMO_HEADER}\n\n${body}\n\n${DEMO_FOOTER}`;
}
