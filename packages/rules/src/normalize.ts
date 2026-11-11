import defaults from '../../../schemas/defaults.json' with { type: 'json' };
import { isObject, type Json, type JsonObject } from './json';

/**
 * Applies schemas/defaults.json the same way Normalize.kt does. The TS engine
 * itself uses zod; this exists so a test can prove the shared defaults file and
 * zod agree, which keeps the Kotlin engine's input identical.
 */

type TypeName = Exclude<keyof typeof defaults, '$comment'>;

function withDefaults(obj: JsonObject, type: TypeName): JsonObject {
  const out: JsonObject = { ...obj };
  for (const [k, v] of Object.entries(defaults[type] as JsonObject)) {
    if (!(k in out)) out[k] = structuredClone(v) as Json;
  }
  return out;
}

const mapObjects = (v: Json | undefined, f: (o: JsonObject) => JsonObject): Json[] =>
  (Array.isArray(v) ? v : []).map((x) => (isObject(x) ? f(x) : x));

function style(v: Json | undefined): Json | undefined {
  return isObject(v) ? withDefaults(v, 'Style') : v;
}

export function normalizeSnapshot(raw: JsonObject): JsonObject {
  const s = withDefaults(raw, 'ScreenSnapshot');
  if (isObject(s.product)) s.product = withDefaults(s.product, 'Product');
  if (isObject(s.membership)) s.membership = withDefaults(s.membership, 'Membership');
  s.fees = mapObjects(s.fees, (o) => withDefaults(o, 'FeeFact'));
  s.lineItems = mapObjects(s.lineItems, (o) => withDefaults(o, 'LineItem'));
  s.controls = mapObjects(s.controls, (o) => {
    const c = withDefaults(o, 'ControlFact');
    if ('style' in c) c.style = style(c.style) ?? null;
    return c;
  });
  s.cues = mapObjects(s.cues, (o) => withDefaults(o, 'CueFact'));
  s.cards = mapObjects(s.cards, (o) => {
    const c = withDefaults(o, 'ListingCard');
    if ('sponsoredLabelStyle' in c) c.sponsoredLabelStyle = style(c.sponsoredLabelStyle) ?? null;
    if ('cardTextStyle' in c) c.cardTextStyle = style(c.cardTextStyle) ?? null;
    return c;
  });
  return s;
}

export function normalizeContext(raw: JsonObject): JsonObject {
  const ctx = withDefaults(raw, 'EvaluationContext');
  if (isObject(ctx.snapshot)) ctx.snapshot = normalizeSnapshot(ctx.snapshot);
  ctx.journey = mapObjects(ctx.journey, normalizeSnapshot);
  return ctx;
}
