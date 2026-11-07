import { ZipArchive } from 'archiver';
import { PassThrough } from 'node:stream';
import { SIGNATURE_TEMPLATES, type SignatureTemplateSlug } from './signature-templates';

/**
 * Product 8 — Email Signature Suite (spec §12). Table-based, inline-CSS signatures that survive Gmail, Outlook
 * (classic Word engine, new, web), Apple Mail and Thunderbird. Images must be permanent HTTPS URLs; the animated
 * GIF's first frame shows the full logo (Outlook shows only frame 1); a static PNG fallback is provided.
 */
export interface Company {
  name: string;
  website?: string;
  address?: string;
  colors: string[];
  logoUrl?: string; // animated email GIF (Product 1) or static logo
  logoWidth?: number;
  logoHeight?: number;
  social?: Record<string, string>;
  disclaimer?: string;
  bannerText?: string;
  bannerUrl?: string;
}
export interface Employee {
  name: string;
  title?: string;
  department?: string;
  phone?: string;
  mobile?: string;
  email: string;
  photoUrl?: string;
  extraLink?: string;
}

const esc = (s = '') => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const FONT = "font-family:Arial,Helvetica,sans-serif";
/** Only http(s) links survive (no javascript:/data: hrefs); images may also be inline PNG/GIF data for previews. */
const safeHref = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : undefined);
const safeImg = (u?: string) => (u && (/^https:\/\//i.test(u) || /^data:image\/(png|gif|jpeg);base64,[A-Za-z0-9+/=]+$/.test(u) || (process.env.APP_ENV !== 'production' && /^file:\/\//.test(u))) ? u : undefined);
const tel = (p: string) => `tel:${p.replace(/[^+\d]/g, '')}`;
function utm(url: string, on: boolean) {
  if (!on) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'email-signature');
    u.searchParams.set('utm_medium', 'email');
    return u.toString();
  } catch {
    return url;
  }
}

/** Dark-mode-safe text color: mid-tone accent that keeps ≥ 3:1 on both white and #1f1f1f. */
function safeAccent(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? '#2A6FDB' : L < 0.03 ? '#4A7BD0' : hex;
}

function contactLines(e: Employee, accent: string, linkUtm: boolean, c: Company) {
  const lines: string[] = [];
  if (e.phone) lines.push(`<a href="${tel(e.phone)}" style="color:#555555;text-decoration:none">${esc(e.phone)}</a>`);
  if (e.mobile) lines.push(`<a href="${tel(e.mobile)}" style="color:#555555;text-decoration:none">${esc(e.mobile)} (mobile)</a>`);
  lines.push(`<a href="mailto:${esc(e.email)}" style="color:${accent};text-decoration:none">${esc(e.email)}</a>`);
  if (c.website) lines.push(`<a href="${esc(utm(c.website, linkUtm))}" style="color:${accent};text-decoration:none">${esc(c.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`);
  if (e.extraLink) lines.push(`<a href="${esc(utm(e.extraLink, linkUtm))}" style="color:${accent};text-decoration:none">${esc(e.extraLink.replace(/^https?:\/\//, ''))}</a>`);
  return lines;
}

function socialRow(c: Company, accent: string) {
  const entries = Object.entries(c.social ?? {}).filter(([, u]) => /^https:\/\//.test(u));
  if (!entries.length) return '';
  return `<tr><td style="padding-top:6px;${FONT};font-size:12px">${entries.map(([k, u]) => `<a href="${esc(u)}" style="color:${accent};text-decoration:none;margin-right:10px">${esc(k.charAt(0).toUpperCase() + k.slice(1))}</a>`).join('')}</td></tr>`;
}

function logoImg(c: Company, w = 120) {
  if (!c.logoUrl) return '';
  const h = c.logoWidth && c.logoHeight ? Math.round((w * c.logoHeight) / c.logoWidth) : Math.round(w / 2);
  return `<img src="${esc(c.logoUrl)}" width="${w}" height="${h}" alt="${esc(c.name)} logo" style="display:block;border:0;outline:none;width:${w}px;height:${h}px">`;
}
function photoImg(e: Employee, size = 64) {
  return e.photoUrl ? `<img src="${esc(e.photoUrl)}" width="${size}" height="${size}" alt="${esc(e.name)}" style="display:block;border:0;border-radius:${size / 2}px;width:${size}px;height:${size}px">` : '';
}

export function renderSignature(slug: SignatureTemplateSlug, c0: Company, e0: Employee, opts: { utm?: boolean } = {}) {
  const c: Company = { ...c0, website: safeHref(c0.website), bannerUrl: safeHref(c0.bannerUrl), logoUrl: safeImg(c0.logoUrl), social: Object.fromEntries(Object.entries(c0.social ?? {}).filter(([, u]) => safeHref(u))) };
  const e: Employee = { ...e0, extraLink: safeHref(e0.extraLink), photoUrl: safeImg(e0.photoUrl) };
  const accent = safeAccent(c.colors[0] ?? '#2A6FDB');
  const accent2 = safeAccent(c.colors[1] ?? accent);
  const name = `<span style="${FONT};font-size:${slug === 'bold-name' ? 20 : 16}px;font-weight:bold;color:#222222">${esc(e.name)}</span>`;
  const role = [e.title, e.department].filter(Boolean).map((x) => esc(x!)).join(' · ');
  const roleHtml = role ? `<br><span style="${FONT};font-size:13px;color:${accent2}">${role}</span>` : '';
  const company = `<span style="${FONT};font-size:13px;font-weight:bold;color:#333333">${esc(c.name)}</span>`;
  const lines = contactLines(e, accent, !!opts.utm, c);
  const contact = `<span style="${FONT};font-size:12px;line-height:18px;color:#555555">${lines.join(slug === 'compact' ? ' &nbsp;|&nbsp; ' : '<br>')}</span>`;
  const address = c.address ? `<br><span style="${FONT};font-size:11px;color:#777777">${esc(c.address)}</span>` : '';
  const disclaimer = c.disclaimer && (slug === 'corporate' || slug === 'banner') ? `<tr><td colspan="3" style="padding-top:10px;${FONT};font-size:10px;line-height:14px;color:#888888">${esc(c.disclaimer)}</td></tr>` : '';
  const banner = slug === 'banner' && c.bannerText ? `<tr><td colspan="3" style="padding-top:10px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:${accent};border-radius:4px;padding:8px 14px;${FONT};font-size:13px;font-weight:bold"><a href="${esc(c.bannerUrl ?? c.website ?? '#')}" style="color:#ffffff;text-decoration:none">${esc(c.bannerText)}</a></td></tr></table></td></tr>` : '';
  const T = (inner: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt">${inner}</table>`;
  let body: string;
  switch (slug) {
    case 'classic-top':
      body = T(`<tr><td style="padding-bottom:8px">${logoImg(c, 140)}</td></tr><tr><td>${name}${roleHtml}<br>${company}</td></tr><tr><td style="padding-top:6px">${contact}${address}</td></tr>${socialRow(c, accent)}${disclaimer}`);
      break;
    case 'modern-bar':
      body = T(`<tr><td width="4" style="background-color:${accent};width:4px">&nbsp;</td><td style="padding-left:12px">${name}${roleHtml}<br>${company}<br>${contact}${address}</td><td style="padding-left:16px;vertical-align:middle">${logoImg(c, 110)}</td></tr>${socialRow(c, accent)}`);
      break;
    case 'compact':
      body = T(`<tr><td>${name}${role ? ` <span style="${FONT};font-size:13px;color:${accent2}">· ${role}</span>` : ''} <span style="${FONT};font-size:13px;color:#333333">· ${esc(c.name)}</span></td></tr><tr><td style="padding-top:4px">${contact}</td></tr>`);
      break;
    case 'photo-card':
      body = T(`<tr><td style="vertical-align:top;padding-right:12px">${photoImg(e) || logoImg(c, 64)}</td><td style="vertical-align:top">${name}${roleHtml}<br>${company}<br>${contact}</td></tr><tr><td colspan="2" style="padding-top:8px">${logoImg(c, 100)}</td></tr>${socialRow(c, accent)}`);
      break;
    case 'divider':
      body = T(`<tr><td style="vertical-align:middle;padding-right:14px;border-right:2px solid ${accent}">${logoImg(c, 110)}</td><td style="vertical-align:middle;padding-left:14px">${name}${roleHtml}<br>${contact}${address}</td></tr>${socialRow(c, accent)}`);
      break;
    case 'minimal':
      body = T(`<tr><td>${name}${roleHtml}</td></tr><tr><td style="padding-top:4px">${contact}</td></tr>`);
      break;
    case 'bold-name':
      body = T(`<tr><td>${name}${roleHtml}<br>${company}</td><td style="padding-left:16px">${logoImg(c, 90)}</td></tr><tr><td colspan="2" style="padding-top:6px">${contact}</td></tr>${socialRow(c, accent)}`);
      break;
    case 'corporate':
    case 'banner':
    case 'classic-left':
    default:
      body = T(`<tr><td style="vertical-align:top;padding-right:14px">${logoImg(c, 120)}</td><td style="vertical-align:top">${name}${roleHtml}<br>${company}<br>${contact}${address}</td></tr>${socialRow(c, accent)}${banner}${disclaimer}`);
  }
  const text = [e.name, role.replace(/&amp;/g, '&'), c.name, e.phone, e.mobile ? `${e.mobile} (mobile)` : '', e.email, c.website, c.address, ...Object.values(c.social ?? {}), c.disclaimer && (slug === 'corporate' || slug === 'banner') ? `\n${c.disclaimer}` : ''].filter(Boolean).join('\n');
  return { html: `<!-- ROI signature: ${slug} -->\n${body}`, text };
}

/** Email-HTML linter: rules that break in Outlook's Word engine or Gmail (spec Product 8 tests). */
export function lintEmailHtml(html: string): string[] {
  const issues: string[] = [];
  if (/<style\b/i.test(html)) issues.push('Uses a <style> block (Gmail/Outlook strip or ignore it); inline styles only.');
  if (/<(div|section|article)\b[^>]*style="[^"]*display\s*:\s*(flex|grid)/i.test(html) || /display\s*:\s*(flex|grid)/i.test(html)) issues.push('Uses flexbox/grid (unsupported in Outlook).');
  if (/position\s*:\s*(absolute|fixed|relative)/i.test(html)) issues.push('Uses CSS positioning (unsupported).');
  if (/float\s*:/i.test(html)) issues.push('Uses floats (unreliable in Outlook).');
  if (/<script\b/i.test(html)) issues.push('Contains script.');
  if (/background-image/i.test(html)) issues.push('Uses CSS background images (Outlook ignores them).');
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\bwidth="\d+"/.test(tag) || !/\bheight="\d+"/.test(tag)) issues.push('Image without width/height attributes.');
    if (!/\balt="/.test(tag)) issues.push('Image without alt text.');
    const src = tag.match(/src="([^"]+)"/)?.[1] ?? '';
    const devLocal = process.env.APP_ENV !== 'production' && src.startsWith('file://'); // local storage in development only
    if (!/^https:\/\//.test(src) && !devLocal) issues.push(`Image source must be a permanent HTTPS URL (${src.slice(0, 40)}).`);
  }
  if (!/<table\b/i.test(html)) issues.push('Layout must use tables.');
  return [...new Set(issues)];
}

/** CSV import with per-row validation (template: name,title,department,phone,mobile,email,photo_url,extra_link). */
export function parseEmployeesCsv(csv: string, max = 50): { rows: Employee[]; errors: Array<{ line: number; error: string }> } {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], errors: [{ line: 1, error: 'The file is empty.' }] };
  const parse = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
      } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = parse(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const idx = (k: string) => header.indexOf(k);
  if (idx('name') < 0 || idx('email') < 0) return { rows: [], errors: [{ line: 1, error: 'Header must include at least “name” and “email”.' }] };
  const rows: Employee[] = [];
  const errors: Array<{ line: number; error: string }> = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((l, i) => {
    const line = i + 2;
    const c = parse(l);
    const get = (k: string) => (idx(k) >= 0 ? c[idx(k)] ?? '' : '');
    const e: Employee = { name: get('name'), title: get('title') || undefined, department: get('department') || undefined, phone: get('phone') || undefined, mobile: get('mobile') || undefined, email: get('email').toLowerCase(), photoUrl: get('photo_url') || undefined, extraLink: get('extra_link') || undefined };
    if (!e.name) return errors.push({ line, error: 'Missing name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) return errors.push({ line, error: `Invalid email “${e.email}”.` });
    if (seen.has(e.email)) return errors.push({ line, error: `Duplicate email “${e.email}”.` });
    for (const p of [e.phone, e.mobile]) if (p && !/^[+()\d\s.-]{7,20}$/.test(p)) return errors.push({ line, error: `Invalid phone “${p}”.` });
    for (const u of [e.photoUrl, e.extraLink]) if (u && !/^https:\/\//.test(u)) return errors.push({ line, error: `Links must start with https:// (“${u}”).` });
    seen.add(e.email);
    rows.push(e);
  });
  if (rows.length > max) errors.push({ line: 0, error: `Limit is ${max} employees per order; ${rows.length} provided.` });
  return { rows: rows.slice(0, max), errors };
}

export const INSTALL_GUIDES: Record<string, string> = {
  gmail: 'Gmail\n1. Open the gallery and click “Copy signature” for your name.\n2. In Gmail: Settings (gear) → See all settings → General → Signature → Create new.\n3. Paste (Ctrl/Cmd+V) into the editor and click Save Changes.\nTip: if the animated logo is still, re-insert it via Insert image → Web address (URL) using the hosted GIF link.',
  outlook: 'Outlook (new & web)\n1. Copy your signature from the gallery.\n2. Settings → Accounts → Signatures → New signature, paste, save, and set it as default.\nOutlook (classic, Windows)\n1. File → Options → Mail → Signatures → New, paste, OK.\nNote: some Outlook versions show only the first frame of animated GIFs — your first frame shows the full logo.',
  'apple-mail': 'Apple Mail\n1. Mail → Settings → Signatures → +.\n2. Uncheck “Always match my default message font”.\n3. Paste your copied signature and close the window.',
  thunderbird: 'Thunderbird\n1. Save your .html file from the ZIP.\n2. Account Settings → “Attach the signature from a file” → choose the .html file.',
  'google-workspace-admin': 'Google Workspace admins\nGmail signatures are set per user. Share each person’s gallery link, or use the Gmail API (users.settings.sendAs.update) with the HTML from the ZIP to set signatures for everyone.',
};

export function galleryHtml(company: Company, items: Array<{ employee: Employee; html: string }>) {
  const cards = items.map((it, i) => `<section class="card"><h2>${esc(it.employee.name)}</h2><div class="sig" id="sig-${i}">${it.html}</div><button data-target="sig-${i}">Copy signature</button></section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(company.name)} — email signatures</title>
<style>body{font-family:Arial,sans-serif;background:#f5f7fb;margin:0;padding:24px;color:#0b1224}h1{margin:0 0 16px}.card{background:#fff;border:1px solid #dde3ef;border-radius:12px;padding:16px;margin:0 0 16px}.sig{padding:12px;border:1px dashed #cbd3e6;border-radius:8px;margin:8px 0}button{background:#7B3FFF;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:bold;cursor:pointer}</style></head>
<body><h1>${esc(company.name)} — email signatures</h1><p>Click “Copy signature”, then paste it into your email app. Install guides are in the ZIP.</p>${cards}
<script>document.querySelectorAll('button[data-target]').forEach(function(b){b.addEventListener('click',async function(){var el=document.getElementById(b.dataset.target);var html=el.innerHTML;try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([el.innerText],{type:'text/plain'})})]);}catch(e){var r=document.createRange();r.selectNodeContents(el);var s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy');s.removeAllRanges();}b.textContent='Copied ✓';setTimeout(function(){b.textContent='Copy signature'},1800);});});</script></body></html>`;
}

const fileSlug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'employee';

export async function buildSignatureSuite(input: { templateSlug: SignatureTemplateSlug; company: Company; employees: Employee[]; utm?: boolean }) {
  if (!SIGNATURE_TEMPLATES.some((t) => t.slug === input.templateSlug)) throw new Error('Unknown template');
  const items = input.employees.map((employee) => ({ employee, ...renderSignature(input.templateSlug, input.company, employee, { utm: input.utm }) }));
  const issues = items.flatMap((it) => lintEmailHtml(it.html).map((x) => `${it.employee.email}: ${x}`));
  if (issues.length) throw new Error(`Signature QA failed: ${issues.slice(0, 3).join('; ')}`);
  const gallery = galleryHtml(input.company, items);
  const files: Array<{ name: string; content: string }> = [];
  const used = new Set<string>();
  for (const it of items) {
    let base = fileSlug(it.employee.name);
    while (used.has(base)) base += '-2';
    used.add(base);
    files.push({ name: `signatures/${base}.html`, content: `<!doctype html><html><head><meta charset="utf-8"></head><body>${it.html}</body></html>` }, { name: `signatures/${base}.txt`, content: it.text });
  }
  files.push({ name: 'gallery.html', content: gallery });
  for (const [k, v] of Object.entries(INSTALL_GUIDES)) files.push({ name: `install-guides/${k}.txt`, content: v });
  const zip = await zipFiles(files);
  return { items, gallery, files, zip };
}

export function zipFiles(files: Array<{ name: string; content: string | Buffer }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const a = new ZipArchive({ zlib: { level: 9 } });
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));
    out.on('end', () => resolve(Buffer.concat(chunks)));
    a.on('error', reject);
    a.pipe(out);
    for (const f of files) a.append(f.content, { name: f.name });
    a.finalize();
  });
}
