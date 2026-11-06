import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSignatureSuite, lintEmailHtml, parseEmployeesCsv, renderSignature } from '../src/signatures';
import { SIGNATURE_TEMPLATES } from '../src/signature-templates';

const company = { name: 'Acme Dental Group', website: 'https://acmedental.example', address: '100 Harbor St, Tampa, FL', colors: ['#00E5FF', '#7B3FFF'], logoUrl: 'https://assets.roictllc.com/ws/abc/logo.gif', logoWidth: 600, logoHeight: 300, social: { facebook: 'https://facebook.com/acme', instagram: 'https://instagram.com/acme' }, disclaimer: 'Confidential.', bannerText: 'Book online', bannerUrl: 'https://acmedental.example/book' };
const emp = { name: 'Dana O’Neil', title: 'Office Manager', department: 'Front desk', phone: '(813) 555-0100', mobile: '+1 813 555 0199', email: 'dana@acmedental.example', photoUrl: 'https://assets.roictllc.com/ws/abc/dana.png' };

describe('Email Signature Suite (Product 8)', () => {
  it.each(SIGNATURE_TEMPLATES.map((t) => t.slug))('template %s passes the email-HTML linter and escapes input', (slug) => {
    const { html, text } = renderSignature(slug, company, { ...emp, name: 'Eve <script>alert(1)</script>' });
    expect(lintEmailHtml(html)).toEqual([]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(text).toContain('dana@acmedental.example');
  });
  it('linter catches Outlook-breaking HTML', () => {
    expect(lintEmailHtml('<div style="display:flex"><img src="http://x/a.png"></div>').length).toBeGreaterThanOrEqual(3);
  });
  it('CSV import validates every row', () => {
    const csv = 'Name,Title,Email,Phone,Photo URL\n"Smith, Jo",CEO,jo@x.com,(813) 555-0100,https://x.com/p.png\n,No Name,a@b.com,,\nBad Email,,not-an-email,,\nDup,,jo@x.com,,\nInsecure,,ins@x.com,,http://x.com/p.png';
    const r = parseEmployeesCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe('Smith, Jo');
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
  });
  it('builds a real ZIP with per-employee HTML, text, gallery and install guides', async () => {
    const employees = Array.from({ length: 12 }, (_, i) => ({ ...emp, name: `Employee ${i}`, email: `e${i}@acmedental.example` }));
    const r = await buildSignatureSuite({ templateSlug: 'banner', company, employees, utm: true });
    expect(r.zip.subarray(0, 2).toString()).toBe('PK');
    const dir = mkdtempSync(path.join(tmpdir(), 'sig-'));
    const zipPath = path.join(dir, 'suite.zip');
    writeFileSync(zipPath, r.zip);
    const listing = execFileSync('python3', ['-I', '-c', 'import sys,zipfile;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zipPath]).toString();
    expect(listing).toContain('gallery.html');
    expect(listing).toContain('install-guides/outlook.txt');
    expect(listing.split('\n').filter((l) => l.startsWith('signatures/')).length).toBe(24);
    expect(r.gallery).toContain('ClipboardItem');
    expect(r.items[0].html).toContain('utm_source=email-signature');
  });
});
