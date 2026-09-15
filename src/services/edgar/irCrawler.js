/**
 * @fileoverview Detección y rastreo de presentaciones corporativas en sitios de Investor Relations (IR) y APIs de Q4.
 * @module services/edgar/irCrawler
 */

import { CHROME_NO_SANDBOX } from './irCrawlerFetch.js';
export { isDeckDocument, stripHtmlTags, extractQuarterKeys, cleanDeckName, fetchIrPage, probeIrSiteAlive, parseIrDocumentLinks, getIrQuarterlyLinks, getQ4EventDeckMap } from './irCrawlerFetch.js';
export { getCompanyIrDeckMap, getIrDeckForFiling } from './irCrawlerDeck.js';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertPublicUrl } from '../../utils/ssrfGuard.js';

// El sandbox de Chrome queda activo por defecto (más seguro al renderizar HTML
// de terceros). En servidores donde no funcione, definir CHROME_NO_SANDBOX=1.

