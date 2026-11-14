import { useEffect, useRef, useState } from 'react';
import { store, type OfficeState } from './officeStore';
import { cameraCtl, fitCamera, initCamera, panBy, pickAgent, pickTile, render, resetView, rotateBy, setFollow, stepEffects, zoomAt } from './render/officeCanvas';
import { ROLE_META, TASK_LABELS, type Agent, type Role, type Task, type TaskKind } from './sim/agents';
import { isDemoMode, loadConfig, saveConfig, GEMINI_MODELS, OPENAI_COMPAT_MODELS, type AiConfig, type ProviderKind } from './ai/llm';
import {
  adoptedKey, createMissionFromGoal, fetchMissionBoard, loadAdoptedKeys, saveAdoptedKeys,
  type Mission, type MissionTaskStatus,
} from './missions';

/* ---------- small shared bits ---------- */

function Avatar({ agent, size = 30 }: { agent: Agent; size?: number }) {
  return <span className="agent-avatar" style={{ background: agent.uniformColor || '#5e88c9', width: size, height: size, fontSize: size * .45 }}>
    {agent.name.slice(0, 1)}
  </span>;
}

function StatusDot({ state }: { state: Agent['state'] }) {
  const color = { idle: '#5ad5b2', walking: '#7cc7f5', working: '#f5b56a', meeting: '#b8a5ea', coffee: '#e88ca0', arriving: '#7cc7f5' }[state];
  return <span className="status-dot" style={{ background: color }} title={state} />;
}

const STATE_LABELS: Record<Agent['state'], string> = {
  idle: 'آماده', walking: 'در حال رفتن', working: 'در حال کار', meeting: 'جلسه', coffee: 'قهوه', arriving: 'رسیدن',
};

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

/** one-tap task presets per role — the minimal way to keep the office busy */
const QUICK_TASKS: Record<Role, { label: string; kind: TaskKind; detail: string }[]> = {
  manager: [
    { label: 'گزارش روزانه', kind: 'research', detail: 'گزارش روزانهٔ وضعیت تیم و پروژه‌های در جریان استودیو را تهیه کن.' },
    { label: 'برنامهٔ هفته', kind: 'schedule', detail: 'برنامهٔ هفتهٔ آیندهٔ تیم را با اولویت‌ها بچین.' },
  ],
  writer: [
    { label: 'کپشن اینستاگرام', kind: 'content', detail: 'یک کپشن کوتاه و جذاب اینستاگرام برای استودیو طراحی سایت سسِمی بنویس.' },
    { label: 'پست لینکدین', kind: 'content', detail: 'یک پست حرفه‌ای لینکدین دربارهٔ اهمیت طراحی وب مدرن برای کسب‌وکارها بنویس.' },
  ],
  researcher: [
    { label: 'تحلیل رقبا', kind: 'research', detail: 'تحقیق کوتاهی دربارهٔ رقبا در بازار طراحی وب و تفاوت‌های سسِمی بنویس.' },
    { label: 'ترندهای AI', kind: 'research', detail: 'مهم‌ترین ترندهای هوش مصنوعی این ماه برای کسب‌وکارهای کوچک را خلاصه کن.' },
  ],
  assistant: [
    { label: 'برنامهٔ فردا', kind: 'schedule', detail: 'برنامهٔ کاری فردای تیم را با ساعت‌ها بچین.' },
    { label: 'ایمیل پیگیری', kind: 'email', detail: 'یک ایمیل پیگیری مؤدبانه برای مشتری که مدتی بی‌پاسخ مانده بنویس.' },
  ],
};

/* ---------- panels ---------- */

function AgentsPanel({ state }: { state: OfficeState }) {
  return <div className="panel">
    <h2>تیم دفتر <span className="panel-hint">{state.agents.length} ایجنت — برای شخصی‌سازی روی هرکدام بزن</span></h2>
    <div className="agent-list">
      {state.agents.map(agent => <button className="agent-row" key={agent.id} onClick={() => (window as unknown as { __openAgent: (id: string) => void }).__openAgent(agent.id)}>
        <Avatar agent={agent} />
        <span className="agent-row-name">
          <strong>{agent.name}</strong>
          <small>{ROLE_META[agent.role].label}</small>
        </span>
        <span className="agent-row-status"><StatusDot state={agent.state} />{STATE_LABELS[agent.state]}</span>
      </button>)}
    </div>
  </div>;
}

function TaskForm({ state }: { state: OfficeState }) {
  const [agentId, setAgentId] = useState(state.agents[0]?.id ?? '');
  const [toManager, setToManager] = useState(false);
  const [kind, setKind] = useState<TaskKind>('email');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (!state.agents.some(a => a.id === agentId)) setAgentId(state.agents[0]?.id ?? '');
  }, [state.agents, agentId]);

  function submit() {
    if (busy) return;
    if (!detail.trim()) { setError('چیزی برای ایجنت بنویس (خواستهٔ خودت).'); return; }
    setBusy(true); setError(''); setOk('');
    try {
      if (toManager) {
        const result = store.assignToManager(title, detail);
        setOk(`آرش وظیفه را بین ${result.children.length} نفر توزیع کرد.`);
      } else {
        store.assign(agentId, kind, title, detail);
      }
      setTitle(''); setDetail('');
    } catch (e) { setError(e instanceof Error ? e.message : 'خطا'); }
    setBusy(false);
  }

  return <div className="panel">
    <h2>دادن وظیفه</h2>
    <div className="recip-switch" role="radiogroup" aria-label="گیرندهٔ وظیفه">
      <button type="button" className={toManager ? '' : 'on'} onClick={() => setToManager(false)}>ایجنت مشخص</button>
      <button type="button" className={toManager ? 'on' : ''} onClick={() => setToManager(true)}>آرش — تخصیص خودکار</button>
    </div>
    <label className="field">ایجنت
      <select value={agentId} disabled={toManager} onChange={e => setAgentId(e.target.value)}>
        {state.agents.map(a => <option key={a.id} value={a.id}>{a.name} — {ROLE_META[a.role].label}</option>)}
      </select>
    </label>
    {toManager && <small className="field-hint">آرش بر اساس نوع کار بین تیم تقسیم می‌کند.</small>}
    {!toManager && <label className="field">نوع کار
      <select value={kind} onChange={e => setKind(e.target.value as TaskKind)}>
        {Object.entries(TASK_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
    </label>}
    <label className="field">عنوان <small>اختیاری</small>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثلاً: پاسخ به درخواست قیمت" />
    </label>
    <label className="field">خواستهٔ تو
      <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3}
        placeholder="مثلاً: به مشتری که سفارش طراحی سایت پرسیده، یک پاسخ گرم با اشاره به زمان‌بندی بنویس" />
    </label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {ok && <p className="form-ok" role="status">{ok}</p>}
    <button className="primary" onClick={submit} disabled={busy}>{toManager ? 'سپردن بریف به آرش' : 'سپردن وظیفه به ایجنت'}</button>
  </div>;
}

function FeedPanel({ state }: { state: OfficeState }) {
  return <div className="panel">
    <h2>فعالیت زندهٔ دفتر <button className="ghost" onClick={() => store.clearFeed()}>پاک‌کردن</button></h2>
    <div className="feed">
      {state.feed.length === 0 && <p className="empty">هنوز خبری نیست…</p>}
      {state.feed.map(ev => <div className="feed-row" key={ev.id}>
        <span className="feed-time">{timeOf(ev.at)}</span>
        <span>{ev.text}</span>
      </div>)}
    </div>
  </div>;
}

function ResultActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'نتیجهٔ ایجنت سسِمی', text }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ }
  };
  return <div className="result-actions">
    <button className="ghost" onClick={share}>{copied ? 'کپی شد ✓' : 'کپی / اشتراک'}</button>
  </div>;
}

function TaskResult({ task, agent, agents = [], delegationKids = [] }: {
  task: Task; agent?: Agent; agents?: Agent[]; delegationKids?: Task[];
}) {
  const [open, setOpen] = useState(false);
  return <div className={`task-row ${task.status}`}>
    <div className="task-row-head" onClick={() => setOpen(!open)}>
      <span className="task-title">{task.title}
        {task.demo && <span className="badge-demo">نمایشی</span>}
      </span>
      <span className="task-meta">
        {agent ? agent.name : '—'} · {TASK_LABELS[task.kind]} · {' '}
        {task.status === 'done' ? 'انجام شد ✓' : task.status === 'failed' ? 'ناموفق ✗'
          : task.status === 'working' ? (task.isDelegation ? 'در حال توزیع…' : 'در حال کار…')
          : task.status === 'walking' ? 'در راه…' : 'در صف…'}
      </span>
    </div>
    {task.delegationId !== undefined && <p className="delegation-note" title={task.routeReason ?? undefined}>👥 توسط آرش توزیع شد</p>}
    <p className="task-detail">{task.detail}</p>
    {task.isDelegation && delegationKids.length > 0 && <ul className="delegation-children">
      {delegationKids.map(kid => {
        const kidAgent = agents.find(a => a.id === kid.agentId);
        return <li key={kid.id} title={kid.routeReason ?? undefined}>
          <span className="deleg-kid-agent">{kidAgent ? kidAgent.name : '—'}</span>
          <span className="deleg-kid-kind">{TASK_LABELS[kid.kind]}</span>
          <span className="deleg-kid-status">{kid.status === 'done' ? 'انجام ✓' : kid.status === 'failed' ? 'ناموفق ✗' : kid.status === 'working' ? 'کار می‌کند…' : kid.status === 'walking' ? 'در راه…' : 'در صف…'}</span>
        </li>;
      })}
    </ul>}
    {task.result && open && <div className="task-result">{task.result}</div>}
    {task.result && open && <ResultActions text={task.result} />}
    <div className="task-actions">
      {task.result && <button className="ghost" onClick={() => setOpen(!open)}>{open ? 'بستن نتیجه' : 'دیدن نتیجه'}</button>}
      {task.status === 'failed' && <button className="ghost mini" onClick={() => store.retryTask(task.id)}>تلاش دوباره</button>}
      {task.status !== 'done' && task.status !== 'failed' && <button className="ghost mini danger" onClick={() => store.cancelTask(task.id)}>لغو</button>}
    </div>
  </div>;
}

function TasksPanel({ state }: { state: OfficeState }) {
  return <div className="panel">
    <h2>وظایف</h2>
    {state.tasks.length === 0 && <p className="empty">هنوز وظیفه‌ای نداده‌ای — از پنل «دادن وظیفه» شروع کن.</p>}
    <div className="task-list">{state.tasks.map(task =>
      <TaskResult key={task.id} task={task} agent={state.agents.find(a => a.id === task.agentId)} agents={state.agents}
        delegationKids={task.isDelegation ? state.tasks.filter(t => t.delegationId === task.id) : []} />)}
    </div>
  </div>;
}

/* ---------- selected-agent glass card ---------- */

function AgentCard({ state, agentId, onClose }: { state: OfficeState; agentId: string; onClose: () => void }) {
  const agent = state.agents.find(a => a.id === agentId);
  // following را هر رندر از وضعیت واقعی دوربین مشتق کن — state محلیِ فقط-اولین-mount
  // بعد از pan/zoom (که follow را لغو می‌کند) کهنه می‌شود
  const following = cameraCtl.followId === agentId;
  if (!agent) return null;
  const lastTask = state.tasks.filter(t => t.agentId === agentId).sort((a, b) => b.createdAt - a.createdAt)[0];
  const presets = QUICK_TASKS[agent.role];
  return <div className="agent-card">
    <div className="agent-card-head">
      <Avatar agent={agent} size={40} />
      <div className="agent-card-id">
        <strong>{agent.name}</strong>
        <span>{ROLE_META[agent.role].label} · <StatusDot state={agent.state} /> {STATE_LABELS[agent.state]}</span>
      </div>
      <button className="ghost card-close" onClick={onClose} aria-label="بستن">✕</button>
    </div>
    {lastTask && <div className="agent-card-task">
      <span className="task-title">{lastTask.title}</span>
      <span className="task-meta">
        {lastTask.status === 'done' ? 'انجام شد ✓' : lastTask.status === 'failed' ? 'ناموفق ✗' : lastTask.status === 'working' ? 'در حال کار…' : lastTask.status === 'walking' ? 'در راه…' : 'در صف…'}
      </span>
      {lastTask.result && lastTask.status === 'done' && <p className="agent-card-preview">{lastTask.result.slice(0, 220)}{lastTask.result.length > 220 ? '…' : ''}</p>}
      {lastTask.result && lastTask.status === 'done' && <ResultActions text={lastTask.result} />}
    </div>}
    <div className="chips">
      {presets.map(p => <button key={p.label} className="chip" onClick={() => store.assign(agent.id, p.kind, p.label, p.detail)}>+ {p.label}</button>)}
    </div>
    <div className="agent-card-actions">
      <button className="ghost" onClick={() => setFollow(following ? null : agent.id)}>
        {following ? 'توقف دوربین' : 'دنبال‌کردن با دوربین'}
      </button>
      <button className="ghost" onClick={() => (window as unknown as { __openAgent: (id: string) => void }).__openAgent(agent.id)}>شخصی‌سازی</button>
    </div>
  </div>;
}

/* ---------- modals ---------- */

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<AiConfig>(() => loadConfig());
  const [saved, setSaved] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);
  return <div className="scrim" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <h2>تنظیمات هوش مصنوعی (کلید خودت)</h2>
      {isDemoMode(config) && <div className="demo-banner-inline">
        <span>حالت نمایش فعال است — ایجنت‌ها خروجی نمایشی می‌دهند. کلیدت را وارد کن تا واقعی شوند.</span>
        <button className="ghost" onClick={() => keyRef.current?.focus()}>رفتن به فیلد کلید</button>
      </div>}
      <p className="hint">کلید فقط در همین مرورگر خودت ذخیره می‌شود و فقط به سرویس‌دهنده‌ای که انتخاب می‌کنی فرستاده می‌شود.</p>
      <label className="field">سرویس‌دهنده
        <select value={config.provider} onChange={e => setConfig({ ...config, provider: e.target.value as ProviderKind, model: e.target.value === 'gemini' ? 'gemini-3.5-flash' : 'gpt-4o-mini' })}>
          <option value="gemini">گوگل Gemini (پلن رایگان دارد)</option>
          <option value="openai-compat">هر سرویس OpenAI-compatible (OpenAI / OpenRouter / GLM…)</option>
        </select>
      </label>
      <label className="field">کلید API
        <input ref={keyRef} type="password" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} placeholder="کلید را اینجا بچسبان" dir="ltr" />
      </label>
      {config.provider === 'openai-compat' &&
        <label className="field">آدرس پایه <small>اختیاری</small>
          <input value={config.baseUrl || ''} onChange={e => setConfig({ ...config, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" dir="ltr" />
        </label>}
      <label className="field">مدل
        <select value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })}>
          {(config.provider === 'gemini' ? GEMINI_MODELS : OPENAI_COMPAT_MODELS).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>بی‌خیال</button>
        <button className="primary" onClick={() => { saveConfig(config); setSaved(true); window.setTimeout(onClose, 700); }}>
          {saved ? 'ذخیره شد ✓' : 'ذخیره'}
        </button>
      </div>
      <p className="hint">کلید رایگان Gemini را از aistudio.google.com می‌گیری — بدون کارت بانکی. مدل پیشنهادی: gemini-3.5-flash.</p>
      <p className="hint">وظایف در حال اجرا با تغییر تنظیمات قطع نمی‌شوند؛ وظیفهٔ بعدی با کلید جدید می‌رود.</p>
    </div>
  </div>;
}

function AgentEditModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState<Role>(agent.role);
  const [persona, setPersona] = useState(agent.persona);
  const [uniform, setUniform] = useState(agent.uniformColor || '#5e88c9');
  const [hair, setHair] = useState(agent.hairColor || '#2b1d12');
  return <div className="scrim" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <h2>شخصی‌سازی {agent.name}</h2>
      <div className="agent-preview"><Avatar agent={{ ...agent, name: name || '؟', uniformColor: uniform, hairColor: hair }} size={64} /></div>
      <label className="field">نام
        <input value={name} onChange={e => setName(e.target.value)} maxLength={20} />
      </label>
      <label className="field">نقش
        <select value={role} onChange={e => setRole(e.target.value as Role)}>
          {Object.entries(ROLE_META).map(([k, meta]) => <option key={k} value={k}>{meta.label}</option>)}
        </select>
      </label>
      <label className="field">شخصیت (به AI اضافه می‌شود)
        <textarea value={persona} onChange={e => setPersona(e.target.value)} rows={2} placeholder="مثلاً: رویکردت: خونسرد و تصمیم‌گیر." />
      </label>
      <label className="field">رنگ لباس
        <input type="color" value={uniform} onChange={e => setUniform(e.target.value)} />
      </label>
      <label className="field">رنگ مو
        <input type="color" value={hair} onChange={e => setHair(e.target.value)} />
      </label>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>بی‌خیال</button>
        <button className="primary" onClick={() => {
          store.updateAgent(agent.id, { name: name.trim() || agent.name, role, persona, uniformColor: uniform, hairColor: hair });
          onClose();
        }}>ذخیره</button>
      </div>
      {store.state.agents.length > 1 && <button className="danger ghost" onClick={() => { store.removeAgent(agent.id); onClose(); }}>حذف ایجنت</button>}
    </div>
  </div>;
}

/* ---------- دفتر مدیر ---------- */

function OfficePanel({ state }: { state: OfficeState }) {
  const [loading, setLoading] = useState(false);
  const report = store.getDailyReport();
  const briefing = state.briefing;
  const noWorkToday = report.totalDone + report.totalFailed + report.totalActive === 0;

  async function make(force?: boolean) {
    if (loading) return;
    setLoading(true);
    try { await store.generateBriefing(force); } catch { /* استور throw نمی‌کند — فقط گارد */ }
    setLoading(false);
  }

  return <div className="panel">
    <h2>دفتر مدیر</h2>

    <div className="brief-card">
      <div className="brief-card-head">
        <strong>بریفینگ آرش</strong>
        {briefing && <span className={`brief-mode ${briefing.mode}`}>{briefing.mode === 'ai' ? 'با هوش مصنوعی' : 'نمایشی'}</span>}
      </div>
      {briefing && <p className="brief-time">تولید: {timeOf(briefing.at)} · آمار {briefing.statsKey.split('|')[0]}</p>}
      {briefing && <p className="brief-text">{briefing.text}</p>}
      {briefing && <ResultActions text={briefing.text} />}
      {noWorkToday
        ? <>
            <p className="field-hint">امروز هنوز کاری ثبت نشده — اول وظیفه‌ای بده تا بریفینگ معنا پیدا کند.</p>
            <button className="primary" disabled>تولید بریفینگ</button>
          </>
        : <div className="brief-actions-row">
            <button className="primary" onClick={() => make()} disabled={loading}>{loading ? 'در حال تولید…' : 'تولید بریفینگ'}</button>
            <button className="ghost" onClick={() => make(true)} disabled={loading}>تازه‌سازی</button>
          </div>}
    </div>

    <h3 className="office-sub">خلاصهٔ روز</h3>
    <div className="report-stats">
      <div className="report-stat"><b>{report.totalDone}</b><span>انجام شد</span></div>
      <div className="report-stat failed"><b>{report.totalFailed}</b><span>ناموفق</span></div>
      <div className="report-stat active"><b>{report.totalActive}</b><span>در جریان</span></div>
    </div>

    <h3 className="office-sub">تیم</h3>
    <div className="report-agent-grid">
      {report.perAgent.map(pa => {
        const agent = state.agents.find(a => a.id === pa.agentId);
        if (!agent) return null;
        return <div className="report-agent-row" key={pa.agentId}>
          <Avatar agent={agent} size={26} />
          <div className="report-agent-info">
            <strong>{pa.name} <small>{ROLE_META[pa.role].label}</small></strong>
            <span className="report-agent-nums">{pa.done} انجام · {pa.failed} ناموفق</span>
            {pa.lastResult && <p className="report-agent-preview">{pa.lastResult.slice(0, 120)}{pa.lastResult.length > 120 ? '…' : ''}</p>}
          </div>
        </div>;
      })}
    </div>

    <h3 className="office-sub">گزارش‌های ایجنت‌ها</h3>
    {report.reportTasks.length === 0
      ? <p className="empty">امروز هنوز وظیفه‌ای تمام نشده…</p>
      : <div className="task-list">{report.reportTasks.map(task =>
        <TaskResult key={task.id} task={task} agent={state.agents.find(a => a.id === task.agentId)} agents={state.agents}
          delegationKids={task.isDelegation ? state.tasks.filter(t => t.delegationId === task.id) : []} />)}</div>}
  </div>;
}

/* ---------- missions (Mission Control bridge) ---------- */

const MISSION_STATUS_META: Record<MissionTaskStatus, { label: string; cls: string }> = {
  done: { label: 'انجام شد', cls: 'ok' },
  failed: { label: 'ناموفق', cls: 'err' },
  active: { label: 'فعال', cls: 'run' },
  queued: { label: 'در صف', cls: 'wait' },
};

function MissionsPanel() {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [adopted, setAdopted] = useState<Set<string>>(() => loadAdoptedKeys());
  const [flash, setFlash] = useState('');
  const [goal, setGoal] = useState('');
  const [creating, setCreating] = useState(false);

  /** هدف → مأموریت واقعی (AI برنامه می‌ریزد، تلگرام خبر می‌گیرد) → همان لحظه وارد دفتر */
  async function launchGoal() {
    const text = goal.trim();
    if (!text || creating) return;
    setCreating(true); setError(''); setFlash('🧠 هوش مصنوعی در حال برنامه‌ریزی است… (حدود ۱۰ ثانیه)');
    try {
      const { code } = await createMissionFromGoal(text);
      setGoal('');
      let mission: Mission | undefined;
      for (let attempt = 0; attempt < 4 && !mission; attempt++) {
        await new Promise(r => setTimeout(r, attempt ? 2500 : 800));
        const board = await fetchMissionBoard();
        mission = board.find(m => m.code === code);
        setMissions(board);
      }
      if (!mission) {
        setFlash(`مأموریت ${code} ساخته شد و تلگرام خبر گرفت — هنوز به تابلو نرسیده؛ چند لحظه بعد «تازه‌سازی» بزن.`);
        return;
      }
      const fresh = mission.tasks.filter(t => t.status === 'active' || t.status === 'queued');
      const sent = store.adoptMission({ ...mission, tasks: fresh });
      const next = new Set(adopted);
      for (const t of fresh) next.add(adoptedKey(mission.code, t.index));
      setAdopted(next);
      saveAdoptedKeys(next);
      setFlash(`🎯 مأموریت ${code} با ${sent} کار وارد دفتر شد — ایجنت‌ها همین الان راه می‌افتند. تلگرامت هم برنامه را گرفت.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ساخت مأموریت شکست خورد.');
      setFlash('');
    } finally {
      setCreating(false);
    }
  }

  const load = () => {
    setLoading(true);
    setError('');
    fetchMissionBoard()
      .then(board => setMissions(board))
      .catch(e => setError(e instanceof Error ? e.message : 'خطا در خواندن تابلو'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  function handOver(mission: Mission) {
    const fresh = mission.tasks.filter(t => (t.status === 'active' || t.status === 'queued')
      && !adopted.has(adoptedKey(mission.code, t.index)));
    if (!fresh.length) { setFlash('چیزی برای سپردن نبود — همهٔ وظایف انجام یا سپرده شده‌اند.'); return; }
    const sent = store.adoptMission({ ...mission, tasks: fresh });
    const next = new Set(adopted);
    for (const t of fresh) next.add(adoptedKey(mission.code, t.index));
    setAdopted(next);
    saveAdoptedKeys(next);
    setFlash(`${sent} کار از مأموریت ${mission.code} وارد دفتر شد — ایجنت‌ها راه می‌افتند.`);
  }

  return <div className="panel">
    <h2>مأموریت‌ها <span className="panel-hint">زنده از Mission Control</span>
      <button className="ghost mini" style={{ marginInlineStart: 'auto' }} onClick={load} disabled={loading}>
        {loading ? '…' : 'تازه‌سازی'}
      </button>
    </h2>
    <div className="mission-goal">
      <label className="field">هدف بده به تیم
        <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2}
          placeholder="مثلاً: برای برند قهوه یک فرم سفارش آنلاین بساز، یه لندینگ پیج می‌خوام"
          disabled={creating} />
      </label>
      <button className="primary" disabled={creating || !goal.trim()} onClick={launchGoal}>
        {creating ? 'در حال برنامه‌ریزی…' : 'ساخت مأموریت و شروع فوری'}
      </button>
      <small className="field-hint">AI برنامه می‌ریزد، تلگرامت خبر می‌گیرد و ایجنت‌ها همان لحظه سر کار می‌روند.</small>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {flash && <p className="form-ok" role="status">{flash}</p>}
    {!error && missions && !missions.length && <p className="panel-hint">مأموریتی در تابلو نیست — از پنل یا تلگرام یکی بساز.</p>}
    <div className="mission-list">
      {(missions ?? []).map(mission => {
        const pending = mission.tasks.filter(t => t.status !== 'done' && t.status !== 'failed');
        const allAdopted = pending.every(t => adopted.has(adoptedKey(mission.code, t.index)));
        const pct = mission.total ? Math.round((mission.done / mission.total) * 100) : 0;
        return <div className="mission-card" key={mission.code}>
          <div className="mission-head">
            <code>{mission.code}</code>
            <span className="mission-count">{mission.done}/{mission.total}</span>
            <button className="primary mini" disabled={allAdopted || !pending.length} onClick={() => handOver(mission)}>
              {allAdopted ? 'سپرده شد' : 'به دفتر بسپار'}
            </button>
          </div>
          <div className="mission-bar"><span style={{ width: `${pct}%` }} /></div>
          <ul className="mission-tasks">
            {mission.tasks.map(t => {
              const meta = MISSION_STATUS_META[t.status];
              const isAdopted = adopted.has(adoptedKey(mission.code, t.index));
              return <li key={t.index}>
                <span className="mission-task-text">{t.text}</span>
                <span className={`mission-chip ${meta.cls}`}>{meta.label}</span>
                {isAdopted && t.status !== 'done' && <span className="mission-chip office">در دفتر</span>}
              </li>;
            })}
          </ul>
        </div>;
      })}
    </div>
    <p className="panel-hint" style={{ marginTop: 10 }}>
      خروجی هر کار در «دفتر مدیر» کامل ثبت می‌شود و اعلان‌های مأموریت به تلگرامت می‌رود.
    </p>
  </div>;
}

/* ---------- root ---------- */

export default function App() {
  const [state, setState] = useState(() => store.state);
  const [tab, setTab] = useState<'tasks' | 'team' | 'feed' | 'office' | 'agents' | 'missions'>('missions');
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zen, setZen] = useState(false);
  const [, bumpOnFollowCancel] = useState(0); // pan/zoom که follow را لغو کند → یک رندر تا دکمهٔ کارت همگام شود
  const [aiConfig, setAiConfig] = useState(() => loadConfig());
  const [onboarded, setOnboarded] = useState(() => {
    try { return localStorage.getItem('sesemi-office-onboarded') === '1'; } catch { return true; }
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => store.subscribe(() => setState({ ...store.state })), []);
  useEffect(() => { store.start(); return () => store.stop(); }, []);

  // expose the edit-modal opener for panels (avoids prop drilling)
  useEffect(() => {
    (window as unknown as { __openAgent: (id: string) => void }).__openAgent = (id: string) => setEditingId(id);
  }, []);

  // camera + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      // تغییر معنادار ابعاد → دوباره fit (چرخش گوشی/resize پنجره دفتر را کراپ نمی‌کند)
      const refit = Math.abs(w - cameraCtl.cssW) > 40 || Math.abs(h - cameraCtl.cssH) > 40;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      cameraCtl.dpr = devicePixelRatio;
      cameraCtl.cssW = w;
      cameraCtl.cssH = h;
      if (refit && !cameraCtl.followId) cameraCtl.cam = fitCamera(w, h);
    };
    resize();
    initCamera(canvas);
    window.addEventListener('resize', resize);
    let raf = 0, last = 0;
    const loop = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, .06) : .016;
      last = now;
      stepEffects(dt);
      render(canvas, store.state.agents, now);
      (window as unknown as { __office?: object }).__office = { hits: cameraCtl.hits, cam: cameraCtl.cam, pickTile, store }; // live diagnostics
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  // pointer interactions: rotate (drag), lift-and-drop agents, pinch-zoom + two-finger pan, tap-select, wheel-zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0, lastPinch = 0, lastMid = { x: 0, y: 0 };
    let dragId: string | null = null;
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic/inactive pointer — harmless */ }
      pointers.set(e.pointerId, pos(e));
      if (pointers.size === 1) {
        moved = 0;
        const p = pos(e);
        const id = pickAgent(p.x, p.y);
        if (id) {
          dragId = id;
          cameraCtl.dragAgentId = id;
          cameraCtl.liftStart = performance.now();
        }
      }
    };
    const move = (e: PointerEvent) => {
      const p = pos(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      if (pointers.size >= 2) {
        pointers.set(e.pointerId, p);
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (lastPinch) {
          const wasFollowing = cameraCtl.followId !== null;
          zoomAt(mid.x, mid.y, dist / lastPinch);
          panBy(mid.x - lastMid.x, mid.y - lastMid.y);
          if (wasFollowing && cameraCtl.followId === null) bumpOnFollowCancel(t => t + 1);
        }
        lastPinch = dist;
        lastMid = mid;
        moved = 99;
      } else if (dragId) {
        // lifted agent follows the pointer horizontally — dropped on release
        moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
        pointers.set(e.pointerId, p);
      } else {
        moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
        if (moved > 6) {
          const wasFollowing = cameraCtl.followId !== null;
          rotateBy((p.x - prev.x) * 0.011);
          panBy(0, (p.y - prev.y) * 0.4);
          if (wasFollowing && cameraCtl.followId === null) bumpOnFollowCancel(t => t + 1);
          moved = Math.max(moved, 7);
        }
        pointers.set(e.pointerId, p);
      }
    };
    const up = (e: PointerEvent) => {
      const p = pos(e);
      if (dragId) {
        if (moved > 6) {
          const tile = pickTile(p.x, p.y);
          const ok = tile ? store.walkAgentTo(dragId, tile) : false;
          if (!ok) {
            const agent = store.state.agents.find(a => a.id === dragId);
            if (agent) { agent.bubble = 'اینجا نمی‌شه! 😅'; store.nudge(); }
          }
          setSelectedId(dragId);
        } else {
          setSelectedId(dragId); // a tap on the agent opens its card
        }
        dragId = null;
        cameraCtl.dragAgentId = null;
      } else if (pointers.size === 1 && moved <= 6) {
        setSelectedId(pickAgent(p.x, p.y));
      }
      pointers.delete(e.pointerId);
      lastPinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const wasFollowing = cameraCtl.followId !== null;
      const r = canvas.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      if (wasFollowing && cameraCtl.followId === null) bumpOnFollowCancel(t => t + 1);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
    };
  }, []);

  const editing = state.agents.find(a => a.id === editingId) ?? null;
  const workingCount = state.agents.filter(a => a.state === 'working').length;

  return <div className={`app-shell ${zen ? 'zen' : ''}`}>
    <header className="topbar">
      <div className="brand-row">
        <img src="/icons/icon-512.png" alt="" width={30} height={30} />
        <strong>دفتر سسِمی</strong>
        <span className="brand-hint">شبیه‌ساز شرکت هوشمند</span>
      </div>
      <div className="topbar-actions">
        <button className="ghost" onClick={() => { resetView(); }} aria-label="بازنشانی نما" title="بازنشانی نما">⟲</button>
        <button className="ghost" onClick={() => setZen(true)} aria-label="حالت تمرکز">⛶</button>
        <button className="ghost" onClick={() => setShowSettings(true)}>⚙️ تنظیمات AI</button>
      </div>
    </header>

    {isDemoMode(aiConfig) && <button className="demo-banner" onClick={() => setShowSettings(true)}>
      حالت نمایش فعال است — کلیدت را در تنظیمات بده تا کار واقعی انجام شود
    </button>}

    <div className="office-wrap">
      <canvas ref={canvasRef} className="office-canvas" />
      {selectedId && <AgentCard key={selectedId} state={state} agentId={selectedId} onClose={() => { setSelectedId(null); setFollow(null); }} />}
    </div>

    <div className="side-col">
      <nav className="tabbar">
        {([['missions', 'مأموریت‌ها'], ['tasks', 'وظیفه'], ['team', 'تیم'], ['feed', 'فعالیت'], ['office', 'دفتر مدیر'], ['agents', 'وظایف‌ها']] as const).map(([id, label]) =>
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </nav>

      <main className="panel-area">
        {tab === 'tasks' && <TaskForm state={state} />}
        {tab === 'team' && <AgentsPanel state={state} />}
        {tab === 'feed' && <FeedPanel state={state} />}
        {tab === 'office' && <OfficePanel state={state} />}
        {tab === 'missions' && <MissionsPanel />}
        {tab === 'agents' && <TasksPanel state={state} />}
      </main>
    </div>

    {zen && <div className="zen-hud">
      <span className="zen-pill">
        <span className="live-dot" /> {workingCount} ایجنت در حال کار · {new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <button className="ghost" onClick={() => setZen(false)}>خروج از حالت تمرکز</button>
    </div>}

    {showSettings && <SettingsModal onClose={() => { setShowSettings(false); setAiConfig(loadConfig()); }} />}
    {editing && <AgentEditModal agent={editing} onClose={() => setEditingId(null)} />}

    {!onboarded && <div className="welcome-scrim" role="dialog" aria-modal="true" aria-label="خوش‌آمدگویی">
      <div className="welcome-card">
        <img src="/icons/icon-512.png" alt="" width={52} height={52} />
        <p className="welcome-line1">دفتر زندهٔ تیم هوش مصنوعی</p>
        <p className="welcome-line2">یک جمله بنویس — تیم AI برنامه می‌ریزد، سر کار می‌رود و نتیجه را تحویل می‌دهد. همین.</p>
        <div className="welcome-chips">
          <span>🖥 سایت و لندینگ</span><span>✍️ محتوا و کپشن</span><span>🔍 تحقیق و گزارش</span><span>🗓 برنامه‌ریزی</span>
        </div>
        <button className="primary" onClick={() => {
          try { localStorage.setItem('sesemi-office-onboarded', '1'); } catch { /* private mode */ }
          setOnboarded(true);
          setTab('missions');
        }}>همین حالا به تیم کار بده</button>
        <p className="welcome-hint">بدون کلید هم کار می‌کند (حالت نمایشی) · اعلان‌ها به تلگرام می‌رود · دفتر با هر کارِ انجام‌شده بزرگ‌تر می‌شود</p>
      </div>
    </div>}
  </div>;
}
