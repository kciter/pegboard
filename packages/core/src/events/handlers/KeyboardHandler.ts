import type { IKeyboardHandler, KeyboardEvent } from '../types';
import type { SelectionHandler } from './SelectionHandler';
import type { BlockManager } from '../../managers/BlockManager';
import { EventEmitter } from '../../EventEmitter';

/**
 * KeyboardHandler: 키보드 상호작용을 처리
 * - 방향키 기반 블록 이동
 * - Delete/Backspace 기반 블록 삭제
 * - 선택 관련 단축키 (Ctrl+A 등)
 */
export class KeyboardHandler extends EventEmitter implements IKeyboardHandler {
  constructor(
    private selectionHandler: SelectionHandler,
    private blockManager: BlockManager,
    private getConfiguration: () => {
      keyboardMove: boolean;
      keyboardDelete: boolean;
    }
  ) {
    super();
  }

  onKeyDown(event: KeyboardEvent): boolean {
    // Lasso selection 중 Shift 키 처리는 LassoHandler에서 담당
    if (event.key === 'Shift') {
      return false; // 다른 핸들러가 처리하도록 허용
    }

    // Delete/Backspace 처리
    if (event.key === 'Delete' || event.key === 'Backspace') {
      return this.handleDeleteKey(event);
    }

    // Ctrl+A (전체 선택)
    if ((event.modifiers.ctrl || event.modifiers.meta) && event.key === 'a') {
      return this.handleSelectAll(event);
    }

    // 방향키 처리
    if (this.isArrowKey(event.key)) {
      return this.handleArrowKey(event);
    }

    // Tab 키 처리 (다음/이전 블록 선택)
    if (event.key === 'Tab') {
      return this.handleTabKey(event);
    }

    // Escape 키 처리 (선택 해제)
    if (event.key === 'Escape') {
      return this.handleEscapeKey(event);
    }

    return false;
  }

  onKeyUp(event: KeyboardEvent): boolean {
    // 현재는 KeyUp에서 특별한 처리 없음
    // 필요시 Shift 키 해제 등을 처리할 수 있음
    return false;
  }

  // Private handlers

  private handleDeleteKey(event: KeyboardEvent): boolean {
    const config = this.getConfiguration();
    if (!config.keyboardDelete) return false;

    const selectedIds = this.selectionHandler.getSelectedIds();
    if (selectedIds.length === 0) return false;

    // 선택된 블록들 삭제
    for (const blockId of selectedIds) {
      this.blockManager.removeBlock(blockId);
    }

    // 선택 상태 해제
    this.selectionHandler.clearSelection();

    (this as any).emit('blocks:deleted', { blockIds: selectedIds });
    return true;
  }

  private handleSelectAll(event: KeyboardEvent): boolean {
    this.selectionHandler.selectAll();
    (this as any).emit('selection:all');
    return true;
  }

  private handleArrowKey(event: KeyboardEvent): boolean {
    const config = this.getConfiguration();
    if (!config.keyboardMove) return false;

    const selectedIds = this.selectionHandler.getSelectedIds();
    if (selectedIds.length === 0) return false;

    const delta = this.getMovementDelta(event.key);
    if (!delta) return false;

    // 선택된 모든 블록을 이동
    for (const blockId of selectedIds) {
      const block = this.blockManager.getBlock(blockId);
      if (!block) continue;

      const newPosition = {
        x: Math.max(0, block.position.x + delta.dcol),
        y: Math.max(0, block.position.y + delta.drow),
        zIndex: block.position.zIndex,
      };

      this.blockManager.moveBlock(blockId, newPosition);
    }

    (this as any).emit('blocks:moved', { 
      blockIds: selectedIds, 
      delta 
    });
    return true;
  }

  private handleTabKey(event: KeyboardEvent): boolean {
    if (event.modifiers.shift) {
      // Shift+Tab: 이전 블록 선택
      this.selectionHandler.selectPrevious?.();
    } else {
      // Tab: 다음 블록 선택
      this.selectionHandler.selectNext?.();
    }
    
    (this as any).emit('selection:navigate', { 
      direction: event.modifiers.shift ? 'previous' : 'next' 
    });
    return true;
  }

  private handleEscapeKey(event: KeyboardEvent): boolean {
    const hadSelection = this.selectionHandler.getSelectionCount() > 0;
    this.selectionHandler.clearSelection();
    
    if (hadSelection) {
      (this as any).emit('selection:cleared');
      return true;
    }
    
    return false;
  }

  // Utility methods

  private isArrowKey(key: string): boolean {
    return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key);
  }

  private getMovementDelta(key: string): { dcol: number; drow: number } | null {
    switch (key) {
      case 'ArrowLeft':
        return { dcol: -1, drow: 0 };
      case 'ArrowRight':
        return { dcol: 1, drow: 0 };
      case 'ArrowUp':
        return { dcol: 0, drow: -1 };
      case 'ArrowDown':
        return { dcol: 0, drow: 1 };
      default:
        return null;
    }
  }
}

// Extend SelectionHandler interface to include navigation methods
declare module './SelectionHandler' {
  interface SelectionHandler {
    selectNext?(): boolean;
    selectPrevious?(): boolean;
  }
}