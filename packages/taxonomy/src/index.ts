import { CATEGORIES, type Category, type CategoryId } from './categories';
import { SUB_PATTERNS, type SubPattern } from './subpatterns';
import { SOURCES, type ResearchSource } from './sources';

export * from './categories';
export * from './subpatterns';
export * from './sources';

export const TAXONOMY_VERSION = '2026.10.1';

const categoryById = new Map(CATEGORIES.map((c) => [c.id, c]));
const subPatternById = new Map(SUB_PATTERNS.map((s) => [s.id as string, s]));
const sourceById = new Map(SOURCES.map((s) => [s.id, s]));

export function getCategory(id: string): Category | undefined {
  return categoryById.get(id as CategoryId);
}
export function getSubPattern(id: string): SubPattern | undefined {
  return subPatternById.get(id);
}
export function getSource(id: string): ResearchSource | undefined {
  return sourceById.get(id);
}

/** Serialisable bundle served by the API at /v1/taxonomy and bundled into clients. */
export function taxonomyBundle() {
  return {
    version: TAXONOMY_VERSION,
    categories: CATEGORIES,
    subPatterns: SUB_PATTERNS,
    sources: SOURCES,
  };
}
