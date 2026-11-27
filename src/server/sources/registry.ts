// All ranking sources. To add a source: write a module exporting a `Source` (see types.ts) and list it here.

import type { Source } from './types.js';
import { curatedSource } from './curated.js';
import { f1Source } from './f1.js';
import { worldBankSource } from './worldbank.js';
import { wikidataSource } from './wikidata.js';

export const SOURCES: Source[] = [curatedSource, f1Source, worldBankSource, wikidataSource];
