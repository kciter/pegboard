import type { GridPosition, GridSize } from '../../types';
import type { IPreviewStrategy } from './types';

/**
 * Default DOM-based preview that reuses DragManager's hint overlay style.
 */
export class DomHintPreview implements IPreviewStrategy {
  private hintEl: HTMLElement | null = null;
  constructor(private container: HTMLElement) {}

  showHint(pos: GridPosition, size: GridSize, valid: boolean): void {
    if (!this.hintEl) {
      this.hintEl = document.createElement('div');
      this.hintEl.className = 'pegboard-hint-overlay';
      this.hintEl.setAttribute('aria-hidden', 'true');
      this.container.appendChild(this.hintEl);
    }
    this.hintEl.style.gridColumn = `${pos.x} / span ${size.width}`;
    this.hintEl.style.gridRow = `${pos.y} / span ${size.height}`;
    this.hintEl.classList.toggle('invalid', !valid);
  }

  clearHint(): void {
    if (this.hintEl) {
      this.hintEl.remove();
      this.hintEl = null;
    }
  }
}
