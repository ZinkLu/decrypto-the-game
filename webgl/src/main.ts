import './style.css';
import { Net } from './net';
import { Store } from './store';
import { NullStage, Stage, type StageAPI } from './scene';
import { App } from './ui/app';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const net = new Net((type, data) => store.handle(type, data));
const store = new Store(net);

// WebGL may be unavailable (old GPUs, headless environments) — degrade to a
// no-op stage so the UI remains fully usable.
let stage: StageAPI;
try {
  stage = new Stage(canvas);
} catch (err) {
  console.warn('WebGL unavailable, falling back to 2D-only UI:', err);
  stage = new NullStage();
}

stage.start();
new App(store, stage, uiRoot);
net.connect();
