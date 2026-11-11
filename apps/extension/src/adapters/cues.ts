import type { CueFact } from '@faircart/schemas';
import type { RefRegistry } from './types';
import { cleanText, hashString, isVisible } from './util';

/**
 * Scans visible short text for urgency, scarcity, gating, scareware and modal
 * prompts. Only collects cues; whether a cue is a problem is decided by rules
 * (e.g. a countdown only matters if it resets).
 */

const COUNTDOWN = /(ends?|ending|expires?|left|closes?)\s+in\s+(?:(\d{1,2})\s*h(?:rs?|ours?)?\s*)?(?:(\d{1,2})\s*m(?:in(?:s|utes)?)?\s*)?(?:(\d{1,2})\s*s(?:ec(?:s|onds)?)?)?/i;
const CLOCK = /((?:ends?|ending|expires?|left|closes?)\s+in|(?:held|reserved|locked)\s+for)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i;
const STOCK = /\bonly\s+(\d{1,3})\s+(?:item|unit|piece)?s?\s*left\b/i;
const SOCIAL = /(\d+(?:\.\d+)?)\s*([KkLl])?\+?\s+(?:bought|sold|ordered)\s+in\s+(?:the\s+)?(?:past|last)\s+(hour|day|week|month)/i;
const VIEWING = /(\d+)\s+(?:people|users|others)\s+(?:are\s+)?(?:viewing|looking at)/i;
const SCAREWARE = /\b(virus|malware|infected|trojan)\b.*\b(detected|found|install|clean|remove|scan)\b/i;
const APP_GATE = /\b(download|install|get|open)\s+(?:the|our)\s+app\s+to\s+(unlock|see|get|view|avail|continue|claim)/i;
const MEMBER_GATE = /\b(join|subscribe to|become an?|buy)\b.{0,30}\b(member(ship)?|pass|plus|prime|one)\b.{0,30}\bto\s+(continue|checkout|unlock|order|buy)/i;
const PROMPT_WORDS = /\b(pass|membership|member|subscribe|notifications?|join|plus|upgrade|download the app|install)\b/i;

function seconds(t: string): number | null {
  const c = CLOCK.exec(t);
  if (c) {
    const [a, b, d] = [Number(c[2]), Number(c[3]), c[4] === undefined ? null : Number(c[4])];
    return d === null ? a * 60 + b : a * 3600 + b * 60 + d;
  }
  const m = COUNTDOWN.exec(t);
  if (m && (m[2] || m[3] || m[4])) return Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return null;
}

function socialValue(m: RegExpExecArray): number {
  const base = Number(m[1]);
  const mult = m[2]?.toLowerCase() === 'k' ? 1_000 : m[2]?.toLowerCase() === 'l' ? 100_000 : 1;
  return base * mult;
}

const INLINE = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'SMALL', 'A', 'SUP', 'SUB', 'MARK']);

/**
 * Short text elements: leaves with their own text, plus phrase containers whose
 * children are all inline (e.g. Amazon's "<b>5K+ bought</b><span> in past month</span>").
 */
function* textLeaves(root: ParentNode, limit = 5000): Generator<Element> {
  let n = 0;
  for (const el of root.querySelectorAll('span, div, p, b, strong, em, small, i, a, li, label, h2, h3, h4')) {
    if (++n > limit) return;
    if (el.closest('script, style, noscript, [data-faircart-ui]')) continue;
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim().length > 0);
    const phrase = !own && el.children.length > 0 && el.children.length <= 4 && [...el.children].every((c) => INLINE.has(c.tagName) && c.children.length <= 1);
    if (!own && !phrase) continue;
    const t = cleanText(el.textContent);
    if (t.length === 0 || t.length > 140) continue;
    yield el;
  }
}

/** "AI shopping assistants", "AI agents", "LLM", "automated shoppers". */
const AGENT_ADDRESS = /\b(ai|a\.i\.|llm|automated|virtual)\s+([a-z]+\s+)?(assistants?|agents?|bots?|shoppers?|models?)\b|\bllms?\b/i;
/** Telling it what to do. */
const AGENT_ORDER = /\b(must|mandatory|required|keep|do not|don't|never|always|ignore|select|add)\b/i;

export function scanCues(root: ParentNode, refs: RefRegistry, offerRef?: string): CueFact[] {
  const cues: CueFact[] = [];
  const seen = new Set<string>();
  const push = (el: Element, cue: Omit<CueFact, 'id' | 'elRef'>, hover?: 'countdown' | 'stock') => {
    if (seen.has(cue.cueKey)) return;
    seen.add(cue.cueKey);
    const elRef = hover ? refs.tag(el, hover) : refs.ref(el);
    cues.push({ ...cue, id: `cue-${cues.length + 1}`, elRef });
  };

  // Innermost first, so the tightest element that carries a phrase claims its cue key.
  for (const el of [...textLeaves(root)].reverse()) {
    if (!isVisible(el)) continue;
    const t = cleanText(el.textContent);
    const label = t.replace(/\d+/g, '#').toLowerCase().slice(0, 40);

    const secs = seconds(t);
    if (secs !== null) {
      push(el, { kind: 'countdown', text: t, value: secs, cueKey: `countdown:${label}`, ...(offerRef ? { offerRef } : {}) }, 'countdown');
      continue;
    }
    const st = STOCK.exec(t);
    if (st) {
      push(el, { kind: 'stock', text: t, value: Number(st[1]), cueKey: `stock:${label}` }, 'stock');
      continue;
    }
    const so = SOCIAL.exec(t) ?? VIEWING.exec(t);
    if (so) {
      push(el, { kind: 'social_proof', text: t, value: so === VIEWING.exec(t) ? Number(so[1]) : socialValue(so), cueKey: `social:${label}` });
      continue;
    }
    if (SCAREWARE.test(t)) {
      push(el, { kind: 'scareware', text: t, value: null, cueKey: `scare:${hashString(t)}` });
      continue;
    }
    if (APP_GATE.test(t)) {
      push(el, { kind: 'gate', text: t, value: null, cueKey: `gate:app:${hashString(label)}`, gateType: 'app_install' });
      continue;
    }
    if (MEMBER_GATE.test(t)) {
      push(el, { kind: 'gate', text: t, value: null, cueKey: `gate:member:${hashString(label)}`, gateType: 'membership' });
    }
  }

  // Text addressed to AI shopping agents, often inside longer descriptions, so it is read sentence by sentence.
  for (const el of (root as Document | Element).querySelectorAll('p, li, span, div, section')) {
    if (el.closest('[data-faircart-ui], script, style') || !isVisible(el)) continue;
    if ([...el.children].some((c) => /^(P|LI|DIV|SECTION)$/.test(c.tagName))) continue;
    const t = cleanText(el.textContent);
    if (t.length < 20 || t.length > 800) continue;
    const sentence = t.split(/(?<=[.!?])\s+/).find((x) => AGENT_ADDRESS.test(x) && AGENT_ORDER.test(x));
    if (!sentence) continue;
    const from = t.indexOf(sentence);
    const text = t.slice(from, from + 240);
    push(el, { kind: 'agent_directive', text, value: null, cueKey: `agent:${hashString(text.slice(0, 80).toLowerCase())}` });
  }

  // Modal prompts: visible dialogs about passes, memberships, notifications or apps.
  for (const dlg of (root as Document | Element).querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')) {
    if (dlg.closest('[data-faircart-ui]') || !isVisible(dlg)) continue;
    const t = cleanText(dlg.textContent).slice(0, 160);
    if (!t || !PROMPT_WORDS.test(t)) continue;
    const promptId = `prompt:${hashString(t.slice(0, 60).toLowerCase())}`;
    push(dlg, { kind: 'prompt', text: t.slice(0, 120), value: null, cueKey: promptId, promptId });
  }
  // Report in page order.
  const pos = (c: CueFact) => (c.elRef ? refs.get(c.elRef) : undefined);
  cues.sort((a, b) => {
    const ea = pos(a);
    const eb = pos(b);
    if (!ea || !eb) return 0;
    return ea.compareDocumentPosition(eb) & 4 /* FOLLOWING */ ? -1 : 1;
  });
  return cues.map((c, i) => ({ ...c, id: `cue-${i + 1}` }));
}

/** Close/dismiss buttons inside a prompt, so the tap ledger can record a dismissal. */
export function dismissControlFor(target: Element): { promptId: string } | null {
  const dlg = target.closest('[role="dialog"], [aria-modal="true"], dialog[open]');
  if (!dlg) return null;
  const btn = target.closest('button, a, [role="button"]');
  if (!btn) return null;
  const label = cleanText(`${btn.textContent} ${btn.getAttribute('aria-label') ?? ''}`).toLowerCase();
  if (!/(close|dismiss|no thanks|not now|skip|later|maybe later|cancel|×|✕)/.test(label) && label.length > 0) return null;
  const t = cleanText(dlg.textContent).slice(0, 160);
  return { promptId: `prompt:${hashString(t.slice(0, 60).toLowerCase())}` };
}
