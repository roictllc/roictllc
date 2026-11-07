/** CSV template for the Email Signature Suite employee import (spec Product 8). */
export function GET() {
  const csv = ['name,title,department,phone,mobile,email,extra_link', 'Dana Rivera,Owner,Management,(813) 555-0142,,dana@example.com,https://example.com/book', 'Sam Lee,Office Manager,Front desk,(813) 555-0143,(813) 555-0199,sam@example.com,'].join('\r\n');
  return new Response(`﻿${csv}\r\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="roi-signature-employees.csv"', 'Cache-Control': 'public, max-age=3600' } });
}
