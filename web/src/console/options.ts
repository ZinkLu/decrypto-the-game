import { initialLocal, instrumentOptions, wordDisplayOptions } from './model';
import { qualityChoices } from './quality';
import { consoleRoute } from './view';

// What the address asks of this visit. Only the route counts in production;
// everything else selects a fixture or a bench on the development server.
const params = new URLSearchParams(location.search);
const dev = import.meta.env.DEV;

export const route = consoleRoute(location.pathname, location.search, dev);
export const inspection = route.view === 'preview';
/** The fixture shown instead of a live game, if any. */
export const preview = route.scenario;
export const instrumentPreview = dev && params.has('instruments');
// DEV bench for the keyword windows' hardware: `/?words=led` or `crt`.
export const wordBench = dev && !instrumentPreview && params.has('words');
export const initialWordDisplay = wordBench ? wordDisplayOptions.find(option => option.id === params.get('words'))?.id || 'led' : initialLocal.wordDisplay;
export const initialInstrument = instrumentPreview ? instrumentOptions.find(option => option.id === params.get('instruments'))?.id || 'signal' : initialLocal.instrumentVariant;
export const detail = dev ? params.get('detail') : null;
export const scoreBench = dev && params.get('score') === 'flags';
// Deterministic stills and benchmarks pin a level without touching the saved choice.
export const pinnedQuality = dev ? qualityChoices.find(choice => choice === params.get('quality')) : undefined;
// DEV stills pin the round briefing: `?brief=hold` keeps it up, `?brief=off` skips it.
export const briefMode = dev ? params.get('brief') : null;
/** A bench or a close-up keeps the 3D machine, however narrow the window. */
export const keepsMachine = inspection || instrumentPreview || wordBench || !!detail;

/** Narrow windows replace the machine with the portable terminal. */
export const portable = () => matchMedia('(max-width: 850px)').matches;

/** Writes a bench's choice back to the address, so the view can be passed on as a link. */
export function remember(change: (params: URLSearchParams) => void) {
    const url = new URL(location.href);
    change(url.searchParams);
    history.replaceState(null, '', url);
}
