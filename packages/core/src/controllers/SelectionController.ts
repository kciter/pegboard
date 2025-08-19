import type { Block } from '../Block';

export class SelectionController {
  private selection: Set<string> = new Set();
  private selectedBlock: Block | null = null;

  getSelectedIds(): string[] {
    return Array.from(this.selection);
  }
  getSelectedBlock(): Block | null {
    return this.selectedBlock;
  }
  clear(): void {
    this.selection.clear();
    this.selectedBlock = null;
  }
  set(ids: string[], anchor?: Block | null) {
    this.selection = new Set(ids);
    this.selectedBlock = anchor || null;
  }
  toggle(id: string, next: boolean): void {
    if (next) this.selection.add(id);
    else this.selection.delete(id);
  }
}
