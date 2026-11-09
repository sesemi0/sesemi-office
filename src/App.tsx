import { useEffect, useRef, useState } from 'react';
import { store, type OfficeState } from './officeStore';
import { fitCamera, render, type Camera } from './render/officeCanvas';
import { ROLE_META, TASK_LABELS, type Agent, type Role, type Task, type TaskKind } from './sim/agents';
import { loadConfig, saveConfig, GEMINI_MODELS, OPENAI_COMPAT_MODELS, type AiConfig, type ProviderKind } from './ai/llm';

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

/* ---------- panels ---------- */

function AgentsPanel({ state, onPick }: { state: OfficeState; onPick: (id: string) => void }) {
  return <div className="panel">
    <h2>تیم دفتر <span className="panel-hint">{state.agents.length} ایجنت</span></h2>
    <div className="agent-list">
      {state.agents.map(agent => <button className="agent-row" key={agent.id} onClick={() => onPick(agent.id)}>
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
  const [kind, setKind] = useState<TaskKind>('email');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!state.agents.some(a => a.id === agentId)) setAgentId(state.agents[0]?.id ?? '');
  }, [state.agents, agentId]);

  function submit() {
    if (busy) return;
    if (!detail.trim()) { setError('چیزی برای ایجنت بنویس (خواستهٔ خودت).'); return; }
    setBusy(true); setError('');
    try {
      store.assign(agentId, kind, title, detail);
      setTitle(''); setDetail('');
    } catch (e) { setError(e instanceof Error ? e.message : 'خطا'); }
    setBusy(false);
  }

  return <div className="panel">
    <h2>دادن وظیفه</h2>
    <label className="field">ایجنت
      <select value={agentId} onChange={e => setAgentId(e.target.value)}>
        {state.agents.map(a => <option key={a.id} value={a.id}>{a.name} — {ROLE_META[a.role].label}</option>)}
      </select>
    </label>
    <label className="field">نوع کار
      <select value={kind} onChange={e => setKind(e.target.value as TaskKind)}>
        {Object.entries(TASK_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
    </label>
    <label className="field">عنوان <small>اختیاری</small>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثلاً: پاسخ به درخواست قیمت" />
    </label>
    <label className="field">خواستهٔ تو
      <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3}
        placeholder="مثلاً: به مشتری که سفارش طراحی سایت پرسیده، یک پاسخ گرم با اشاره به زمان‌بندی بنویس" />
    </label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary" onClick={submit} disabled={busy}>سپردن وظیفه به ایجنت</button>
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

function TaskResult({ task, agent }: { task: Task; agent?: Agent }) {
  const [open, setOpen] = useState(false);
  return <div className={`task-row ${task.status}`}>
    <div className="task-row-head" onClick={() => setOpen(!open)}>
      <span className="task-title">{task.title}</span>
      <span className="task-meta">
        {agent ? agent.name : '—'} · {TASK_LABELS[task.kind]} · {' '}
        {task.status === 'done' ? 'انجام شد ✓' : task.status === 'failed' ? 'ناموفق ✗' : task.status === 'working' ? 'در حال کار…' : task.status === 'walking' ? 'در راه…' : 'در صف…'}
      </span>
    </div>
    <p className="task-detail">{task.detail}</p>
    {task.result && open && <div className="task-result">{task.result}</div>}
    {task.result && <button className="ghost" onClick={() => setOpen(!open)}>{open ? 'بستن نتیجه' : 'دیدن نتیجه'}</button>}
  </div>;
}

function TasksPanel({ state }: { state: OfficeState }) {
  return <div className="panel">
    <h2>وظایف</h2>
    {state.tasks.length === 0 && <p className="empty">هنوز وظیفه‌ای نداده‌ای — از پنل «دادن وظیفه» شروع کن.</p>}
    <div className="task-list">{state.tasks.map(task =>
      <TaskResult key={task.id} task={task} agent={state.agents.find(a => a.id === task.agentId)} />)}
    </div>
  </div>;
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<AiConfig>(() => loadConfig());
  const [saved, setSaved] = useState(false);
  return <div className="scrim" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <h2>تنظیمات هوش مصنوعی (کلید خودت)</h2>
      <p className="hint">کلید فقط در همین مرورگر خودت ذخیره می‌شود و فقط به سرویس‌دهنده‌ای که انتخاب می‌کنی فرستاده می‌شود.</p>
      <label className="field">سرویس‌دهنده
        <select value={config.provider} onChange={e => setConfig({ ...config, provider: e.target.value as ProviderKind, model: e.target.value === 'gemini' ? 'gemini-3.5-flash' : 'gpt-4o-mini' })}>
          <option value="gemini">گوگل Gemini (پلن رایگان دارد)</option>
          <option value="openai-compat">هر سرویس OpenAI-compatible (OpenAI / OpenRouter / GLM…)</option>
        </select>
      </label>
      <label className="field">کلید API
        <input type="password" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} placeholder="کلید را اینجا بچسبان" dir="ltr" />
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

/* ---------- root ---------- */

export default function App() {
  const [state, setState] = useState(() => store.state);
  const [tab, setTab] = useState<'tasks' | 'agents' | 'feed' | 'team'>('tasks');
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => store.subscribe(() => setState({ ...store.state })), []);
  useEffect(() => { store.start(); return () => store.stop(); }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener('resize', resize);
    const cam = fitCamera(canvas);
    (window as unknown as { __office: object }).__office = { cam, canvasW: canvas.width, canvasH: canvas.height, cssW: canvas.clientWidth };
    let raf = 0;
    const loop = (now: number) => { render(canvas, store.state.agents, cam, now); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  const picked = state.agents.find(a => a.id === pickedId) ?? null;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-row">
        <img src="/icons/icon-512.png" alt="" width={30} height={30} />
        <strong>دفتر سسِمی</strong>
        <span className="brand-hint">شبیه‌ساز شرکت هوشمند</span>
      </div>
      <div className="topbar-actions">
        <button className="ghost" onClick={() => setShowSettings(true)}>⚙️ تنظیمات AI</button>
      </div>
    </header>

    <div className="office-wrap"><canvas ref={canvasRef} className="office-canvas" /></div>

    <div className="side-col">
      <nav className="tabbar">
        {([['tasks', 'وظیفه'], ['team', 'تیم'], ['feed', 'فعالیت'], ['agents', 'وظایف‌ها']] as const).map(([id, label]) =>
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </nav>

      <main className="panel-area">
        {tab === 'tasks' && <TaskForm state={state} />}
        {tab === 'team' && <AgentsPanel state={state} onPick={id => setEditing(state.agents.find(a => a.id === id) ?? null)} />}
        {tab === 'feed' && <FeedPanel state={state} />}
        {tab === 'agents' && <TasksPanel state={state} />}
      </main>
    </div>

    {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    {editing && <AgentEditModal agent={editing} onClose={() => setEditing(null)} />}
  </div>;
}
