import type { ISelectionHandler, SelectionContext } from '../types';
import type { SelectionManager } from '../../managers/SelectionManager';
import { EventEmitter } from '../../EventEmitter';

/**
 * SelectionHandler: 블록 선택 로직을 처리
 * - SelectionManager와의 인터페이스 역할
 * - 이벤트 기반 선택 동작을 관리
 */
export class SelectionHandler extends EventEmitter implements ISelectionHandler {
  constructor(private selectionManager: SelectionManager) {
    super();
    
    // SelectionManager 이벤트를 중계
    this.selectionManager.on('selection:changed', (event) => {
      this.emit('selection:changed', event);
    });

    this.selectionManager.on('block:selected', (event) => {
      this.emit('block:selected', event);
    });
  }

  selectBlock(context: SelectionContext): void {
    if (context.isToggle) {
      this.selectionManager.toggleSelection(context.blockId);
    } else if (context.isRange && context.fromBlockId) {
      this.selectionManager.selectRange(context.fromBlockId, context.blockId);
    } else {
      this.selectionManager.selectSingle(context.blockId);
    }
  }

  clearSelection(): void {
    this.selectionManager.clearSelection();
  }

  toggleSelection(blockId: string): void {
    this.selectionManager.toggleSelection(blockId);
  }

  selectRange(fromId: string, toId: string): void {
    this.selectionManager.selectRange(fromId, toId);
  }

  selectAll(): void {
    this.selectionManager.selectAll();
  }

  // Additional convenience methods

  getSelectedIds(): string[] {
    return this.selectionManager.getSelectedIds();
  }

  getPrimaryId(): string | null {
    return this.selectionManager.getPrimaryId();
  }

  isSelected(blockId: string): boolean {
    return this.selectionManager.isSelected(blockId);
  }

  getSelectionCount(): number {
    return this.selectionManager.getSelectionCount();
  }

  isMultipleSelection(): boolean {
    return this.selectionManager.isMultipleSelection();
  }
}