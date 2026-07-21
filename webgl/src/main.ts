import './style.css';
import { Net } from './net';
import { Store } from './store';
import { NullStage, Stage } from './scene';
import { Shell } from './ui3d/shell';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const net = new Net((type, data) => store.handle(type, data));
const store = new Store(net);

// The whole UI lives in the three.js scene (canvas textures on the CRTs,
// raycast picking). When WebGL is unavailable (old GPUs, headless
// environments) we degrade to the legacy DOM overlay so the game stays
// playable.
try {
  const stage = new Stage(canvas);
  stage.start();
  new Shell(store, stage);
} catch (err) {
  console.warn('WebGL unavailable, falling back to 2D DOM UI:', err);
  const { App } = await import('./ui/app');
  new App(store, new NullStage(), uiRoot);
}

net.connect();
