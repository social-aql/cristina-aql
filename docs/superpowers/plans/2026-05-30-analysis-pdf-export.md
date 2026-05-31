# Analysis PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PDF export button to `AnalysisDetail` that generates a dark-themed, structured PDF using jsPDF, with a hidden easter egg keyword embedded at least 3 times across the document (once as "parola este [keyword]"), and the keyword baked into the filename.

**Architecture:** A pure client-side utility function (`src/lib/pdf/exportAnalysisPdf.ts`) builds the PDF programmatically using jsPDF's drawing API — dark backgrounds, lime/coral accents, monospace labels. `AnalysisDetail.tsx` gets an export button that calls it. No server-side code needed.

**Tech Stack:** `jspdf` (client-side PDF generation), React (button UI), existing design tokens from `fork-config.ts`.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| **Install** | `package.json` | Add `jspdf` dependency |
| **Create** | `src/lib/pdf/exportAnalysisPdf.ts` | PDF generation utility with easter egg logic |
| **Modify** | `src/components/analyses/AnalysisDetail.tsx` | Add export button wired to utility |

---

## Task 1: Install jsPDF

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
pnpm add jspdf
```

- [ ] **Step 2: Verify installation**

```bash
grep '"jspdf"' package.json
```

Expected: `"jspdf": "^2.x.x"` in dependencies.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add jspdf for analysis PDF export"
```

---

## Task 2: Create the PDF export utility

**Files:**
- Create: `src/lib/pdf/exportAnalysisPdf.ts`

This is the core module. It exports a single function `exportAnalysisPdf(props)` that:
1. Picks a random keyword at export time
2. Builds a multi-page dark-theme PDF via jsPDF drawing API
3. Injects 3 easter egg occurrences at specific layout positions
4. Triggers browser download with keyword in filename

### Easter egg placement strategy

| Egg | Location | Style | Visibility |
|-----|----------|-------|------------|
| Egg 1 | Header area, after visible metadata, same line as sys timestamp | `courier 5.5pt`, color `rgb(35,35,35)` | Nearly invisible — looks like noise |
| Egg 2 | Section divider midpoint, centered on the rule line | `courier 5pt`, color `rgb(35,35,35)` | Almost invisible — buried in the separator |
| Egg 3 "parola este" | After all content, before final footer, centered italic line | `courier italic 6pt`, color `rgb(60,60,60)` | Faint but discoverable when reading carefully |

The keyword also appears in the download filename: `analiza-[type]-[date]-[keyword].pdf`.

- [ ] **Step 1: Create the file**

Create `src/lib/pdf/exportAnalysisPdf.ts` with this complete content:

```typescript
import jsPDF from 'jspdf';
import type {
  AnalysisType,
  WeeklySummaryOutput,
  ContentPatternsOutput,
  ContentIdeationOutput,
  KeyFinding,
} from '@/ai/analyses/types';

// ——— Color palette (mirrors fork-config.ts theme) ———
type RGB = [number, number, number];

const C = {
  bg:            [0, 0, 0] as RGB,
  bgCard:        [20, 20, 20] as RGB,
  bgCardPos:     [14, 26, 6] as RGB,
  bgCardNeg:     [26, 9, 8] as RGB,
  textPrimary:   [242, 239, 228] as RGB,
  textSecondary: [138, 138, 138] as RGB,
  textMuted:     [90, 90, 90] as RGB,
  lime:          [199, 248, 76] as RGB,
  coral:         [255, 90, 78] as RGB,
  border:        [38, 38, 38] as RGB,
  borderPos:     [58, 92, 15] as RGB,
  borderNeg:     [92, 31, 26] as RGB,
  eggFainter:    [35, 35, 35] as RGB,  // eggs 1 & 2: nearly invisible on #000
  eggFaint:      [60, 60, 60] as RGB,  // egg 3: faint but readable on careful inspection
};

const KEYWORDS = ['umbra', 'fulger', 'nimbus', 'axiom', 'ecou', 'cobalt', 'vertex'];

const MARGIN = 20;   // mm
const PW = 210;      // A4 width mm
const PH = 297;      // A4 height mm
const CW = PW - MARGIN * 2; // 170mm usable width

const TYPE_LABELS: Record<AnalysisType, string> = {
  weekly_summary:   'SUMAR SĂPTĂMÂNAL',
  content_patterns: 'TIPARE CONȚINUT',
  content_ideation: 'IDEI CONȚINUT',
};

// ——— Layout state ———
interface S {
  doc: jsPDF;
  y: number;
  page: number;
  kw: string;
}

// ——— Low-level helpers ———
function fillBg(doc: jsPDF) {
  doc.setFillColor(C.bg[0], C.bg[1], C.bg[2]);
  doc.rect(0, 0, PW, PH, 'F');
}

function newPage(s: S) {
  s.doc.addPage();
  s.page++;
  s.y = MARGIN;
  fillBg(s.doc);
}

function guard(s: S, needed: number) {
  if (s.y + needed > PH - MARGIN) newPage(s);
}

function gap(s: S, n: number) { s.y += n; }

function setFill(doc: jsPDF, c: RGB) { doc.setFillColor(c[0], c[1], c[2]); }
function setStroke(doc: jsPDF, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]); }
function setTxt(doc: jsPDF, c: RGB) { doc.setTextColor(c[0], c[1], c[2]); }

// ——— Text renderers ———

function eyebrow(s: S, label: string) {
  guard(s, 8);
  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(6.5);
  setTxt(s.doc, C.textMuted);
  s.doc.text(label.toUpperCase(), MARGIN, s.y, { charSpace: 1.2 });
  s.y += 7;
}

function bigHeadline(s: S, txt: string) {
  guard(s, 20);
  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(22);
  setTxt(s.doc, C.textPrimary);
  const lines = s.doc.splitTextToSize(txt.toUpperCase(), CW);
  s.doc.text(lines, MARGIN, s.y);
  s.y += (lines as string[]).length * 9 + 4;
}

function bodyText(s: S, txt: string) {
  s.doc.setFont('helvetica', 'normal');
  s.doc.setFontSize(8.5);
  setTxt(s.doc, C.textSecondary);
  const lines = s.doc.splitTextToSize(txt, CW) as string[];
  for (const line of lines) {
    guard(s, 5.5);
    s.doc.text(line, MARGIN, s.y);
    s.y += 5;
  }
  s.y += 2;
}

function monoText(s: S, txt: string, color: RGB = C.textMuted, size = 8) {
  guard(s, 6);
  s.doc.setFont('courier', 'normal');
  s.doc.setFontSize(size);
  setTxt(s.doc, color);
  s.doc.text(txt, MARGIN, s.y);
  s.y += 5.5;
}

function hr(s: S) {
  guard(s, 5);
  setStroke(s.doc, C.border);
  s.doc.line(MARGIN, s.y, PW - MARGIN, s.y);
  s.y += 6;
}

// ——— Cards ———

function statRow(s: S, label: string, value: string, valColor: RGB = C.textPrimary) {
  guard(s, 14);
  const h = 12;
  setFill(s.doc, C.bgCard);
  setStroke(s.doc, C.border);
  s.doc.roundedRect(MARGIN, s.y, CW, h, 1, 1, 'FD');

  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(7);
  setTxt(s.doc, C.textMuted);
  s.doc.text(label.toUpperCase(), MARGIN + 4, s.y + 7.5, { charSpace: 0.8 });

  s.doc.setFont('courier', 'bold');
  s.doc.setFontSize(9);
  setTxt(s.doc, valColor);
  s.doc.text(value, PW - MARGIN - 4, s.y + 7.5, { align: 'right' });

  s.y += h + 3;
}

function findingCard(s: S, f: KeyFinding) {
  const bodyLines = (f.detail ? s.doc.splitTextToSize(f.detail, CW - 8) : []) as string[];
  const h = 6 + 5 + (f.metric ? 5 : 0) + bodyLines.length * 5 + 6;
  guard(s, h + 3);

  const borderColor: RGB = f.tone === 'positive' ? C.borderPos : f.tone === 'negative' ? C.borderNeg : C.border;
  const bgColor: RGB = f.tone === 'positive' ? C.bgCardPos : f.tone === 'negative' ? C.bgCardNeg : C.bgCard;

  setFill(s.doc, bgColor);
  setStroke(s.doc, borderColor);
  s.doc.roundedRect(MARGIN, s.y, CW, h, 1, 1, 'FD');

  const startY = s.y;
  let inner = startY + 6;

  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(7.5);
  setTxt(s.doc, C.textPrimary);
  s.doc.text(f.title.toUpperCase(), MARGIN + 4, inner);

  if (f.metric) {
    inner += 5;
    s.doc.setFont('courier', 'normal');
    s.doc.setFontSize(7);
    setTxt(s.doc, C.lime);
    s.doc.text(f.metric, MARGIN + 4, inner);
  }

  if (bodyLines.length > 0) {
    inner += 5;
    s.doc.setFont('helvetica', 'normal');
    s.doc.setFontSize(8);
    setTxt(s.doc, C.textSecondary);
    s.doc.text(bodyLines, MARGIN + 4, inner);
  }

  s.y = startY + h + 3;
}

function recCard(s: S, action: string, rationale: string, priority: string, idx: number) {
  const ratLines = s.doc.splitTextToSize(rationale, CW - 18) as string[];
  const actionLines = s.doc.splitTextToSize(action.toUpperCase(), CW - 28) as string[];
  const h = 6 + actionLines.length * 5 + ratLines.length * 5 + 8;
  guard(s, h + 3);

  setFill(s.doc, C.bgCard);
  setStroke(s.doc, C.border);
  s.doc.roundedRect(MARGIN, s.y, CW, h, 1, 1, 'FD');

  const startY = s.y;

  // Number
  s.doc.setFont('courier', 'bold');
  s.doc.setFontSize(11);
  setTxt(s.doc, C.lime);
  s.doc.text(String(idx + 1), MARGIN + 4, startY + 9);

  // Action
  s.doc.setFont('helvetica', 'bold');
  s.doc.setFontSize(7.5);
  setTxt(s.doc, C.textPrimary);
  s.doc.text(actionLines, MARGIN + 14, startY + 6);

  // Priority
  const prioColor: RGB = priority === 'high' ? C.coral : priority === 'medium' ? C.lime : C.textMuted;
  s.doc.setFont('courier', 'normal');
  s.doc.setFontSize(6.5);
  setTxt(s.doc, prioColor);
  s.doc.text(priority.toUpperCase(), PW - MARGIN - 4, startY + 6, { align: 'right' });

  // Rationale
  s.doc.setFont('helvetica', 'normal');
  s.doc.setFontSize(8);
  setTxt(s.doc, C.textSecondary);
  s.doc.text(ratLines, MARGIN + 14, startY + 6 + actionLines.length * 5 + 1);

  s.y = startY + h + 3;
}

// ——— Easter egg injectors ———

// Egg 1: sys:ref line — in header area, after visible metadata. Looks like a debug artifact.
function eggSysRef(s: S) {
  guard(s, 5);
  s.doc.setFont('courier', 'normal');
  s.doc.setFontSize(5.5);
  setTxt(s.doc, C.eggFainter);
  s.doc.text(`sys:ref=${s.kw}-${Date.now().toString(36).slice(-4)}`, MARGIN, s.y);
  s.y += 4.5;
}

// Egg 2: centered label on a horizontal rule — nearly invisible, looks like rule decoration.
function hrWithEgg(s: S) {
  guard(s, 8);
  setStroke(s.doc, C.border);
  s.doc.line(MARGIN, s.y, PW - MARGIN, s.y);
  s.doc.setFont('courier', 'normal');
  s.doc.setFontSize(5);
  setTxt(s.doc, C.eggFainter);
  s.doc.text(`[${s.kw}]`, PW / 2, s.y - 0.5, { align: 'center' });
  s.y += 6;
}

// Egg 3: "parola este [keyword]" — faint centered italic, placed after all content sections.
function eggParola(s: S) {
  guard(s, 10);
  s.doc.setFont('courier', 'italic');
  s.doc.setFontSize(6);
  setTxt(s.doc, C.eggFaint);
  s.doc.text(`— parola este ${s.kw} —`, PW / 2, s.y, { align: 'center' });
  s.y += 7;
}

// ——— Rec normalizer (mirrors AnalysisDetail.tsx logic) ———
function normalizeRec(r: unknown): { action: string; rationale: string; priority: string } {
  const o = r as Record<string, unknown>;
  return {
    action:    String(o.action ?? o.recommendation ?? o.text ?? o.descriere ?? ''),
    rationale: String(o.rationale ?? o.reason ?? o.justification ?? o.justificare ?? o.motivatie ?? ''),
    priority:  ['high', 'medium', 'low'].includes(o.priority as string)
      ? String(o.priority)
      : String(o.level ?? 'medium'),
  };
}

// ——— Markdown stripper for narrative sections ———
function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
    .trim();
}

// ——— Section renderers ———

function renderWeeklySummary(s: S, output: WeeklySummaryOutput) {
  const pc = output.period_comparison;

  eyebrow(s, 'COMPARAȚIE PERIOADĂ');

  const erColor: RGB = pc.er_change?.startsWith('+') ? C.lime : pc.er_change?.startsWith('-') ? C.coral : C.textPrimary;
  const rcColor: RGB = pc.reach_change?.startsWith('+') ? C.lime : pc.reach_change?.startsWith('-') ? C.coral : C.textPrimary;
  const fcColor: RGB = pc.follower_change?.startsWith('+') ? C.lime : pc.follower_change?.startsWith('-') ? C.coral : C.textPrimary;

  statRow(s, 'ENGAGEMENT RATE', pc.er_change ?? 'N/A', erColor);
  statRow(s, 'REACH', pc.reach_change ?? 'N/A', rcColor);
  statRow(s, 'URMĂRITORI', pc.follower_change ?? 'N/A', fcColor);
  if (pc.summary) bodyText(s, pc.summary);
  gap(s, 6);

  hrWithEgg(s); // ← Egg 2

  if (output.key_findings?.length > 0) {
    eyebrow(s, 'OBSERVAȚII CHEIE');
    output.key_findings.forEach(f => findingCard(s, f));
    gap(s, 6);
  }

  hr(s);

  if (output.recommendations?.length > 0) {
    eyebrow(s, 'RECOMANDĂRI');
    output.recommendations.forEach((r, i) => {
      const rec = normalizeRec(r);
      recCard(s, rec.action, rec.rationale, rec.priority, i);
    });
    gap(s, 6);
  }

  if (output.narrative_markdown) {
    hr(s);
    eyebrow(s, 'ANALIZĂ DETALIATĂ');
    bodyText(s, stripMarkdown(output.narrative_markdown));
  }
}

function renderContentPatterns(s: S, output: ContentPatternsOutput) {
  if (output.patterns?.length > 0) {
    eyebrow(s, 'PATTERN-URI IDENTIFICATE');
    output.patterns.forEach(p => {
      findingCard(s, {
        title: p.pattern,
        detail: '',
        tone: 'neutral',
        metric: `${(p.impact ?? '').toUpperCase()} IMPACT`,
      });
    });
    gap(s, 6);
  }

  hrWithEgg(s); // ← Egg 2

  if (output.theme_performance?.length > 0) {
    eyebrow(s, 'PERFORMANȚĂ PE TEME');
    output.theme_performance.forEach(t => {
      statRow(s, t.theme, `ER ${t.avg_er} · SAVES ${t.avg_saves}`);
    });
    gap(s, 6);
  }

  if (output.format_insights?.length > 0) {
    hr(s);
    eyebrow(s, 'INSIGHTS FORMAT');
    output.format_insights.forEach(f => findingCard(s, f));
    gap(s, 6);
  }

  if (output.recommendations?.length > 0) {
    hr(s);
    eyebrow(s, 'RECOMANDĂRI');
    output.recommendations.forEach((r, i) => {
      const rec = normalizeRec(r);
      recCard(s, rec.action, rec.rationale, rec.priority, i);
    });
    gap(s, 6);
  }

  if (output.narrative_markdown) {
    hr(s);
    eyebrow(s, 'ANALIZĂ DETALIATĂ');
    bodyText(s, stripMarkdown(output.narrative_markdown));
  }
}

function renderContentIdeation(s: S, output: ContentIdeationOutput) {
  output.ideas.forEach((idea, i) => {
    guard(s, 30);

    s.doc.setFont('helvetica', 'bold');
    s.doc.setFontSize(11);
    setTxt(s.doc, C.textPrimary);
    const titleLines = s.doc.splitTextToSize(`${i + 1}. ${idea.title.toUpperCase()}`, CW) as string[];
    s.doc.text(titleLines, MARGIN, s.y);
    s.y += titleLines.length * 6 + 2;

    s.doc.setFont('courier', 'normal');
    s.doc.setFontSize(7);
    setTxt(s.doc, C.lime);
    s.doc.text(`[${(idea.format ?? '').toUpperCase()}]  [${(idea.theme ?? '').toUpperCase()}]`, MARGIN, s.y);
    s.y += 6;

    eyebrow(s, 'HOOK');
    guard(s, 8);
    s.doc.setFont('helvetica', 'bolditalic');
    s.doc.setFontSize(8.5);
    setTxt(s.doc, C.textPrimary);
    const hookLines = s.doc.splitTextToSize(`"${idea.hook}"`, CW) as string[];
    s.doc.text(hookLines, MARGIN, s.y);
    s.y += hookLines.length * 5 + 3;

    eyebrow(s, 'STRUCTURĂ');
    const structText = typeof idea.structure === 'string'
      ? idea.structure
      : Object.entries(idea.structure as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(' | ');
    monoText(s, structText, C.textSecondary, 7.5);

    eyebrow(s, 'DE CE VA FUNCȚIONA');
    bodyText(s, idea.rationale);

    // Place egg 2 on the divider after the second idea
    if (i === 1) {
      hrWithEgg(s); // ← Egg 2
    } else {
      hr(s);
    }
    gap(s, 4);
  });

  if (output.narrative_markdown) {
    eyebrow(s, 'CONTEXT STRATEGIC');
    bodyText(s, stripMarkdown(output.narrative_markdown));
  }
}

// ——— Main exported function ———

export interface ExportAnalysisPdfProps {
  analysisType: AnalysisType;
  structuredOutput: unknown;
  createdAt: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  model: string;
  durationMs: number | null;
}

export function exportAnalysisPdf(props: ExportAnalysisPdfProps): void {
  const kw = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const s: S = { doc, y: MARGIN, page: 1, kw };

  fillBg(doc); // page 1 background

  const output = props.structuredOutput as WeeklySummaryOutput & ContentPatternsOutput & ContentIdeationOutput;

  // ——— Header ———
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setTxt(doc, C.lime);
  doc.text('AI LICHIDITATE', MARGIN, s.y, { charSpace: 1.5 });
  s.y += 6;

  eyebrow(s, `${TYPE_LABELS[props.analysisType]} · ${props.model}`);

  if (props.rangeFrom && props.rangeTo) {
    monoText(s, `${props.rangeFrom} → ${props.rangeTo}`, C.textMuted);
  }

  eggSysRef(s); // ← Egg 1 (page 1, after metadata)

  monoText(s, new Date(props.createdAt).toLocaleString('ro-RO'), C.textMuted);
  gap(s, 6);

  if (output.headline) bigHeadline(s, output.headline);

  hr(s);
  gap(s, 4);

  // ——— Content ———
  if (props.analysisType === 'weekly_summary') {
    renderWeeklySummary(s, output as WeeklySummaryOutput);
  } else if (props.analysisType === 'content_patterns') {
    renderContentPatterns(s, output as ContentPatternsOutput);
  } else {
    renderContentIdeation(s, output as ContentIdeationOutput);
  }

  // ——— Egg 3: "parola este" ———
  gap(s, 8);
  eggParola(s);

  // ——— Footer ———
  hr(s);
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  setTxt(doc, C.textMuted);
  doc.text(
    `GENERAT DE SISTEM · ${new Date(props.createdAt).toISOString()} · ${props.durationMs ? `${(props.durationMs / 1000).toFixed(1)}s` : '—'}`,
    PW / 2,
    s.y,
    { align: 'center' },
  );

  // ——— Save ———
  const dateStr = props.createdAt.slice(0, 10);
  const typeSlug = props.analysisType.replace(/_/g, '-');
  doc.save(`analiza-${typeSlug}-${dateStr}-${kw}.pdf`);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit 2>&1 | grep exportAnalysisPdf
```

Expected: no output (no errors for this file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/exportAnalysisPdf.ts
git commit -m "feat: add PDF export utility for AI analyses with easter egg"
```

---

## Task 3: Add export button to AnalysisDetail

**Files:**
- Modify: `src/components/analyses/AnalysisDetail.tsx`

Changes:
1. Import `exportAnalysisPdf` and `useState`
2. Add a loading state (`exporting: boolean`)
3. Add export button in the header section (right side, alongside the eyebrow metadata)
4. Button calls `exportAnalysisPdf` with the same props the component already receives

- [ ] **Step 1: Add import for the utility and useState**

In `src/components/analyses/AnalysisDetail.tsx`, after the existing React import:

```typescript
import React, { useState } from 'react';
```

And after the last existing import line (before the `TYPE_LABELS` constant):

```typescript
import { exportAnalysisPdf } from '@/lib/pdf/exportAnalysisPdf';
```

- [ ] **Step 2: Add loading state inside the `AnalysisDetail` function body**

After the opening `const output = ...` line:

```typescript
const [exporting, setExporting] = useState(false);

function handleExport() {
  setExporting(true);
  setTimeout(() => {
    exportAnalysisPdf({ analysisType, structuredOutput, createdAt, rangeFrom, rangeTo, model, durationMs });
    setExporting(false);
  }, 0);
}
```

- [ ] **Step 3: Add the export button to the header JSX**

Replace the existing header block:

```tsx
{/* Header */}
<div>
  <Eyebrow>
    {TYPE_LABELS[analysisType] ?? analysisType} · {model} · {relTime}
    {durationMs && ` · ${(durationMs / 1000).toFixed(1)}s`}
  </Eyebrow>
```

With:

```tsx
{/* Header */}
<div>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
    <Eyebrow>
      {TYPE_LABELS[analysisType] ?? analysisType} · {model} · {relTime}
      {durationMs && ` · ${(durationMs / 1000).toFixed(1)}s`}
    </Eyebrow>
    <button
      onClick={handleExport}
      disabled={exporting}
      style={{
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: exporting ? colors.textMuted : colors.accentLime,
        background: 'transparent',
        border: `1px solid ${exporting ? colors.borderDefault : colors.borderPositive}`,
        borderRadius: 4,
        padding: '4px 10px',
        cursor: exporting ? 'default' : 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {exporting ? 'EXPORT...' : '↓ PDF'}
    </button>
  </div>
```

Also close the new wrapping div after the `Eyebrow` closing tag for the range and headline — the full updated header should look like:

```tsx
{/* Header */}
<div>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
    <Eyebrow>
      {TYPE_LABELS[analysisType] ?? analysisType} · {model} · {relTime}
      {durationMs && ` · ${(durationMs / 1000).toFixed(1)}s`}
    </Eyebrow>
    <button
      onClick={handleExport}
      disabled={exporting}
      style={{
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: exporting ? colors.textMuted : colors.accentLime,
        background: 'transparent',
        border: `1px solid ${exporting ? colors.borderDefault : colors.borderPositive}`,
        borderRadius: 4,
        padding: '4px 10px',
        cursor: exporting ? 'default' : 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {exporting ? 'EXPORT...' : '↓ PDF'}
    </button>
  </div>
  {rangeFrom && rangeTo && (
    <div style={{ marginTop: 4 }}>
      <Mono tone="muted">{rangeFrom} → {rangeTo}</Mono>
    </div>
  )}
  {output.headline && (
    <div style={{ marginTop: 12 }}>
      <h1
        style={{
          fontFamily: 'var(--font-league-spartan), sans-serif',
          fontSize: 'clamp(28px, 4vw, 48px)',
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          textTransform: 'uppercase',
          color: colors.textPrimary,
          margin: 0,
        }}
      >
        {output.headline}
      </h1>
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify TypeScript compiles clean**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: no output or unrelated errors only.

- [ ] **Step 5: Commit**

```bash
git add src/components/analyses/AnalysisDetail.tsx
git commit -m "feat: add PDF export button to analysis detail view"
```

---

## Self-Review

**Spec coverage:**
- [x] Export button on analysis detail page → Task 3
- [x] Dark-themed PDF matching platform style → Task 2 (color constants mirror fork-config.ts)
- [x] Keyword appears ≥3 times → eggSysRef (1) + hrWithEgg (2) + eggParola (3)
- [x] At least once "parola este [keyword]" → eggParola
- [x] Different pages → Egg 1 always page 1 header; Egg 2 after first major section (page 1–2); Egg 3 after all content (last page)
- [x] Keyword in filename → `analiza-[type]-[date]-[kw].pdf`
- [x] Randomly chosen at export time → `KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)]`

**Placeholder scan:** None found.

**Type consistency:** `ExportAnalysisPdfProps` matches `AnalysisDetail` props exactly. `normalizeRec` mirrors the same function in `AnalysisDetail.tsx`.
