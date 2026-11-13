/**
 * Workflow gate for SESEMI Office + main site. Deterministic checks only.
 * Usage: node wf-gate.mjs <mode> [arg]
 *   office-check                      tsc + vite build (D:/projects/sesemi/office)
 *   office-deploy                     build + wrangler pages deploy --branch main + live verify
 *   site-deploy <commit-message>      site check + build + git push + poll live bundle for marker
 * Prints a single `GATE_JSON {...}` line as the LAST line of stdout.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const OFFICE = 'D:/projects/sesemi/office';
const SITE = 'D:/myproject';
const OFFICE_URL = 'https://sesemi-office.pages.dev/';
const SITE_URL = 'https://sesemi.pages.dev/';
const ALLOWED_HOSTS = new Set(['sesemi-office.pages.dev', 'sesemi.pages.dev']);

function sh(cmd, args, cwd, timeoutMs, useShell = true) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: useShell, timeout: timeoutMs ?? 300000 });
  return { code: r.status ?? 1, out: (r.stdout || ''), err: (r.stderr || '') };
}

// git resolves as git.exe on PATH — run without a shell so multi-word args
// (a commit message with spaces) survive intact on Windows
function git(args, cwd, timeoutMs) {
  return sh('git', args, cwd, timeoutMs, false);
}

async function fetchText(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) throw new Error('blocked host');
  const res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  return { status: res.status, text: await res.text() };
}

async function bundleInfo(baseUrl) {
  const page = await fetchText(baseUrl);
  if (page.status !== 200) return { status: page.status };
  const srcs = [...page.text.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
  const main = srcs[srcs.length - 1];
  if (!main) return { status: 200, js: null };
  const asset = await fetchText(new URL(main, baseUrl).href);
  const hash = createHash('sha256').update(asset.text).digest('hex').slice(0, 12);
  return { status: 200, js: main, hash, bytes: asset.text.length, contains: (needle) => asset.text.includes(needle) };
}

const mode = process.argv[2] || '';
const arg3 = process.argv[3] || '';
let gate = { mode, ok: false };

if (mode === 'office-check') {
  const check = sh('npm', ['run', 'check'], OFFICE, 240000);
  const build = check.code === 0 ? sh('npm', ['run', 'build'], OFFICE, 240000) : { code: -1, out: '', err: 'skipped: tsc failed' };
  gate = {
    mode, ok: check.code === 0 && build.code === 0,
    check: { code: check.code, tail: (check.err || check.out).slice(-3000) },
    build: { code: build.code, tail: (build.err || build.out).slice(-3000) },
  };
} else if (mode === 'office-deploy') {
  const before = await bundleInfo(OFFICE_URL).catch(e => ({ error: String(e) }));
  const build = sh('npm', ['run', 'build'], OFFICE, 240000);
  if (build.code !== 0) {
    gate = { mode, ok: false, stage: 'build', tail: (build.err || build.out).slice(-3000) };
  } else {
    const deploy = sh('npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', 'sesemi-office', '--branch', 'main', '--commit-dirty=true'], OFFICE, 300000);
    if (deploy.code !== 0) {
      gate = { mode, ok: false, stage: 'deploy', tail: (deploy.err || deploy.out).slice(-3000) };
    } else {
      // edge propagation: poll until the live bundle hash changes (or 90s cap)
      let after = null;
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 15000));
        after = await bundleInfo(OFFICE_URL).catch(e => ({ error: String(e) }));
        if (after.hash && after.hash !== before.hash) break;
      }
      const changed = Boolean(after && after.hash && before.hash && after.hash !== before.hash);
      gate = {
        mode, ok: true, stage: 'done',
        beforeHash: before.hash ?? null, afterHash: after?.hash ?? null, bundleChanged: changed,
        deployLog: (deploy.out || '').slice(-800),
      };
    }
  }
} else if (mode === 'site-deploy') {
  const check = sh('npm', ['run', 'check'], SITE, 300000);
  if (check.code !== 0) {
    gate = { mode, ok: false, stage: 'check', tail: (check.err || check.out).slice(-3000) };
  } else {
    const build = sh('npm', ['run', 'build'], SITE, 300000);
    if (build.code !== 0) {
      gate = { mode, ok: false, stage: 'build', tail: (build.err || build.out).slice(-3000) };
    } else {
      const before = await bundleInfo(SITE_URL).catch(e => ({ error: String(e) }));
      git(['add', '-A'], SITE, 60000);
      const commit = git(['commit', '-m', arg3 || 'SESEMI Office showcase'], SITE, 60000);
      git(['pull', '--rebase'], SITE, 120000);
      const push = git(['push'], SITE, 120000);
      if (push.code !== 0) {
        gate = { mode, ok: false, stage: 'push', tail: (push.err || push.out).slice(-2000) };
      } else {
        // Actions builds + deploys; poll until the live bundle contains the marker
        let found = false; let after = null;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 20000));
          after = await bundleInfo(SITE_URL).catch(e => ({ error: String(e) }));
          if (after.contains && after.contains('sesemi-office.pages.dev')) { found = true; break; }
          if (after.hash && before.hash && after.hash !== before.hash) break; // deployed but marker missing
        }
        gate = {
          mode, ok: found, stage: 'done', pushed: true,
          beforeHash: before.hash ?? null, afterHash: after?.hash ?? null, markerFound: found,
          commit: (commit.out || commit.err || '').slice(-300),
        };
      }
    }
  }
} else {
  gate = { mode, ok: false, error: `unknown mode: ${mode}` };
}

console.log('GATE_JSON ' + JSON.stringify(gate));
