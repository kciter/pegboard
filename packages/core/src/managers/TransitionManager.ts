import type { Block } from '../Block';
import type { GridPosition, GridSize } from '../types';
import { EventEmitter } from '../EventEmitter';

/**
 * 블록의 변경 유형들
 */
export interface BlockMove {
  type: 'move';
  block: Block;
  from: GridPosition;
  to: GridPosition;
}

export interface BlockResize {
  type: 'resize';
  block: Block;
  fromPos: GridPosition;
  toPos: GridPosition;
  fromSize: GridSize;
  toSize: GridSize;
}

export interface BlockAdd {
  type: 'add';
  block: Block;
  position: GridPosition;
  size: GridSize;
}

export interface BlockRemove {
  type: 'remove';
  block: Block;
  position: GridPosition;
  size: GridSize;
}

/**
 * 모든 변경 유형의 Union Type
 */
export type BlockChange = BlockMove | BlockResize | BlockAdd | BlockRemove;

/**
 * 변경사항 집합
 */
export interface ChangeSet {
  changes: BlockChange[];
  container: HTMLElement;
}

/**
 * 전환 전략 타입
 */
export type TransitionStrategy = 'flip' | 'none' | 'slide' | 'fade';

/**
 * 전환 완료 후 콜백
 */
export type TransitionCallback = () => void;

/**
 * FLIP 애니메이션 설정
 */
export interface FLIPConfig {
  duration: number;
  easing: string;
  useTransform: boolean;
}

/**
 * Transitioner 인터페이스
 */
export interface ITransitioner {
  apply(
    changeSet: ChangeSet,
    strategy: TransitionStrategy,
    onComplete?: TransitionCallback
  ): Promise<void>;
  rollback(
    blocks: Block[], 
    originalStates: Array<{ position: GridPosition; size: GridSize }>,
    strategy?: TransitionStrategy,
    onComplete?: TransitionCallback
  ): Promise<void>;
  cancel(): void;
  isTransitioning(): boolean;
}

/**
 * FLIP 트랜지션 구현체
 */
export class FLIPTransitioner implements ITransitioner {
  private isRunning = false;
  private currentAnimations = new Set<string>();
  private abortController: AbortController | null = null;

  constructor(private config: FLIPConfig = {
    duration: 220,
    easing: 'transform 160ms ease',
    useTransform: true,
  }) {}

  async apply(
    changeSet: ChangeSet,
    strategy: TransitionStrategy,
    onComplete?: TransitionCallback
  ): Promise<void> {
    // 진행 중인 애니메이션이 있으면 취소
    this.cancel();

    if (strategy === 'none') {
      this.applyDirect(changeSet);
      onComplete?.();
      return;
    }

    if (strategy === 'flip') {
      await this.applyFLIP(changeSet, onComplete);
      return;
    }

    // 다른 전략들은 향후 구현
    throw new Error(`Unsupported transition strategy: ${strategy}`);
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
    
    // 진행 중인 애니메이션 정리
    for (const blockId of this.currentAnimations) {
      const elements = document.querySelectorAll(`[data-block-id="${blockId}"]`);
      elements.forEach(el => {
        (el as HTMLElement).style.transition = '';
        (el as HTMLElement).style.transform = '';
      });
    }
    
    this.currentAnimations.clear();
    this.isRunning = false;
  }

  isTransitioning(): boolean {
    return this.isRunning;
  }

  async rollback(
    blocks: Block[],
    originalStates: Array<{ position: GridPosition; size: GridSize }>,
    strategy: TransitionStrategy = 'flip',
    onComplete?: TransitionCallback
  ): Promise<void> {
    // 진행 중인 애니메이션이 있으면 취소
    this.cancel();

    if (strategy === 'none') {
      this.applyRollbackDirect(blocks, originalStates);
      onComplete?.();
      return;
    }

    if (strategy === 'flip') {
      await this.applyRollbackFLIP(blocks, originalStates, onComplete);
      return;
    }

    // 다른 전략들은 향후 구현
    throw new Error(`Unsupported rollback strategy: ${strategy}`);
  }

  private applyDirect(changeSet: ChangeSet): void {
    for (const change of changeSet.changes) {
      this.applyChangeDirectly(change);
    }
  }

  private async applyFLIP(changeSet: ChangeSet, onComplete?: TransitionCallback): Promise<void> {
    this.isRunning = true;
    this.abortController = new AbortController();
    
    try {
      // 변경사항을 타입별로 분류
      const moveChanges = changeSet.changes.filter(c => c.type === 'move') as BlockMove[];
      const resizeChanges = changeSet.changes.filter(c => c.type === 'resize') as BlockResize[];
      const addChanges = changeSet.changes.filter(c => c.type === 'add') as BlockAdd[];
      const removeChanges = changeSet.changes.filter(c => c.type === 'remove') as BlockRemove[];

      // 복합 변경 (이동 + 크기 변경)이 있는지 확인
      const hasComplexChanges = resizeChanges.length > 0;
      
      if (hasComplexChanges) {
        await this.applyComplexFLIP(moveChanges, resizeChanges, changeSet.container);
      } else if (moveChanges.length > 0) {
        await this.applySimpleFLIP(moveChanges, changeSet.container);
      }

      // Add/Remove는 다른 방식으로 처리
      if (addChanges.length > 0) {
        await this.applyAdditions(addChanges);
      }
      if (removeChanges.length > 0) {
        await this.applyRemovals(removeChanges);
      }

      onComplete?.();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('FLIP animation error:', error);
      this.applyDirect(changeSet);
      onComplete?.();
    } finally {
      this.isRunning = false;
      this.abortController = null;
      this.currentAnimations.clear();
    }
  }

  private async applySimpleFLIP(moves: BlockMove[], container: HTMLElement): Promise<void> {
    if (moves.length === 0) return;

    // 1. First - 현재 드래그된 위치 기록 (transform 적용된 상태)
    const firstRects = new Map<string, DOMRect>();
    for (const move of moves) {
      const el = move.block.getElement();
      // 드래그 상태 정리하지 않고 현재 위치 기록 (transform이 적용된 실제 위치)
      firstRects.set(move.block.getData().id, el.getBoundingClientRect());
      this.currentAnimations.add(move.block.getData().id);
    }

    // 2. 실제 변경 적용 및 드래그 상태 정리
    for (const move of moves) {
      const el = move.block.getElement();
      // 드래그 상태 정리
      el.classList.remove('pegboard-block-dragging');
      el.style.transform = '';
      el.style.zIndex = '';
      // 최종 위치로 이동
      move.block.setPosition(move.to);
    }

    // 3. Last - 변경 후 위치 기록
    const lastRects = new Map<string, DOMRect>();
    for (const move of moves) {
      const el = move.block.getElement();
      el.style.transition = 'none';
      lastRects.set(move.block.getData().id, el.getBoundingClientRect());
    }

    // 4. Invert - 역변환 적용
    for (const move of moves) {
      const id = move.block.getData().id;
      const el = move.block.getElement();
      const first = firstRects.get(id);
      const last = lastRects.get(id);
      
      if (first && last) {
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    }

    // 5. Play - 애니메이션 실행
    await this.playAnimation(moves.map(m => m.block.getElement()), container);
  }

  private async applyComplexFLIP(
    moves: BlockMove[], 
    resizes: BlockResize[], 
    container: HTMLElement
  ): Promise<void> {
    // 모든 변경사항을 블록별로 집계
    const changeMap = new Map<string, { 
      block: Block, 
      toPos?: GridPosition, 
      toSize?: GridSize 
    }>();

    for (const move of moves) {
      const id = move.block.getData().id;
      const entry = changeMap.get(id) || { block: move.block };
      entry.toPos = move.to;
      changeMap.set(id, entry);
    }

    for (const resize of resizes) {
      const id = resize.block.getData().id;
      const entry = changeMap.get(id) || { block: resize.block };
      entry.toPos = resize.toPos;
      entry.toSize = resize.toSize;
      changeMap.set(id, entry);
    }

    const items = Array.from(changeMap.values());
    if (items.length === 0) return;

    // 1. First - 변경 전 상태 기록
    const firstRects = new Map<string, DOMRect>();
    for (const item of items) {
      const el = item.block.getElement();
      el.classList.remove('pegboard-block-dragging');
      firstRects.set(item.block.getData().id, el.getBoundingClientRect());
      this.currentAnimations.add(item.block.getData().id);
    }

    // 2. 실제 변경 적용
    for (const item of items) {
      if (item.toPos) item.block.setPosition(item.toPos);
      if (item.toSize) item.block.setSize(item.toSize);
    }

    // 3. Last - 변경 후 상태 기록
    const lastRects = new Map<string, DOMRect>();
    for (const item of items) {
      const el = item.block.getElement();
      el.style.transition = 'none';
      el.style.transform = '';
      lastRects.set(item.block.getData().id, el.getBoundingClientRect());
    }

    // 4. Invert - 역변환 적용 (translate + scale)
    for (const item of items) {
      const id = item.block.getData().id;
      const el = item.block.getElement();
      const first = firstRects.get(id);
      const last = lastRects.get(id);
      
      if (first && last) {
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        const sx = last.width !== 0 ? first.width / last.width : 1;
        const sy = last.height !== 0 ? first.height / last.height : 1;
        
        el.style.transformOrigin = 'top left';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      }
    }

    // 5. Play - 애니메이션 실행
    await this.playAnimation(items.map(item => item.block.getElement()), container);
  }

  private async applyAdditions(additions: BlockAdd[]): Promise<void> {
    // 향후 구현: 페이드 인 효과
    for (const addition of additions) {
      this.applyChangeDirectly(addition);
    }
  }

  private async applyRemovals(removals: BlockRemove[]): Promise<void> {
    // 향후 구현: 페이드 아웃 효과
    for (const removal of removals) {
      this.applyChangeDirectly(removal);
    }
  }

  private async playAnimation(elements: HTMLElement[], container: HTMLElement): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.abortController?.signal.aborted) {
        reject(new Error('Animation was cancelled'));
        return;
      }

      // Force reflow
      container.offsetHeight;
      
      requestAnimationFrame(() => {
        if (this.abortController?.signal.aborted) {
          reject(new Error('Animation was cancelled'));
          return;
        }

        for (const el of elements) {
          el.style.transition = this.config.easing;
          el.style.transform = '';
        }

        // 애니메이션 완료 대기
        setTimeout(() => {
          for (const el of elements) {
            if (!el.classList.contains('pegboard-block-dragging')) {
              el.style.transition = '';
            }
          }
          resolve();
        }, this.config.duration);
      });
    });
  }

  private applyChangeDirectly(change: BlockChange): void {
    switch (change.type) {
      case 'move':
        change.block.setPosition(change.to);
        break;
      case 'resize':
        change.block.setPosition(change.toPos);
        change.block.setSize(change.toSize);
        break;
      case 'add':
        change.block.setPosition(change.position);
        change.block.setSize(change.size);
        break;
      case 'remove':
        // 블록 제거는 상위에서 처리
        break;
    }
  }

  /**
   * 즉시 롤백 (애니메이션 없음)
   */
  private applyRollbackDirect(blocks: Block[], originalStates: Array<{ position: GridPosition; size: GridSize }>): void {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const originalState = originalStates[i];
      if (block && originalState) {
        block.setPosition(originalState.position);
        block.setSize(originalState.size);
      }
    }
  }

  /**
   * FLIP 애니메이션으로 롤백
   */
  private async applyRollbackFLIP(
    blocks: Block[], 
    originalStates: Array<{ position: GridPosition; size: GridSize }>,
    onComplete?: TransitionCallback
  ): Promise<void> {
    this.isRunning = true;
    this.abortController = new AbortController();

    try {
      // 1. First - 현재 위치/크기 기록
      const firstRects = new Map<string, DOMRect>();
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block) continue;
        
        const el = block.getElement();
        el.classList.remove('pegboard-block-dragging', 'pegboard-block-resizing');
        firstRects.set(block.getData().id, el.getBoundingClientRect());
        this.currentAnimations.add(block.getData().id);
      }

      // 2. 원래 상태로 복원 (실제 변경)
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const originalState = originalStates[i];
        if (block && originalState) {
          block.setPosition(originalState.position);
          block.setSize(originalState.size);
        }
      }

      // 3. Last - 복원 후 위치/크기 기록
      const lastRects = new Map<string, DOMRect>();
      for (const block of blocks) {
        if (!block) continue;
        
        const el = block.getElement();
        el.style.transition = 'none';
        el.style.transform = '';
        lastRects.set(block.getData().id, el.getBoundingClientRect());
      }

      // 4. Invert - 역변환 적용
      for (const block of blocks) {
        if (!block) continue;
        
        const id = block.getData().id;
        const el = block.getElement();
        const first = firstRects.get(id);
        const last = lastRects.get(id);
        
        if (first && last) {
          const dx = first.left - last.left;
          const dy = first.top - last.top;
          const sx = last.width !== 0 ? first.width / last.width : 1;
          const sy = last.height !== 0 ? first.height / last.height : 1;
          
          el.style.transformOrigin = 'top left';
          el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        }
      }

      // 5. Play - 애니메이션 실행
      await this.playRollbackAnimation(blocks.map(b => b?.getElement()).filter(Boolean) as HTMLElement[]);

      onComplete?.();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // 정상적인 취소
        return;
      }
      console.error('Rollback FLIP animation error:', error);
      // 에러 발생 시 직접 적용
      this.applyRollbackDirect(blocks, originalStates);
      onComplete?.();
    } finally {
      this.isRunning = false;
      this.abortController = null;
      this.currentAnimations.clear();
    }
  }

  /**
   * 롤백 애니메이션 실행
   */
  private async playRollbackAnimation(elements: HTMLElement[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.abortController?.signal.aborted) {
        reject(new Error('Animation was cancelled'));
        return;
      }

      // Force reflow
      if (elements[0]) {
        elements[0].offsetHeight;
      }
      
      requestAnimationFrame(() => {
        if (this.abortController?.signal.aborted) {
          reject(new Error('Animation was cancelled'));
          return;
        }

        for (const el of elements) {
          el.style.transition = this.config.easing;
          el.style.transform = '';
        }

        // 애니메이션 완료 대기
        setTimeout(() => {
          for (const el of elements) {
            el.style.transition = '';
          }
          resolve();
        }, this.config.duration);
      });
    });
  }
}

/**
 * TransitionManager: 블록 상태 변경 시 트랜지션을 관리
 */
export class TransitionManager extends EventEmitter {
  private transitioner: ITransitioner;

  constructor(
    private container: HTMLElement,
    config?: Partial<FLIPConfig>
  ) {
    super();
    this.transitioner = new FLIPTransitioner({
      duration: 220,
      easing: 'transform 160ms ease',
      useTransform: true,
      ...config
    });
  }

  /**
   * 블록 변경사항을 트랜지션과 함께 적용
   */
  async applyChanges(
    changes: BlockChange[], 
    strategy: TransitionStrategy = 'flip'
  ): Promise<void> {
    const changeSet: ChangeSet = {
      changes,
      container: this.container
    };

    (this as any).emit('transition:start', { changes, strategy });

    try {
      await this.transitioner.apply(changeSet, strategy, () => {
        (this as any).emit('transition:complete', { changes, strategy });
      });
    } catch (error) {
      (this as any).emit('transition:error', { changes, strategy, error });
      throw error;
    }
  }

  /**
   * 단일 블록 이동
   */
  async moveBlock(block: Block, from: GridPosition, to: GridPosition): Promise<void> {
    const change: BlockMove = { type: 'move', block, from, to };
    await this.applyChanges([change]);
  }

  /**
   * 단일 블록 리사이즈
   */
  async resizeBlock(
    block: Block, 
    fromPos: GridPosition, 
    toPos: GridPosition,
    fromSize: GridSize, 
    toSize: GridSize
  ): Promise<void> {
    const change: BlockResize = { 
      type: 'resize', 
      block, 
      fromPos, 
      toPos, 
      fromSize, 
      toSize 
    };
    await this.applyChanges([change]);
  }

  /**
   * 여러 블록 일괄 이동
   */
  async moveBlocks(moves: { block: Block; from: GridPosition; to: GridPosition }[]): Promise<void> {
    const changes: BlockMove[] = moves.map(({ block, from, to }) => ({
      type: 'move',
      block,
      from,
      to
    }));
    await this.applyChanges(changes);
  }

  /**
   * 블록들을 원래 상태로 롤백
   */
  async rollback(
    blocks: Block[], 
    originalStates: Array<{ position: GridPosition; size: GridSize }>,
    strategy: TransitionStrategy = 'flip'
  ): Promise<void> {
    (this as any).emit('rollback:start', { blocks, strategy });

    try {
      await this.transitioner.rollback(blocks, originalStates, strategy, () => {
        (this as any).emit('rollback:complete', { blocks, strategy });
      });
    } catch (error) {
      (this as any).emit('rollback:error', { blocks, strategy, error });
      throw error;
    }
  }

  /**
   * 진행 중인 트랜지션 취소
   */
  cancel(): void {
    this.transitioner.cancel();
    (this as any).emit('transition:cancelled');
  }

  /**
   * 현재 트랜지션 중인지 여부
   */
  isTransitioning(): boolean {
    return this.transitioner.isTransitioning();
  }

  /**
   * Transitioner 교체
   */
  setTransitioner(transitioner: ITransitioner): void {
    this.cancel();
    this.transitioner = transitioner;
  }

  /**
   * 정리
   */
  destroy(): void {
    this.cancel();
    this.removeAllListeners();
  }
}