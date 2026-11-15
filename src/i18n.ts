/**
 * SESEMI Office i18n — Persian (native default), English and Armenian.
 * Untranslated keys gracefully fall back to the Persian string, so the app
 * never shows bare keys. Language lives in localStorage and sets <html lang/dir>.
 */
export type Lang = 'fa' | 'en' | 'hy';

const STORE_KEY = 'sesemi-office-lang';
let current: Lang = 'fa';
try { const saved = localStorage.getItem(STORE_KEY); if (saved === 'en' || saved === 'fa' || saved === 'hy') current = saved; } catch { /* private mode */ }

type Dict = Record<string, string>;

/** fa values are the canonical UI strings (fall-back for every key) */
const fa: Dict = {
  'tab.missions': 'مأموریت‌ها', 'tab.task': 'وظیفه', 'tab.team': 'تیم', 'tab.feed': 'فعالیت', 'tab.office': 'دفتر مدیر', 'tab.tasks': 'وظایف‌ها',
  'common.refresh': 'تازه‌سازی', 'common.cancel': 'لغو', 'common.retry': 'تلاش دوباره', 'common.viewResult': 'دیدن نتیجه', 'common.closeResult': 'بستن نتیجه', 'common.close': 'بستن', 'common.resetView': 'بازنشانی نما', 'common.settings': '⚙️ تنظیمات AI', 'common.zen': 'حالت تمرکز',
  'brand.name': 'دفتر سسِمی', 'brand.tag': 'شبیه‌ساز شرکت هوشمند',
  'banner.demo': 'حالت نمایش فعال است — کلیدت را در تنظیمات بده تا کار واقعی انجام شود',
  'welcome.title': 'دفتر زندهٔ تیم هوش مصنوعی', 'welcome.sub': 'یک جمله بنویس — تیم AI برنامه می‌ریزد، سر کار می‌رود و نتیجه را تحویل می‌دهد. همین.',
  'welcome.chip1': '🖥 سایت و لندینگ', 'welcome.chip2': '✍️ محتوا و کپشن', 'welcome.chip3': '🔍 تحقیق و گزارش', 'welcome.chip4': '🗓 برنامه‌ریزی',
  'welcome.cta': 'همین حالا به تیم کار بده', 'welcome.hint': 'بدون کلید هم کار می‌کند (حالت نمایشی) · اعلان‌ها به تلگرام می‌رود · دفتر با هر کارِ انجام‌شده بزرگ‌تر می‌شود',
  'form.title': 'دادن وظیفه', 'form.specific': 'ایجنت مشخص', 'form.auto': 'آرش — تخصیص خودکار', 'form.agent': 'ایجنت', 'form.kind': 'نوع کار', 'form.titleField': 'عنوان', 'form.optional': 'اختیاری', 'form.ask': 'خواستهٔ تو', 'form.submit': 'سپردن وظیفه به ایجنت', 'form.submitBoss': 'سپردن بریف به آرش', 'form.autoHint': 'آرش بر اساس نوع کار بین تیم تقسیم می‌کند.', 'form.askPlaceholder': 'مثلاً: به مشتری که سفارش طراحی سایت پرسیده، یک پاسخ گرم با اشاره به زمان‌بندی بنویس', 'form.errorEmpty': 'چیزی برای ایجنت بنویس (خواستهٔ خودت).',
  'missions.title': 'مأموریت‌ها', 'missions.live': 'زنده از Mission Control', 'missions.goal': 'هدف بده به تیم', 'missions.launch': 'ساخت مأموریت و شروع فوری', 'missions.planning': '🧠 هوش مصنوعی در حال برنامه‌ریزی است… (حدود ۱۰ ثانیه)', 'missions.launchHint': 'AI برنامه می‌ریزد، تلگرامت خبر می‌گیرد و ایجنت‌ها همان لحظه سر کار می‌روند.', 'missions.empty': 'مأموریتی در تابلو نیست — از پنل یا تلگرام یکی بساز.', 'missions.handOver': 'به دفتر بسپار', 'missions.handed': 'سپرده شد', 'missions.inOffice': 'در دفتر', 'missions.stale': 'Mission Control در دسترس نیست — آخرین وضعیت ذخیره‌شده نشان داده می‌شود؛ چند لحظه بعد دوباره تلاش می‌کنیم.', 'missions.placeholder': 'مثلاً: برای برند قهوه یک فرم سفارش آنلاین بساز، یه لندینگ پیج می‌خوام',
  'status.done': 'انجام شد', 'status.failed': 'ناموفق', 'status.active': 'فعال', 'status.queued': 'در صف',
  'office.title': 'دفتر مدیر', 'office.summary': 'خلاصهٔ روز', 'office.done': 'انجام شد', 'office.failed': 'ناموفق', 'office.ongoing': 'در جریان', 'office.team': 'تیم', 'office.reports': 'گزارش‌های ایجنت‌ها', 'office.generate': 'تولید بریفینگ', 'office.generating': 'در حال تولید…', 'office.withAI': 'با هوش مصنوعی',
  'team.title': 'تیم دفتر', 'team.hint': 'ایجنت — برای شخصی‌سازی روی هرکدام بزن',
  'tasks.title': 'وظایف', 'tasks.empty': 'هنوز وظیفه‌ای نداده‌ای — از پنل «دادن وظیفه» شروع کن.',
  'feed.title': 'فعالیت زندهٔ دفتر', 'feed.clear': 'پاک‌کردن',
  'preview.title': 'پیش‌نمایش صفحهٔ ساخته‌شده', 'preview.newTab': 'تب جدید', 'preview.download': 'دانلود HTML',
  'state.idle': 'آماده', 'state.walking': 'در حال رفتن', 'state.working': 'در حال کار', 'state.meeting': 'جلسه', 'state.coffee': 'قهوه', 'state.arriving': 'رسیدن',
};

const en: Dict = {
  'tab.missions': 'Missions', 'tab.task': 'New task', 'tab.team': 'Team', 'tab.feed': 'Activity', 'tab.office': 'Boss office', 'tab.tasks': 'Tasks',
  'common.refresh': 'Refresh', 'common.cancel': 'Cancel', 'common.retry': 'Retry', 'common.viewResult': 'View result', 'common.closeResult': 'Hide result', 'common.close': 'Close', 'common.resetView': 'Reset view', 'common.settings': '⚙️ AI settings', 'common.zen': 'Focus mode',
  'brand.name': 'SESEMI Office', 'brand.tag': 'AI company simulator',
  'banner.demo': 'Demo mode is on — add your key in settings for real work',
  'welcome.title': 'A live AI team, in one office', 'welcome.sub': 'Write one sentence — the AI team plans it, heads to work and delivers the result. That simple.',
  'welcome.chip1': '🖥 Sites & landing pages', 'welcome.chip2': '✍️ Content & captions', 'welcome.chip3': '🔍 Research & reports', 'welcome.chip4': '🗓 Scheduling',
  'welcome.cta': 'Put the team to work', 'welcome.hint': 'Works without a key (demo mode) · Telegram alerts · the office grows with every delivery',
  'form.title': 'Give a task', 'form.specific': 'Pick an agent', 'form.auto': 'Arash — auto-delegate', 'form.agent': 'Agent', 'form.kind': 'Task type', 'form.titleField': 'Title', 'form.optional': 'optional', 'form.ask': 'Your request', 'form.submit': 'Hand to agent', 'form.submitBoss': 'Brief Arash', 'form.autoHint': 'Arash splits the work across the team by task type.', 'form.askPlaceholder': 'e.g. write a warm reply to the client who asked about a website, with a timeline', 'form.errorEmpty': 'Write something for the agent first (your request).',
  'missions.title': 'Missions', 'missions.live': 'live from Mission Control', 'missions.goal': 'Hand a goal to the team', 'missions.launch': 'Create mission & start now', 'missions.planning': '🧠 The AI is planning… (about 10 seconds)', 'missions.launchHint': 'The AI plans it, your Telegram gets the news, and the agents head out instantly.', 'missions.empty': 'No missions on the board — create one from the panel or Telegram.', 'missions.handOver': 'Send to office', 'missions.handed': 'Sent', 'missions.inOffice': 'in office', 'missions.stale': 'Mission Control is unreachable — showing the last saved board; we will retry shortly.', 'missions.placeholder': 'e.g. build an online order form for a coffee brand, I need a landing page',
  'status.done': 'Done', 'status.failed': 'Failed', 'status.active': 'Active', 'status.queued': 'Queued',
  'office.title': 'Boss office', 'office.summary': 'Today at a glance', 'office.done': 'Delivered', 'office.failed': 'Failed', 'office.ongoing': 'In progress', 'office.team': 'Team', 'office.reports': 'Agent reports', 'office.generate': 'Generate briefing', 'office.generating': 'Generating…', 'office.withAI': 'with AI',
  'team.title': 'The team', 'team.hint': 'tap any agent to personalize',
  'tasks.title': 'Tasks', 'tasks.empty': 'No tasks yet — start from the “Give a task” panel.',
  'feed.title': 'Live office feed', 'feed.clear': 'Clear',
  'preview.title': 'Preview of the built page', 'preview.newTab': 'New tab', 'preview.download': 'Download HTML',
  'state.idle': 'Ready', 'state.walking': 'Walking', 'state.working': 'Working', 'state.meeting': 'Meeting', 'state.coffee': 'Coffee', 'state.arriving': 'Arriving',
};

const hy: Dict = {
  'tab.missions': 'Առաքելություններ', 'tab.task': 'Նոր առաջադրանք', 'tab.team': 'Թիմ', 'tab.feed': 'Գործունեություն', 'tab.office': 'Տնօրենի գրասենյակ', 'tab.tasks': 'Առաջադրանքներ',
  'common.refresh': 'Թարմացնել', 'common.cancel': 'Չեղարկել', 'common.retry': 'Կրկին փորձել', 'common.viewResult': 'Տեսնել արդյունքը', 'common.closeResult': 'Փակել արդյունքը', 'common.close': 'Փակել', 'common.resetView': 'Վերականգնել տեսքը', 'common.settings': '⚙️ AI կարգավորումներ', 'common.zen': 'Կենտրոնացման ռեժիմ',
  'brand.name': 'SESEMI գրասենյակ', 'brand.tag': 'AI ընկերության սիմուլյատոր',
  'banner.demo': 'Դեմո ռեժիմն է — ավելացրեք ձեր բանալին կարգավորումներում՝ իրական աշխատանքի համար',
  'welcome.title': 'Կենդանի AI թիմ՝ մեկ գրասենյակում', 'welcome.sub': 'Գրեք մեկ նախադասություն — AI թիմը պլանավորում է, գնում աշխատելու և հանձնում արդյունքը։ Այսքան։',
  'welcome.chip1': '🖥 Կայքեր և landing', 'welcome.chip2': '✍️ Բովանդակություն', 'welcome.chip3': '🔍 Հետազոտություն', 'welcome.chip4': '🗓 Պլանավորում',
  'welcome.cta': 'Թիմին աշխատանք տալ', 'welcome.hint': 'Աշխատում է առանց բանալիի (դեմո) · Telegram ծանուցումներ · գրասենյակը մեծանում է ամեն հանձնումից',
  'form.title': 'Առաջադրանք տալ', 'form.specific': 'Ընտրեք գործակալ', 'form.auto': 'Արաշ — ավտոմատ բաշխում', 'form.agent': 'Գործակալ', 'form.kind': 'Տեսակ', 'form.titleField': 'Վերնագիր', 'form.optional': 'ըստ ցանկության', 'form.ask': 'Ձեր խնդրանքը', 'form.submit': 'Հանձնել գործակալին', 'form.submitBoss': 'Բրիֆը՝ Արաշին', 'form.autoHint': 'Արաշը բաժանում է աշխատանքը թիմի միջև՝ ըստ տեսակի։', 'form.askPlaceholder': 'օրինակ՝ գրեք ջերմ պատասխան այն հաճախորդին, ով հարցրել է կայքի մասին', 'form.errorEmpty': 'Նախ գրեք ինչ-որ բան գործակալի համար։',
  'missions.title': 'Առաքելություններ', 'missions.live': 'ուղիղ Mission Control-ից', 'missions.goal': 'Նպատակ տալ թիմին', 'missions.launch': 'Ստեղծել առաքելություն և մեկնարկել', 'missions.planning': '🧠 AI-ն պլանավորում է… (մոտ 10 վայրկյան)', 'missions.launchHint': 'AI-ն պլանավորում է, Telegram-ը լուրը ստանում է, գործակալները անմիջապես գնում են աշխատելու։', 'missions.empty': 'Առաքելություն չկա տախտակին — ստեղծեք պանելից կամ Telegram-ից։', 'missions.handOver': 'Ուղարկել գրասենյակ', 'missions.handed': 'Ուղարկված է', 'missions.inOffice': 'գրասենյակում', 'missions.stale': 'Mission Control-ը հասանելի չէ — ցուցադրվում է վերջին պահպանված տախտակը. քիչ հետո կրկին կփորձենք։', 'missions.placeholder': 'օրինակ՝ ստեղծեք առցանց պատվերի ձև սուրճի բրենդի համար',
  'status.done': 'Կատարված', 'status.failed': 'Ձախողված', 'status.active': 'Ակտիվ', 'status.queued': 'Հերթում',
  'office.title': 'Տնօրենի գրասենյակ', 'office.summary': 'Այսօր՝ հակիրճ', 'office.done': 'Հանձնված', 'office.failed': 'Ձախողված', 'office.ongoing': 'Ընթացքում', 'office.team': 'Թիմ', 'office.reports': 'Գործակալների հաշվետվություններ', 'office.generate': 'Ստեղծել բրիֆինգ', 'office.generating': 'Ստեղծվում է…', 'office.withAI': 'AI-ով',
  'team.title': 'Թիմը', 'team.hint': 'հպեք գործակալին՝ հարմարեցնելու համար',
  'tasks.title': 'Առաջադրանքներ', 'tasks.empty': 'Դեռ առաջադրանք չկա — սկսեք «Առաջադրանք տալ» պանելից։',
  'feed.title': 'Գրասենյակի կենդանի հոսք', 'feed.clear': 'Մաքրել',
  'preview.title': 'Կառուցված էջի նախադիտում', 'preview.newTab': 'Նոր ներդիր', 'preview.download': 'Ներբեռնել HTML',
  'state.idle': 'Պատրաստ', 'state.walking': 'Գնում է', 'state.working': 'Աշխատում է', 'state.meeting': 'Հանդիպում', 'state.coffee': 'Սուրճ', 'state.arriving': 'Ժամանում է',
};

const T: Record<Lang, Dict> = { fa, en, hy };

const listeners = new Set<() => void>();

function applyLang(): void {
  const el = document.documentElement;
  el.lang = current;
  el.dir = current === 'fa' ? 'rtl' : 'ltr';
}

applyLang();

export function getLang(): Lang { return current; }

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try { localStorage.setItem(STORE_KEY, lang); } catch { /* private mode */ }
  applyLang();
  for (const fn of listeners) fn();
}

export function onLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** کلید ترجمه‌شده — نبودِ ترجمه به فارسیِ اصلی برمی‌گردد (هرگز کلید خام نشان داده نمی‌شود) */
export function t(key: string): string {
  return T[current][key] ?? fa[key] ?? key;
}
