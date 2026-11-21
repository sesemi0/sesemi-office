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
  'tasks.title': 'وظایف', 'tasks.empty': 'هنوز وظیفه‌ای نداده‌ای — فرم بالا رو پر کن.',
  'feed.title': 'فعالیت زندهٔ دفتر', 'feed.clear': 'پاک‌کردن',
  'preview.title': 'پیش‌نمایش صفحهٔ ساخته‌شده', 'preview.newTab': 'تب جدید', 'preview.download': 'دانلود HTML',
  'state.idle': 'آماده', 'state.walking': 'در حال رفتن', 'state.working': 'در حال کار', 'state.meeting': 'جلسه', 'state.coffee': 'قهوه', 'state.arriving': 'رسیدن',
  /* v6 — full coverage of previously-hardcoded strings */
  'tab.work': 'وظایف',
  'badge.demo': 'نمایشی',
  'task.done': 'انجام شد ✓', 'task.failed': 'ناموفق ✗', 'task.working': 'در حال کار…', 'task.walk': 'در راه…', 'task.queue': 'در صف…', 'task.delegating': 'در حال توزیع…', 'task.delegated': '👥 توسط آرش توزیع شد',
  'agent.follow': 'دنبال‌کردن با دوربین', 'agent.unfollow': 'توقف دوربین', 'common.personalize': 'شخصی‌سازی',
  'settings.title': 'تنظیمات هوش مصنوعی (کلید خودت)', 'settings.gotoKey': 'رفتن به فیلد کلید', 'settings.keyHint': 'کلید فقط در همین مرورگر خودت ذخیره می‌شود و فقط به سرویس‌دهنده‌ای که انتخاب می‌کنی فرستاده می‌شود.', 'settings.provider': 'سرویس‌دهنده', 'settings.providerGemini': 'گوگل Gemini (پلن رایگان دارد)', 'settings.providerCompat': 'هر سرویس OpenAI-compatible (OpenAI / OpenRouter / GLM…)', 'settings.key': 'کلید API', 'settings.keyPh': 'کلید را اینجا بچسبان', 'settings.baseUrl': 'آدرس پایه', 'settings.model': 'مدل', 'settings.cancel': 'بی‌خیال', 'settings.save': 'ذخیره', 'settings.saved': 'ذخیره شد ✓', 'settings.hintKey': 'کلید رایگان Gemini را از aistudio.google.com می‌گیری — بدون کارت بانکی. مدل پیشنهادی: gemini-3.5-flash.', 'settings.hintRunning': 'وظایف در حال اجرا با تغییر تنظیمات قطع نمی‌شوند؛ وظیفهٔ بعدی با کلید جدید می‌رود.',
  'edit.title': 'شخصی‌سازی', 'edit.name': 'نام', 'edit.role': 'نقش', 'edit.persona': 'شخصیت (به AI اضافه می‌شود)', 'edit.personaPh': 'مثلاً: رویکردت: خونسرد و تصمیم‌گیر.', 'edit.uniform': 'رنگ لباس', 'edit.hair': 'رنگ مو', 'edit.remove': 'حذف ایجنت',
  'missions.createdNoBoard': 'ساخته شد و تلگرام خبر گرفت — هنوز به تابلو نرسیده؛ چند لحظه بعد «تازه‌سازی» بزن.', 'missions.createdOk': '🎯 مأموریت با وظایفش وارد دفتر شد — ایجنت‌ها همین الان راه می‌افتند. تلگرامت هم برنامه را گرفت.', 'missions.nothingToHand': 'چیزی برای سپردن نبود — همهٔ وظایف انجام یا سپرده شده‌اند.', 'missions.handOk': 'کار از مأموریت وارد دفتر شد — ایجنت‌ها راه می‌افتند.', 'missions.errorDefault': 'ساخت مأموریت شکست خورد.', 'missions.outputsHint': 'خروجی هر کار در «دفتر مدیر» کامل ثبت می‌شود و اعلان‌های مأموریت به تلگرامت می‌رود.',
  'office.briefTitle': 'بریفینگ آرش', 'office.demoMode': 'نمایشی', 'office.briefMeta': 'تولید', 'office.noWork': 'امروز هنوز کاری ثبت نشده — اول وظیفه‌ای بده تا بریفینگ معنا پیدا کند.', 'office.agentStats': 'انجام · ناموفق', 'office.noReports': 'امروز هنوز وظیفه‌ای تمام نشده…',
  'feed.empty': 'هنوز خبری نیست…',
  'form.okBoss': 'آرش وظیفه را بین ایجنت‌ها توزیع کرد.',
  'zen.working': 'ایجنت در حال کار', 'zen.exit': 'خروج از حالت تمرکز',
  'qt.manager.1': 'گزارش روزانه', 'qt.manager.2': 'برنامهٔ هفته', 'qt.writer.1': 'کپشن اینستاگرام', 'qt.writer.2': 'پست لینکدین', 'qt.researcher.1': 'تحلیل رقبا', 'qt.researcher.2': 'ترندهای AI', 'qt.assistant.1': 'برنامهٔ فردا', 'qt.assistant.2': 'ایمیل پیگیری',
  'qt.manager.1d': 'گزارش روزانهٔ وضعیت تیم و پروژه‌های در جریان استودیو را تهیه کن.', 'qt.manager.2d': 'برنامهٔ هفتهٔ آیندهٔ تیم را با اولویت‌ها بچین.', 'qt.writer.1d': 'یک کپشن کوتاه و جذاب اینستاگرام برای استودیو طراحی سایت سسِمی بنویس.', 'qt.writer.2d': 'یک پست حرفه‌ای لینکدین دربارهٔ اهمیت طراحی وب مدرن برای کسب‌وکارها بنویس.', 'qt.researcher.1d': 'تحقیق کوتاهی دربارهٔ رقبا در بازار طراحی وب و تفاوت‌های سسِمی بنویس.', 'qt.researcher.2d': 'مهم‌ترین ترندهای هوش مصنوعی این ماه برای کسب‌وکارهای کوچک را خلاصه کن.', 'qt.assistant.1d': 'برنامهٔ کاری فردای تیم را با ساعت‌ها بچین.', 'qt.assistant.2d': 'یک ایمیل پیگیری مؤدبانه برای مشتری که مدتی بی‌پاسخ مانده بنویس.',
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
  'tasks.title': 'Tasks', 'tasks.empty': 'No tasks yet — fill the form above to start.',
  'feed.title': 'Live office feed', 'feed.clear': 'Clear',
  'preview.title': 'Preview of the built page', 'preview.newTab': 'New tab', 'preview.download': 'Download HTML',
  'state.idle': 'Ready', 'state.walking': 'Walking', 'state.working': 'Working', 'state.meeting': 'Meeting', 'state.coffee': 'Coffee', 'state.arriving': 'Arriving',
  'tab.work': 'Tasks',
  'badge.demo': 'demo',
  'task.done': 'Done ✓', 'task.failed': 'Failed ✗', 'task.working': 'Working…', 'task.walk': 'On the way…', 'task.queue': 'Queued…', 'task.delegating': 'Delegating…', 'task.delegated': '👥 Delegated by Arash',
  'agent.follow': 'Follow with camera', 'agent.unfollow': 'Stop camera', 'common.personalize': 'Personalize',
  'settings.title': 'AI settings (your own key)', 'settings.gotoKey': 'Jump to the key field', 'settings.keyHint': 'The key is stored only in your own browser and is sent only to the provider you pick.', 'settings.provider': 'Provider', 'settings.providerGemini': 'Google Gemini (free tier available)', 'settings.providerCompat': 'Any OpenAI-compatible service (OpenAI / OpenRouter / GLM…)', 'settings.key': 'API key', 'settings.keyPh': 'paste your key here', 'settings.baseUrl': 'Base URL', 'settings.model': 'Model', 'settings.cancel': 'Discard', 'settings.save': 'Save', 'settings.saved': 'Saved ✓', 'settings.hintKey': 'Grab a free Gemini key at aistudio.google.com — no bank card needed. Suggested model: gemini-3.5-flash.', 'settings.hintRunning': 'Running tasks are not interrupted by settings changes; the next task uses the new key.',
  'edit.title': 'Personalize', 'edit.name': 'Name', 'edit.role': 'Role', 'edit.persona': 'Persona (added to the AI)', 'edit.personaPh': 'e.g. your approach: calm and decisive.', 'edit.uniform': 'Uniform color', 'edit.hair': 'Hair color', 'edit.remove': 'Remove agent',
  'missions.createdNoBoard': 'was created and Telegram got the news — not on the board yet; hit Refresh in a moment.', 'missions.createdOk': '🎯 The mission entered the office with its tasks — agents are heading out now. Your Telegram has the plan.', 'missions.nothingToHand': 'Nothing to hand over — every task is done or already sent.', 'missions.handOk': 'tasks from the mission entered the office — agents are off.', 'missions.errorDefault': 'Mission creation failed.', 'missions.outputsHint': 'Every result is fully logged in the Boss office and mission alerts go to your Telegram.',
  'office.briefTitle': "Arash's briefing", 'office.demoMode': 'demo', 'office.briefMeta': 'generated', 'office.noWork': 'Nothing was logged today — give the team a task first, then the briefing means something.', 'office.agentStats': 'done · failed', 'office.noReports': 'No task has finished today yet…',
  'feed.empty': 'Nothing yet…',
  'form.okBoss': 'Arash distributed the task across the agents.',
  'zen.working': 'agents working', 'zen.exit': 'Exit focus mode',
  'qt.manager.1': 'Daily report', 'qt.manager.2': 'Week plan', 'qt.writer.1': 'Instagram caption', 'qt.writer.2': 'LinkedIn post', 'qt.researcher.1': 'Competitor scan', 'qt.researcher.2': 'AI trends', 'qt.assistant.1': 'Tomorrow plan', 'qt.assistant.2': 'Follow-up email',
  'qt.manager.1d': 'Prepare the daily report of team status and ongoing studio projects.', 'qt.manager.2d': 'Lay out next week\'s plan with priorities.', 'qt.writer.1d': 'Write a short, catchy Instagram caption for the SESEMI web-design studio.', 'qt.writer.2d': 'Write a professional LinkedIn post about why modern web design matters for small businesses.', 'qt.researcher.1d': 'Write a brief scan of competitors in the web-design market and what makes SESEMI different.', 'qt.researcher.2d': 'Summarize this month\'s most important AI trends for small businesses.', 'qt.assistant.1d': 'Plan tomorrow\'s workday with hours.', 'qt.assistant.2d': 'Write a polite follow-up email to a client who has gone quiet.',
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
  'tasks.title': 'Առաջադրանքներ', 'tasks.empty': 'Դեռ առաջադրանք չկա — լրացրեք վերևի ձևը։',
  'feed.title': 'Գրասենյակի կենդանի հոսք', 'feed.clear': 'Մաքրել',
  'preview.title': 'Կառուցված էջի նախադիտում', 'preview.newTab': 'Նոր ներդիր', 'preview.download': 'Ներբեռնել HTML',
  'state.idle': 'Պատրաստ', 'state.walking': 'Գնում է', 'state.working': 'Աշխատում է', 'state.meeting': 'Հանդիպում', 'state.coffee': 'Սուրճ', 'state.arriving': 'Ժամանում է',
  'tab.work': 'Առաջադրանքներ',
  'badge.demo': 'դեմո',
  'task.done': 'Կատարված ✓', 'task.failed': 'Ձախողված ✗', 'task.working': 'Աշխատում է…', 'task.walk': 'Գնում է…', 'task.queue': 'Հերթում…', 'task.delegating': 'Բաշխվում է…', 'task.delegated': '👥 Բաշխված է Արաշի կողմից',
  'agent.follow': 'Հետևել տեսախցիկով', 'agent.unfollow': 'Կանգնեցնել տեսախցիկը', 'common.personalize': 'Անհատականացնել',
  'settings.title': 'AI կարգավորումներ (ձեր բանալին)', 'settings.gotoKey': 'Անցնել բանալիի դաշտին', 'settings.keyHint': 'Բանալին պահվում է միայն ձեր զննարկում և ուղարկվում միայն ձեր ընտրած ծառայությանը։', 'settings.provider': 'Մատակարար', 'settings.providerGemini': 'Google Gemini (անվճար պլան կա)', 'settings.providerCompat': 'Ցանկացած OpenAI-compatible ծառայություն', 'settings.key': 'API բանալի', 'settings.keyPh': 'տեղադրեք բանալին այստեղ', 'settings.baseUrl': 'Բազային հասցե', 'settings.model': 'Մոդել', 'settings.cancel': 'Չեղարկել', 'settings.save': 'Պահել', 'settings.saved': 'Պահված է ✓', 'settings.hintKey': 'Անվճար Gemini բանալին՝ aistudio.google.com-ից՝ առանց բանկային քարտի։ Խորհուրդ՝ gemini-3.5-flash։', 'settings.hintRunning': 'Ընթացիկ առաջադրանքները չեն ընդհատվում. հաջորդը նոր բանալիով կգնա։',
  'edit.title': 'Անհատականացում', 'edit.name': 'Անուն', 'edit.role': 'Դեր', 'edit.persona': 'Բնավորություն (ավելանում է AI-ին)', 'edit.personaPh': 'օրինակ՝ մոտեցումդ՝ հանգիստ և վճռական։', 'edit.uniform': 'Հագուստի գույն', 'edit.hair': 'Մազերի գույն', 'edit.remove': 'Հեռացնել գործակալին',
  'missions.createdNoBoard': 'ստեղծվեց և Telegram-ը լուրը ստացավ — դեռ տախտակին չէ. մի որոշ հետո սեղմեք Թարմացնել։', 'missions.createdOk': '🎯 Առաքելությունը աշխատանքներով մտավ գրասենյակ — գործակալները մեկնում են։ Telegram-ում պլանը կա։', 'missions.nothingToHand': 'Հանձնելու ոչինչ չկա — բոլոր առաջադրանքները կատարված կամ ուղարկված են։', 'missions.handOk': 'առաջադրանք մտավ գրասենյակ — գործակալները մեկնում են։', 'missions.errorDefault': 'Առաքելության ստեղծումը ձախողվեց։', 'missions.outputsHint': 'Ամեն արդյունք ամբողջությամբ գրանցվում է Տնօրենի գրասենյակում, իսկ ծանուցումները գնում են ձեր Telegram։',
  'office.briefTitle': 'Արաշի բրիֆինգ', 'office.demoMode': 'դեմո', 'office.briefMeta': 'ստեղծված', 'office.noWork': 'Այսօր ոչինչ գրանցված չէ — նախ առաջադրանք տվեք, որ բրիֆինգը իմաստ ունենա։', 'office.agentStats': 'կատարված · ձախողված', 'office.noReports': 'Այսօր դեռ առաջադրանք ավարտված չէ…',
  'feed.empty': 'Դեռ ոչինչ չկա…',
  'form.okBoss': 'Արաշը բաշխեց առաջադրանքը գործակալների միջև։',
  'zen.working': 'գործակալ աշխատում է', 'zen.exit': 'Դուրս գալ կենտրոնացումից',
  'qt.manager.1': 'Օրվա հաշվետվություն', 'qt.manager.2': 'Շաբաթվա պլան', 'qt.writer.1': 'Instagram ենթավերնագիր', 'qt.writer.2': 'LinkedIn գրառում', 'qt.researcher.1': 'Մրցակիցների վերլուծություն', 'qt.researcher.2': 'AI միտումներ', 'qt.assistant.1': 'Վաղվա պլան', 'qt.assistant.2': 'Հիշեցնող նամակ',
  'qt.manager.1d': 'Պատրաստեք օրվա հաշվետվությունը՝ թիմի կարգավիճակի և ընթացիկ նախագծերի մասին։', 'qt.manager.2d': 'Կազմեք հաջորդ շաբաթվա պլանը՝ առաջնահերթություններով։', 'qt.writer.1d': 'Գրեք կարճ և գրավիչ Instagram ենթավերնագիր SESEMI ստուդիայի համար։', 'qt.writer.2d': 'Գրեք պրոֆեսիոնալ LinkedIn գրառում՝ ժամանակակից կայքի դիզայնի կարևորության մասին։', 'qt.researcher.1d': 'Կարճ վերլուծություն գրեք վեբ-դիզայնի շուկայի մրցակիցների մասին։', 'qt.researcher.2d': 'Ամփոփեք այս ամսվա կարևոր AI միտումները փոքր բիզնեսների համար։', 'qt.assistant.1d': 'Կազմեք վաղվա աշխատանքային օրվա պլանը՝ ժամերով։', 'qt.assistant.2d': 'Գրեք քաղաքավարի հիշեցնող նամակ այն հաճախորդին, ով լռել է։',
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
