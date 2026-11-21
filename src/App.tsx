import { useEffect, useRef, useState } from 'react';
import { getLang, onLang, setLang, t, type Lang as UiLang } from './i18n';
import { store, type OfficeState } from './officeStore';
import { cameraCtl, fitCamera, getOfficeTheme, initCamera, panBy, pickAgent, pickTile, render, resetView, rotateBy, setFollow, setOfficeTheme, stepEffects, zoomAt } from './render/officeCanvas';
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

const STATE_KEYS: Record<Agent['state'], string> = {
  idle: 'state.idle', walking: 'state.walking', working: 'state.working', meeting: 'state.meeting', coffee: 'state.coffee', arriving: 'state.arriving',
};
const stateLabel = (s: Agent['state']): string => t(STATE_KEYS[s]);

function timeOf(at: number): string {
  const locale = { fa: 'fa-IR', en: 'en-GB', hy: 'hy-AM' }[getLang()] || 'fa-IR';
  return new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** one-tap task presets per role — the minimal way to keep the office busy */
const QUICK_TASKS: Record<Role, { labelKey: string; detailKey: string; kind: TaskKind }[]> = {
  manager: [
    { labelKey: 'qt.manager.1', detailKey: 'qt.manager.1d', kind: 'research' },
    { labelKey: 'qt.manager.2', detailKey: 'qt.manager.2d', kind: 'schedule' },
  ],
  writer: [
    { labelKey: 'qt.writer.1', detailKey: 'qt.writer.1d', kind: 'content' },
    { labelKey: 'qt.writer.2', detailKey: 'qt.writer.2d', kind: 'content' },
  ],
  researcher: [
    { labelKey: 'qt.researcher.1', detailKey: 'qt.researcher.1d', kind: 'research' },
    { labelKey: 'qt.researcher.2', detailKey: 'qt.researcher.2d', kind: 'research' },
  ],
  assistant: [
    { labelKey: 'qt.assistant.1', detailKey: 'qt.assistant.1d', kind: 'schedule' },
    { labelKey: 'qt.assistant.2', detailKey: 'qt.assistant.2d', kind: 'email' },
  ],
};
const quickLabel = (p: { labelKey: string }): string => t(p.labelKey);
const quickDetail = (p: { detailKey: string }): string => t(p.detailKey);

/* ---------- panels ---------- */

function AgentsPanel({ state }: { state: OfficeState }) {
  return <div className="panel">
    <h2>{t('team.title')} <span className="panel-hint">{state.agents.length} — {t('team.hint')}</span></h2>
    <div className="agent-list">
      {state.agents.map(agent => <button className="agent-row" key={agent.id} onClick={() => (window as unknown as { __openAgent: (id: string) => void }).__openAgent(agent.id)}>
        <Avatar agent={agent} />
        <span className="agent-row-name">
          <strong>{agent.name}</strong>
          <small>{ROLE_META[agent.role].label}</small>
        </span>
        <span className="agent-row-status"><StatusDot state={agent.state} />{stateLabel(agent.state)}</span>
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
    if (!detail.trim()) { setError(t('form.errorEmpty')); return; }
    setBusy(true); setError(''); setOk('');
    try {
      if (toManager) {
        const result = store.assignToManager(title, detail);
        setOk(t('form.okBoss'));
      } else {
        store.assign(agentId, kind, title, detail);
      }
      setTitle(''); setDetail('');
    } catch (e) { setError(e instanceof Error ? e.message : 'خطا'); }
    setBusy(false);
  }

  return <div className="panel">
    <h2>{t('form.title')}</h2>
    <div className="recip-switch" role="radiogroup" aria-label="گیرندهٔ وظیفه">
      <button type="button" className={toManager ? '' : 'on'} onClick={() => setToManager(false)}>{t('form.specific')}</button>
      <button type="button" className={toManager ? 'on' : ''} onClick={() => setToManager(true)}>{t('form.auto')}</button>
    </div>
    <label className="field">{t('form.agent')}
      <select value={agentId} disabled={toManager} onChange={e => setAgentId(e.target.value)}>
        {state.agents.map(a => <option key={a.id} value={a.id}>{a.name} — {ROLE_META[a.role].label}</option>)}
      </select>
    </label>
    {toManager && <small className="field-hint">{t('form.autoHint')}</small>}
    {!toManager && <label className="field">{t('form.kind')}
      <select value={kind} onChange={e => setKind(e.target.value as TaskKind)}>
        {Object.entries(TASK_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
    </label>}
    <label className="field">{t('form.titleField')} <small>{t('form.optional')}</small>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثلاً: پاسخ به درخواست قیمت" />
    </label>
    <label className="field">{t('form.ask')}
      <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3}
        placeholder={t('form.askPlaceholder')} />
    </label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {ok && <p className="form-ok" role="status">{ok}</p>}
    <button className="primary" onClick={submit} disabled={busy}>{toManager ? t('form.submitBoss') : t('form.submit')}</button>
  </div>;
}

function FeedPanel({ state }: { state: OfficeState }) {
  return <div className="panel">
    <h2>{t('feed.title')} <button className="ghost" onClick={() => store.clearFeed()}>{t('feed.clear')}</button></h2>
    <div className="feed">
      {state.feed.length === 0 && <p className="empty">{t('feed.empty')}</p>}
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

/** پنجرهٔ پیش‌نمایش صفحهٔ ساخته‌شدهٔ ایجنت (iframe ایزوله + دانلود) */
function LandingPreview({ html, onClose }: { html: string; onClose: () => void }) {
  const blob = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  useEffect(() => () => URL.revokeObjectURL(blob), [blob]);
  return <div className="landing-scrim" role="dialog" aria-modal="true" aria-label={t('preview.title')}>
    <div className="landing-window">
      <div className="landing-bar">
        <strong>{t('preview.title')}</strong>
        <div className="landing-actions">
          <a className="ghost mini" href={blob} target="_blank" rel="noopener noreferrer">تب جدید</a>
          <a className="ghost mini" href={blob} download="sesemi-landing.html">دانلود HTML</a>
          <button className="ghost card-close" onClick={onClose} aria-label="بستن">✕</button>
        </div>
      </div>
      <iframe title={t('preview.title')} srcDoc={html} sandbox="allow-scripts allow-forms" />
    </div>
  </div>;
}

function TaskResult({ task, agent, agents = [], delegationKids = [] }: {
  task: Task; agent?: Agent; agents?: Agent[]; delegationKids?: Task[];
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  return <div className={`task-row ${task.status}`}>
    <div className="task-row-head" onClick={() => setOpen(!open)}>
      <span className="task-title">{task.title}
        {task.demo && <span className="badge-demo">{t('badge.demo')}</span>}
      </span>
      <span className="task-meta">
        {agent ? agent.name : '—'} · {TASK_LABELS[task.kind]} · {' '}
        {task.status === 'done' ? t('task.done') : task.status === 'failed' ? t('task.failed')
          : task.status === 'working' ? (task.isDelegation ? t('task.delegating') : t('task.working'))
          : task.status === 'walking' ? t('task.walk') : t('task.queue')}
      </span>
    </div>
    {task.delegationId !== undefined && <p className="delegation-note" title={task.routeReason ?? undefined}>{t('task.delegated')}</p>}
    <p className="task-detail">{task.detail}</p>
    {task.isDelegation && delegationKids.length > 0 && <ul className="delegation-children">
      {delegationKids.map(kid => {
        const kidAgent = agents.find(a => a.id === kid.agentId);
        return <li key={kid.id} title={kid.routeReason ?? undefined}>
          <span className="deleg-kid-agent">{kidAgent ? kidAgent.name : '—'}</span>
          <span className="deleg-kid-kind">{TASK_LABELS[kid.kind]}</span>
          <span className="deleg-kid-status">{kid.status === 'done' ? t('task.done') : kid.status === 'failed' ? t('task.failed') : kid.status === 'working' ? t('task.working') : kid.status === 'walking' ? t('task.walk') : t('task.queue')}</span>
        </li>;
      })}
    </ul>}
    {task.result && open && <div className="task-result">{task.result}</div>}
    {task.result && open && <ResultActions text={task.result} />}
    <div className="task-actions">
      {task.result && <button className="ghost" onClick={() => setOpen(!open)}>{open ? t('common.closeResult') : t('common.viewResult')}</button>}
      {task.resultHtml && <button className="primary mini" onClick={() => setPreview(true)}>{t('preview.title')}</button>}
      {task.status === 'failed' && <button className="ghost mini" onClick={() => store.retryTask(task.id)}>{t('common.retry')}</button>}
      {task.status !== 'done' && task.status !== 'failed' && <button className="ghost mini danger" onClick={() => store.cancelTask(task.id)}>{t('common.cancel')}</button>}
    </div>
    {preview && task.resultHtml && <LandingPreview html={task.resultHtml} onClose={() => setPreview(false)} />}
  </div>;
}

function TasksPanel({ state }: { state: OfficeState }) {
  return <div className="panel">
    <h2>{t('tasks.title')}</h2>
    {state.tasks.length === 0 && <p className="empty">{t('tasks.empty')}</p>}
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
        <span>{ROLE_META[agent.role].label} · <StatusDot state={agent.state} /> {stateLabel(agent.state)}</span>
      </div>
      <button className="ghost card-close" onClick={onClose} aria-label="بستن">✕</button>
    </div>
    {lastTask && <div className="agent-card-task">
      <span className="task-title">{lastTask.title}</span>
      <span className="task-meta">
        {lastTask.status === 'done' ? t('task.done') : lastTask.status === 'failed' ? t('task.failed') : lastTask.status === 'working' ? t('task.working') : lastTask.status === 'walking' ? t('task.walk') : t('task.queue')}
      </span>
      {lastTask.result && lastTask.status === 'done' && <p className="agent-card-preview">{lastTask.result.slice(0, 220)}{lastTask.result.length > 220 ? '…' : ''}</p>}
      {lastTask.result && lastTask.status === 'done' && <ResultActions text={lastTask.result} />}
    </div>}
    <div className="chips">
      {presets.map(p => <button key={p.labelKey} className="chip" onClick={() => store.assign(agent.id, p.kind, quickLabel(p), quickDetail(p))}>+ {quickLabel(p)}</button>)}
    </div>
    <div className="agent-card-actions">
      <button className="ghost" onClick={() => setFollow(following ? null : agent.id)}>
        {following ? t('agent.unfollow') : t('agent.follow')}
      </button>
      <button className="ghost" onClick={() => (window as unknown as { __openAgent: (id: string) => void }).__openAgent(agent.id)}>{t('common.personalize')}</button>
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
      <h2>{t('settings.title')}</h2>
      {isDemoMode(config) && <div className="demo-banner-inline">
        <span>{t('banner.demo')}</span>
        <button className="ghost" onClick={() => keyRef.current?.focus()}>{t('settings.gotoKey')}</button>
      </div>}
      <p className="hint">{t('settings.keyHint')}</p>
      <label className="field">{t('settings.provider')}
        <select value={config.provider} onChange={e => setConfig({ ...config, provider: e.target.value as ProviderKind, model: e.target.value === 'gemini' ? 'gemini-3.5-flash' : 'gpt-4o-mini' })}>
          <option value="gemini">{t('settings.providerGemini')}</option>
          <option value="openai-compat">{t('settings.providerCompat')}</option>
        </select>
      </label>
      <label className="field">{t('settings.key')}
        <input ref={keyRef} type="password" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} placeholder={t('settings.keyPh')} dir="ltr" />
      </label>
      {config.provider === 'openai-compat' &&
        <label className="field">{t('settings.baseUrl')} <small>{t('form.optional')}</small>
          <input value={config.baseUrl || ''} onChange={e => setConfig({ ...config, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" dir="ltr" />
        </label>}
      <label className="field">{t('settings.model')}
        <select value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })}>
          {(config.provider === 'gemini' ? GEMINI_MODELS : OPENAI_COMPAT_MODELS).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>{t('settings.cancel')}</button>
        <button className="primary" onClick={() => { saveConfig(config); setSaved(true); window.setTimeout(onClose, 700); }}>
          {saved ? t('settings.saved') : t('settings.save')}
        </button>
      </div>
      <p className="hint">{t('settings.hintKey')}</p>
      <p className="hint">{t('settings.hintRunning')}</p>
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
      <h2>{t('edit.title')} {agent.name}</h2>
      <div className="agent-preview"><Avatar agent={{ ...agent, name: name || '؟', uniformColor: uniform, hairColor: hair }} size={64} /></div>
      <label className="field">{t('edit.name')}
        <input value={name} onChange={e => setName(e.target.value)} maxLength={20} />
      </label>
      <label className="field">{t('edit.role')}
        <select value={role} onChange={e => setRole(e.target.value as Role)}>
          {Object.entries(ROLE_META).map(([k, meta]) => <option key={k} value={k}>{meta.label}</option>)}
        </select>
      </label>
      <label className="field">{t('edit.persona')}
        <textarea value={persona} onChange={e => setPersona(e.target.value)} rows={2} placeholder={t('edit.personaPh')} />
      </label>
      <label className="field">{t('edit.uniform')}
        <input type="color" value={uniform} onChange={e => setUniform(e.target.value)} />
      </label>
      <label className="field">{t('edit.hair')}
        <input type="color" value={hair} onChange={e => setHair(e.target.value)} />
      </label>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>{t('settings.cancel')}</button>
        <button className="primary" onClick={() => {
          store.updateAgent(agent.id, { name: name.trim() || agent.name, role, persona, uniformColor: uniform, hairColor: hair });
          onClose();
        }}>{t('settings.save')}</button>
      </div>
      {store.state.agents.length > 1 && <button className="danger ghost" onClick={() => { store.removeAgent(agent.id); onClose(); }}>{t('edit.remove')}</button>}
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
    <h2>{t('office.title')}</h2>

    <div className="brief-card">
      <div className="brief-card-head">
        <strong>{t('office.briefTitle')}</strong>
        {briefing && <span className={`brief-mode ${briefing.mode}`}>{briefing.mode === 'ai' ? t('office.withAI') : t('office.demoMode')}</span>}
      </div>
      {briefing && <p className="brief-time">{t('office.briefMeta')}: {timeOf(briefing.at)} · {briefing.statsKey.split('|')[0]}</p>}
      {briefing && <p className="brief-text">{briefing.text}</p>}
      {briefing && <ResultActions text={briefing.text} />}
      {noWorkToday
        ? <>
            <p className="field-hint">{t('office.noWork')}</p>
            <button className="primary" disabled>{t('office.generate')}</button>
          </>
        : <div className="brief-actions-row">
            <button className="primary" onClick={() => make()} disabled={loading}>{loading ? t('office.generating') : t('office.generate')}</button>
            <button className="ghost" onClick={() => make(true)} disabled={loading}>{t('common.refresh')}</button>
          </div>}
    </div>

    <h3 className="office-sub">{t('office.summary')}</h3>
    <div className="report-stats">
      <div className="report-stat"><b>{report.totalDone}</b><span>{t('office.done')}</span></div>
      <div className="report-stat failed"><b>{report.totalFailed}</b><span>{t('office.failed')}</span></div>
      <div className="report-stat active"><b>{report.totalActive}</b><span>{t('office.ongoing')}</span></div>
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
            <span className="report-agent-nums">{pa.done} {t('office.agentStats').split(' · ')[0]} · {pa.failed} {t('office.agentStats').split(' · ')[1]}</span>
            {pa.lastResult && <p className="report-agent-preview">{pa.lastResult.slice(0, 120)}{pa.lastResult.length > 120 ? '…' : ''}</p>}
          </div>
        </div>;
      })}
    </div>

    <h3 className="office-sub">{t('office.reports')}</h3>
    {report.reportTasks.length === 0
      ? <p className="empty">{t('office.noReports')}</p>
      : <div className="task-list">{report.reportTasks.map(task =>
        <TaskResult key={task.id} task={task} agent={state.agents.find(a => a.id === task.agentId)} agents={state.agents}
          delegationKids={task.isDelegation ? state.tasks.filter(t => t.delegationId === task.id) : []} />)}</div>}
  </div>;
}

/* ---------- missions (Mission Control bridge) ---------- */

const MISSION_STATUS_META: Record<MissionTaskStatus, { key: string; cls: string }> = {
  done: { key: 'status.done', cls: 'ok' },
  failed: { key: 'status.failed', cls: 'err' },
  active: { key: 'status.active', cls: 'run' },
  queued: { key: 'status.queued', cls: 'wait' },
};

function MissionsPanel() {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [stale, setStale] = useState(false);
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
    setCreating(true); setError(''); setFlash(t('missions.planning'));
    try {
      const { code } = await createMissionFromGoal(text);
      setGoal('');
      let mission: Mission | undefined;
      for (let attempt = 0; attempt < 4 && !mission; attempt++) {
        await new Promise(r => setTimeout(r, attempt ? 2500 : 800));
        const board = await fetchMissionBoard();
        mission = board.missions.find(m => m.code === code);
        setMissions(board.missions);
        setStale(board.stale);
      }
      if (!mission) {
        setFlash(`${code} ${t('missions.createdNoBoard')}`);
        return;
      }
      const fresh = mission.tasks.filter(mt => mt.status === 'active' || mt.status === 'queued');
      const sent = store.adoptMission({ ...mission, tasks: fresh });
      const next = new Set(adopted);
      for (const mt of fresh) next.add(adoptedKey(mission.code, mt.index));
      setAdopted(next);
      saveAdoptedKeys(next);
      setFlash(`🎯 ${code}: ${sent} ${t('missions.createdOk')}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('missions.errorDefault'));
      setFlash('');
    } finally {
      setCreating(false);
    }
  }

  const load = () => {
    setLoading(true);
    fetchMissionBoard()
      .then(board => { setMissions(board.missions); setStale(board.stale); })
      .catch(e => setError(e instanceof Error ? e.message : 'خطا در خواندن تابلو'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  function handOver(mission: Mission) {
    const fresh = mission.tasks.filter(mt => (mt.status === 'active' || mt.status === 'queued')
      && !adopted.has(adoptedKey(mission.code, mt.index)));
    if (!fresh.length) { setFlash(t('missions.nothingToHand')); return; }
    const sent = store.adoptMission({ ...mission, tasks: fresh });
    const next = new Set(adopted);
    for (const mt of fresh) next.add(adoptedKey(mission.code, mt.index));
    setAdopted(next);
    saveAdoptedKeys(next);
    setFlash(`${sent} ${t('missions.handOk')} (${mission.code})`);
  }

  return <div className="panel">
    <h2>{t('missions.title')} <span className="panel-hint">{t('missions.live')}</span>
      <button className="ghost mini" style={{ marginInlineStart: 'auto' }} onClick={load} disabled={loading}>
        {loading ? '…' : t('common.refresh')}
      </button>
    </h2>
    {stale && <p className="form-error" role="status">{t('missions.stale')}</p>}
    <div className="mission-goal">
      <label className="field">{t('missions.goal')}
        <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2}
          placeholder={t('missions.placeholder')}
          disabled={creating} />
      </label>
      <button className="primary" disabled={creating || !goal.trim()} onClick={launchGoal}>
        {creating ? t('office.generating') : t('missions.launch')}
      </button>
      <small className="field-hint">{t('missions.launchHint')}</small>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {flash && <p className="form-ok" role="status">{flash}</p>}
    {!error && missions && !missions.length && <p className="panel-hint">{t('missions.empty')}</p>}
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
              {allAdopted ? t('missions.handed') : t('missions.handOver')}
            </button>
          </div>
          <div className="mission-bar"><span style={{ width: `${pct}%` }} /></div>
          <ul className="mission-tasks">
            {mission.tasks.map(mt => {
              const meta = MISSION_STATUS_META[mt.status];
              const isAdopted = adopted.has(adoptedKey(mission.code, mt.index));
              return <li key={mt.index}>
                <span className="mission-task-text">{mt.text}</span>
                <span className={`mission-chip ${meta.cls}`}>{t(meta.key)}</span>
                {isAdopted && mt.status !== 'done' && <span className="mission-chip office">{t('missions.inOffice')}</span>}
              </li>;
            })}
          </ul>
        </div>;
      })}
    </div>
    <p className="panel-hint" style={{ marginTop: 10 }}>
      {t('missions.outputsHint')}
    </p>
  </div>;
}

/* ---------- root ---------- */

/** سوییچ زبان دفتر — فارسی (پیش‌فرض) / EN / ՀԱ */
function OfficeLangSwitch() {
  const [, force] = useState(0);
  useEffect(() => onLang(() => force(x => x + 1)), []);
  const labels: Record<UiLang, string> = { fa: 'فا', en: 'EN', hy: 'ՀԱ' };
  return <div className="lang-switch" role="group" aria-label="Language / زبان / Լեզու">
    {(['fa', 'en', 'hy'] as UiLang[]).map(l =>
      <button key={l} className={getLang() === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={getLang() === l} aria-label={l}>{labels[l]}</button>)}
  </div>;
}

export default function App() {
  const [, bumpOnLang] = useState(0); // سوییچ زبان → کل اپ دوباره رندر شود (قبلاً فقط سوییچر رفرش می‌شد!)
  useEffect(() => onLang(() => bumpOnLang(x => x + 1)), []);
  const [state, setState] = useState(() => store.state);
  const [tab, setTab] = useState<'work' | 'team' | 'feed' | 'office' | 'missions'>('missions');
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zen, setZen] = useState(false);
  const [lightUi, setLightUi] = useState(() => getOfficeTheme() === 'light');
  useEffect(() => { setOfficeTheme(lightUi ? 'light' : 'dark'); }, [lightUi]);
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

  return <div className={`app-shell ${zen ? 'zen' : ''} ${lightUi ? 'light-ui' : ''}`}>
    <header className="topbar">
      <div className="brand-row">
        <img src="/icons/icon-512.png" alt="" width={30} height={30} />
        <strong>{t('brand.name')}</strong>
        <span className="brand-hint">{t('brand.tag')}</span>
      </div>
      <div className="topbar-actions">
        <OfficeLangSwitch />
        <button className="ghost" onClick={() => setLightUi(v => !v)} aria-label={lightUi ? 'Dark mode' : 'Light mode'} title={lightUi ? 'Dark mode' : 'Light mode'}>{lightUi ? '🌙' : '☀️'}</button>
        <button className="ghost" onClick={() => { resetView(); }} aria-label={t('common.resetView')} title={t('common.resetView')}>⟲</button>
        <button className="ghost" onClick={() => setZen(true)} aria-label={t('common.zen')}>⛶</button>
        <button className="ghost" onClick={() => setShowSettings(true)}>{t('common.settings')}</button>
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
        {([['missions', 'tab.missions'], ['work', 'tab.work'], ['team', 'tab.team'], ['feed', 'tab.feed'], ['office', 'tab.office']] as const).map(([id, key]) =>
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{t(key)}</button>)}
      </nav>

      <main className="panel-area">
        {tab === 'work' && <>
          <TaskForm state={state} />
          <TasksPanel state={state} />
        </>}
        {tab === 'team' && <AgentsPanel state={state} />}
        {tab === 'feed' && <FeedPanel state={state} />}
        {tab === 'office' && <OfficePanel state={state} />}
        {tab === 'missions' && <MissionsPanel />}
      </main>
    </div>

    {zen && <div className="zen-hud">
      <span className="zen-pill">
        <span className="live-dot" /> {workingCount} {t('zen.working')} · {timeOf(Date.now())}
      </span>
      <button className="ghost" onClick={() => setZen(false)}>{t('zen.exit')}</button>
    </div>}

    {showSettings && <SettingsModal onClose={() => { setShowSettings(false); setAiConfig(loadConfig()); }} />}
    {editing && <AgentEditModal agent={editing} onClose={() => setEditingId(null)} />}

    {!onboarded && <div className="welcome-scrim" role="dialog" aria-modal="true" aria-label="خوش‌آمدگویی">
      <div className="welcome-card">
        <img src="/icons/icon-512.png" alt="" width={52} height={52} />
        <p className="welcome-line1">{t('welcome.title')}</p>
        <p className="welcome-line2">{t('welcome.sub')}</p>
        <div className="welcome-chips">
          <span>{t('welcome.chip1')}</span><span>{t('welcome.chip2')}</span><span>{t('welcome.chip3')}</span><span>{t('welcome.chip4')}</span>
        </div>
        <button className="primary" onClick={() => {
          try { localStorage.setItem('sesemi-office-onboarded', '1'); } catch { /* private mode */ }
          setOnboarded(true);
          setTab('missions');
        }}>{t('welcome.cta')}</button>
        <p className="welcome-hint">{t('welcome.hint')}</p>
      </div>
    </div>}
  </div>;
}
