import { EventEmitter } from '../EventEmitter';
import { Block } from '../Block';
import { Grid } from '../Grid';
import type { BlockExtension } from '../BlockExtension';
import type { 
  BlockData, 
  GridPosition, 
  GridSize, 
  GridSizeConstraints 
} from '../types';
import { generateId, deepClone } from '../utils';
import { SpatialIndex } from '../utils/SpatialIndex';

type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface BlockOperationResult {
  success: boolean;
  blockId?: string;
  error?: string;
}

export interface BlockValidationResult {
  valid: boolean;
  position?: GridPosition;
  reason?: string;
}

/**
 * BlockManager: 블록의 생명주기를 관리
 * - 블록 생성/삭제/업데이트
 * - 블록 위치/크기 검증
 * - Extension 관리
 * - Z-index 관리
 */
export class BlockManager extends EventEmitter {
  private blocks = new Map<string, Block>();
  private extensions = new Map<string, BlockExtension<any>>();
  private nextZIndex = 1;
  
  // 공간 분할 인덱스 (충돌 검사 최적화)
  private spatialIndex = new SpatialIndex();

  constructor(
    private container: HTMLElement,
    private grid: Grid,
    private getAllowOverlap: () => boolean = () => false
  ) {
    super();
  }

  // 블록 생성
  addBlock<Attrs extends Record<string, any>>(
    data: PartialKeys<BlockData<Attrs>, 'id' | 'attributes'>
  ): BlockOperationResult {
    try {
      const extension = this.extensions.get(data.type);
      if (!extension) {
        return {
          success: false,
          error: `Extension not found for block type: ${data.type}`,
        };
      }

      const existingBlocks = Array.from(this.blocks.values()).map((b) => b.getData());
      const validationResult = this.validateBlockPlacement(
        data.position,
        data.size,
        data.constraints,
        existingBlocks
      );

      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.reason || 'Invalid block placement',
        };
      }

      const blockData: BlockData = {
        id: data.id || generateId(),
        type: data.type || 'default',
        position: validationResult.position || data.position,
        size: this.clampSize(data.size, data.constraints),
        constraints: data.constraints,
        attributes: { ...(extension?.defaultAttributes || {}), ...(data.attributes || {}) },
        movable: data.movable,
        resizable: data.resizable,
      };

      // z-index 할당
      if (blockData.position.zIndex === undefined) {
        blockData.position.zIndex = this.nextZIndex++;
      } else {
        this.nextZIndex = Math.max(this.nextZIndex, blockData.position.zIndex + 1);
      }

      const block = new Block(blockData);
      this.blocks.set(blockData.id, block);
      this.container.appendChild(block.getElement());

      // Edit 모드 지원 설정 (Extension에서 allowEditMode가 true인 경우)
      if (extension.allowEditMode) {
        block.setSupportsEditMode(true);
      }

      // 공간 인덱스에 블록 추가
      this.spatialIndex.addBlock(blockData.id, blockData.position, blockData.size);

      // Extension 라이프사이클 호출
      this.callExtensionLifecycle(extension, block, 'create');

      this.emit('block:added', { block: blockData });
      return {
        success: true,
        blockId: blockData.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // 블록 제거
  removeBlock(id: string): BlockOperationResult {
    const block = this.blocks.get(id);
    if (!block) {
      return {
        success: false,
        error: `Block not found: ${id}`,
      };
    }

    const extension = this.extensions.get(block.getData().type);
    if (extension) {
      extension.onDestroy?.(block.getData() as any);
    }

    block.destroy();
    this.blocks.delete(id);

    // 공간 인덱스에서 블록 제거
    this.spatialIndex.removeBlock(id);

    this.emit('block:removed', { blockId: id });
    return {
      success: true,
      blockId: id,
    };
  }

  // 블록 업데이트
  updateBlock(id: string, updates: Partial<BlockData>): BlockOperationResult {
    const block = this.blocks.get(id);
    if (!block) {
      return {
        success: false,
        error: `Block not found: ${id}`,
      };
    }

    const currentData = block.getData();
    const newData = { ...currentData, ...updates } as BlockData;

    // 위치 업데이트
    if (updates.position) {
      const validationResult = this.validatePosition(
        updates.position,
        currentData.size,
        id
      );
      
      if (validationResult.valid && validationResult.position) {
        block.setPosition(validationResult.position);
      }
    }

    // 크기 업데이트
    if (updates.size) {
      const clampedSize = this.clampSize(updates.size, currentData.constraints);
      const validationResult = this.validatePosition(
        currentData.position,
        clampedSize,
        id
      );

      if (validationResult.valid) {
        block.setSize(clampedSize);
      }
    }

    // 다른 속성들 업데이트
    if (updates.attributes) {
      block.setAttributes(updates.attributes);
      
      // Extension 렌더링 업데이트
      const extension = this.extensions.get(currentData.type);
      if (extension) {
        this.callExtensionLifecycle(extension, block, 'update');
      }
    }

    if (updates.constraints !== undefined) {
      block.setConstraints(updates.constraints as any);
    }

    if (updates.movable !== undefined || updates.resizable !== undefined) {
      block.setInteractionFlags({ 
        movable: updates.movable, 
        resizable: updates.resizable 
      });
    }

    this.emit('block:updated', { block: newData });
    return {
      success: true,
      blockId: id,
    };
  }

  // 블록 조회 (읽기 전용 - 수정 금지!)
  /**
   * 단일 블록 데이터 조회 (읽기 전용)
   * ⚠️ 반환된 객체를 수정하지 마세요! 성능을 위해 원본을 반환합니다.
   */
  getBlock(id: string): Readonly<BlockData> | null {
    const block = this.blocks.get(id);
    return block ? block.getData() : null;
  }

  /**
   * 모든 블록 데이터 조회 (읽기 전용)  
   * ⚠️ 반환된 배열/객체를 수정하지 마세요! 성능을 위해 원본을 반환합니다.
   */
  getAllBlocks(): ReadonlyArray<Readonly<BlockData>> {
    return Array.from(this.blocks.values()).map(block => block.getData());
  }

  /**
   * 수정 가능한 블록 데이터 복사본 조회 (성능 비용 높음 - 필요시에만 사용)
   */
  getBlockCopy(id: string): BlockData | null {
    const block = this.blocks.get(id);
    return block ? deepClone(block.getData()) : null;
  }

  getAllBlocksCopy(): BlockData[] {
    return Array.from(this.blocks.values()).map(block => deepClone(block.getData()));
  }

  getBlockInstance(id: string): Block | null {
    return this.blocks.get(id) || null;
  }

  getAllBlockInstances(): Block[] {
    return Array.from(this.blocks.values());
  }

  // 블록 복제
  duplicateBlock(id: string): BlockOperationResult {
    const sourceBlock = this.getBlock(id);
    if (!sourceBlock) {
      return {
        success: false,
        error: `Block not found: ${id}`,
      };
    }

    const existingBlocks = this.getAllBlocks();
    const availablePosition = this.grid.findAvailablePosition(
      sourceBlock.size,
      existingBlocks
    );

    const duplicateData = {
      ...sourceBlock,
      id: generateId(),
      position: {
        ...availablePosition,
        zIndex: this.nextZIndex++,
      },
    };

    return this.addBlock(duplicateData);
  }

  // 블록 이동
  moveBlock(id: string, position: GridPosition): BlockOperationResult {
    const block = this.blocks.get(id);
    if (!block) {
      return {
        success: false,
        error: `Block not found: ${id}`,
      };
    }

    const validationResult = this.validatePosition(
      position,
      block.getData().size,
      id
    );

    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.reason || 'Invalid position',
      };
    }

    const oldPosition = block.getData().position;
    block.setPosition(validationResult.position!);

    // 공간 인덱스에서 블록 위치 업데이트
    this.spatialIndex.moveBlock(id, validationResult.position!, block.getData().size);

    this.emit('block:moved', { 
      block: block.getData(), 
      oldPosition 
    });

    return {
      success: true,
      blockId: id,
    };
  }

  // 블록 리사이즈
  resizeBlock(id: string, size: GridSize): BlockOperationResult {
    const block = this.blocks.get(id);
    if (!block) {
      return {
        success: false,
        error: `Block not found: ${id}`,
      };
    }

    const blockData = block.getData();
    const clampedSize = this.clampSize(size, blockData.constraints);
    
    const validationResult = this.validatePosition(
      blockData.position,
      clampedSize,
      id
    );

    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.reason || 'Invalid size',
      };
    }

    const oldSize = block.getData().size;
    block.setSize(clampedSize);

    // 공간 인덱스에서 블록 크기 업데이트 (위치 재계산)
    this.spatialIndex.moveBlock(id, blockData.position, clampedSize);

    this.emit('block:resized', { 
      block: block.getData(), 
      oldSize 
    });

    return {
      success: true,
      blockId: id,
    };
  }

  // Z-index 관리
  bringToFront(id: string): BlockOperationResult {
    const block = this.blocks.get(id);
    if (!block) {
      return {
        success: false,
        error: `Block not found: ${id}`,
      };
    }

    const blockData = block.getData();
    block.setPosition({
      ...blockData.position,
      zIndex: this.nextZIndex++,
    });

    this.syncNextZIndex();
    return {
      success: true,
      blockId: id,
    };
  }

  sendToBack(id: string): BlockOperationResult {
    const block = this.blocks.get(id);
    if (!block) {
      return {
        success: false,
        error: `Block not found: ${id}`,
      };
    }

    const blockData = block.getData();
    const minZIndex = Math.min(...this.getAllBlocks().map(b => b.position.zIndex));

    block.setPosition({
      ...blockData.position,
      zIndex: minZIndex - 1,
    });

    this.syncNextZIndex();
    return {
      success: true,
      blockId: id,
    };
  }

  // Extension 관리
  registerExtension(extension: BlockExtension<any>): void {
    this.extensions.set(extension.type, extension);
    
    // 기존 블록들에 edit mode 지원 반영
    if (extension.allowEditMode) {
      for (const block of this.blocks.values()) {
        if (block.getData().type === extension.type) {
          block.setSupportsEditMode(true);
        }
      }
    }
  }

  unregisterExtension(type: string): void {
    this.extensions.delete(type);
  }

  getExtension(type: string): BlockExtension<any> | undefined {
    return this.extensions.get(type);
  }

  // 검증 메서드들
  private validateBlockPlacement(
    position: GridPosition,
    size: GridSize,
    constraints?: GridSizeConstraints,
    existingBlocks: Array<{ id: string; position: GridPosition; size: GridSize }> = []
  ): BlockValidationResult {
    // 크기 제약 검증
    const clampedSize = this.clampSize(size, constraints);
    
    // 최적 위치 찾기
    const finalPosition = this.findNearestAvailablePosition(
      position,
      clampedSize,
      existingBlocks
    );

    if (!finalPosition) {
      return {
        valid: false,
        reason: 'No available position found',
      };
    }

    return {
      valid: true,
      position: finalPosition,
    };
  }

  private validatePosition(
    position: GridPosition,
    size: GridSize,
    excludeId?: string
  ): BlockValidationResult {
    const allowOverlap = this.getAllowOverlap();
    const withinBounds = this.grid.isValidGridPosition(position, size);
    
    // 🚀 성능 최적화: SpatialIndex 사용 (O(n) -> O(1))
    const hasCollision = !allowOverlap && 
      this.spatialIndex.hasCollisionFast(position, size, excludeId);

    if (!withinBounds) {
      return {
        valid: false,
        reason: 'Position is outside grid bounds',
      };
    }

    if (hasCollision) {
      return {
        valid: false,
        reason: 'Position conflicts with existing blocks',
      };
    }

    return {
      valid: true,
      position,
    };
  }

  private findNearestAvailablePosition(
    start: GridPosition,
    size: GridSize,
    existingBlocks: Array<{ id: string; position: GridPosition; size: GridSize }>
  ): GridPosition | null {
    const cfg = this.grid.getConfig();
    const maxRows = cfg.rows && cfg.rows > 0 ? cfg.rows : 100;

    const isFree = (pos: GridPosition) => {
      return (
        this.grid.isValidGridPosition(pos, size) &&
        (!this.getAllowOverlap() ? 
          !this.grid.checkGridCollision(pos, size, '', existingBlocks) : 
          true)
      );
    };

    // 시작점이 비어있으면 바로 반환
    if (isFree(start)) return { ...start };

    // 나선형 탐색
    const maxRadius = (cfg.columns + maxRows) * 2;
    for (let r = 1; r <= maxRadius; r++) {
      // 상하 스캔
      for (let dx = -r; dx <= r; dx++) {
        const top: GridPosition = { x: start.x + dx, y: start.y - r, zIndex: start.zIndex };
        const bottom: GridPosition = { x: start.x + dx, y: start.y + r, zIndex: start.zIndex };
        if (isFree(top)) return top;
        if (isFree(bottom)) return bottom;
      }
      // 좌우 스캔
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        const left: GridPosition = { x: start.x - r, y: start.y + dy, zIndex: start.zIndex };
        const right: GridPosition = { x: start.x + r, y: start.y + dy, zIndex: start.zIndex };
        if (isFree(left)) return left;
        if (isFree(right)) return right;
      }
    }

    return null;
  }

  private clampSize(size: GridSize, constraints?: GridSizeConstraints): GridSize {
    const result = { ...size };
    const cfg = this.grid.getConfig();

    if (constraints) {
      if (constraints.minWidth !== undefined) {
        result.width = Math.max(constraints.minWidth, result.width);
      }
      if (constraints.maxWidth !== undefined) {
        result.width = Math.min(constraints.maxWidth, result.width);
      }
      if (constraints.minHeight !== undefined) {
        result.height = Math.max(constraints.minHeight, result.height);
      }
      if (constraints.maxHeight !== undefined) {
        result.height = Math.min(constraints.maxHeight, result.height);
      }
    }

    // 그리드 경계에 맞춰 클램프
    result.width = Math.max(1, Math.min(result.width, cfg.columns));
    if (cfg.rows && cfg.rows > 0) {
      result.height = Math.max(1, Math.min(result.height, cfg.rows));
    }

    return result;
  }

  private callExtensionLifecycle(
    extension: BlockExtension<any>,
    block: Block,
    phase: 'create' | 'update'
  ): void {
    const blockData = block.getData();
    const contentElement = block.getContentElement();
    const editable = true; // TODO: get from state

    try {
      if (phase === 'create') {
        extension.onCreate?.(blockData as any, contentElement, editable);
        extension.onBeforeRender?.(blockData as any, contentElement, editable);
        extension.render(blockData as any, contentElement, editable);
        extension.onAfterRender?.(blockData as any, contentElement, editable);
      } else if (phase === 'update') {
        extension.onBeforeRender?.(blockData as any, contentElement, editable);
        extension.render(blockData as any, contentElement, editable);
        extension.onUpdateAttributes?.(blockData as any, contentElement, editable);
        extension.onAfterRender?.(blockData as any, contentElement, editable);
      }
    } catch (error) {
      console.error(`Extension error for ${extension.type}:`, error);
    }
  }

  private syncNextZIndex(): void {
    const maxZ = this.getAllBlocks().reduce((max, block) => 
      Math.max(max, block.position.zIndex), 0);
    this.nextZIndex = Math.max(this.nextZIndex, maxZ + 1);
  }

  // 정리
  clear(): void {
    for (const [id] of this.blocks) {
      this.removeBlock(id);
    }
    // 공간 인덱스도 초기화 (이미 removeBlock에서 개별 제거되었지만, 확실히 하기 위해)
    this.spatialIndex.clear();
  }

  destroy(): void {
    this.clear();
    this.extensions.clear();
    this.removeAllListeners();
  }

  // 성능 진단 메서드들
  getSpatialIndexStats(): {
    totalCells: number;
    totalBlocks: number;
    averageBlocksPerCell: number;
  } {
    return this.spatialIndex.getStats();
  }

  /**
   * 🚀 SpatialIndex 인스턴스 조회 (LassoHandler에서 O(1) 충돌 검사용)
   */
  getSpatialIndex(): SpatialIndex {
    return this.spatialIndex;
  }

  debugSpatialIndex(): void {
    console.log('🚀 SpatialIndex Performance Stats:', this.getSpatialIndexStats());
    this.spatialIndex.debug();
  }
}