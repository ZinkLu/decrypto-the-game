// ScreenPainter: owns an offscreen canvas + its CanvasTexture. Views paint
// into the canvas; the texture is redrawn only when something marked dirty.

import * as THREE from 'three';

export type PainterFn = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export class ScreenPainter {
  readonly canvas: HTMLCanvasElement;
  readonly tex: THREE.CanvasTexture;
  private dirty = true;
  private painterFn: PainterFn | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
  }

  /** Swap the paint callback (view switch) and force a repaint. */
  setPainter(fn: PainterFn | null): void {
    this.painterFn = fn;
    this.markDirty();
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Repaint if dirty. Call once per frame from the stage tick. */
  flush(): void {
    if (!this.dirty || !this.painterFn) return;
    this.dirty = false;
    const g = this.canvas.getContext('2d');
    if (!g) return;
    this.painterFn(g, this.width, this.height);
    this.tex.needsUpdate = true;
  }
}
