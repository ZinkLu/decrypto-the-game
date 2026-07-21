// Hidden-input IME capture. Browsers only deliver IME composition to a real
// input element, so a fully transparent 1px input sits at the viewport's
// bottom edge purely as a keyboard/IME device; everything the user sees is
// painted on the CRT canvas (text, caret, live composition string).

export interface ImeTarget {
  /** current field value (called to seed the hidden input) */
  get(): string;
  /** value changed (typing, backspace, IME composition updates) */
  set(v: string): void;
  /** Enter pressed */
  onCommit?(): void;
  /** key handled by the view instead of the field (arrows etc.); return true to consume */
  onKey?(ev: KeyboardEvent): boolean;
  /** field lost its right to keyboard (view switch) */
}

class ImeController {
  private input: HTMLInputElement;
  private target: ImeTarget | null = null;
  /** fired on every keystroke/composition update (drives the 3D keyboard) */
  onType: (() => void) | null = null;

  constructor() {
    this.input = document.createElement('input');
    this.input.id = 'ime-capture';
    this.input.setAttribute('aria-hidden', 'true');
    this.input.autocomplete = 'off';
    Object.assign(this.input.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      width: '2px',
      height: '2px',
      opacity: '0',
      border: 'none',
      padding: '0',
      background: 'transparent',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);
    document.body.append(this.input);

    this.input.addEventListener('input', () => {
      this.onType?.();
      if (this.target) this.target.set(this.input.value);
    });
    this.input.addEventListener('keydown', (ev) => {
      this.onType?.();
      if (!this.target) return;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.target.onCommit?.();
        return;
      }
      if (this.target.onKey?.(ev)) ev.preventDefault();
    });
  }

  attach(t: ImeTarget): void {
    this.target = t;
    this.input.value = t.get();
    // move the caret to the end so Backspace/typing append naturally
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    this.input.focus();
  }

  /** re-sync the hidden input after the view changed the value itself */
  sync(): void {
    if (this.target && this.input.value !== this.target.get()) {
      this.input.value = this.target.get();
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }
  }

  detach(): void {
    this.target = null;
    this.input.blur();
  }

  get active(): boolean {
    return this.target !== null;
  }
}

export const ime = new ImeController();
