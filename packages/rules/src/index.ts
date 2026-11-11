import { RulePack } from '@faircart/schemas';
import coreV1 from '../../../rulepacks/core.v1.json' with { type: 'json' };
import { compilePack } from './engine';

export { evaluate, compilePack, type CompiledPack } from './engine';
export { derive } from './derive';
export { fnv1a64 } from './fnv';
export { render, formatValue, formatNumber } from './template';

/** The rule pack bundled with every client; remote packs replace it after a hash check. */
export const CORE_PACK = RulePack.parse(coreV1);
export const CORE = compilePack(CORE_PACK);
