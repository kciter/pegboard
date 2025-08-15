import { DragState, Position, GridSize, GridPosition } from './types';
import { AnyBlockExtension } from './BlockExtension';
import { Block } from './Block';
import { Grid } from './Grid';
import { EventEmitter } from './EventEmitter';

export class DragManager extends EventEmitter {
  private dragState: DragState = {
    isDragging: false,
    dragType: 'move',
    startPosition: { x: 0, y: 0 },
  };

  private selectedBlock: Block | null = null;
  private startPosition: GridPosition | null = null;
  private startSize: GridSize | null = null;
  private pointerDownOffset: { dx: number; dy: number } | null = null; // 블록 내부 클릭 offset(픽셀)
  private hintElement: HTMLElement | null = null;
  private pendingMoveGridPosition: GridPosition | null = null;
  // resize 는 프리뷰(힌트) 후 드롭 시 확정
  private pendingResizeGridPosition: GridPosition | null = null;
  private pendingResizeGridSize: GridSize | null = null;
  private startBlockPixelPos: { left: number; top: number } | null = null;
  // 픽셀 기반 delta 계산 시 필요하면 다시 도입 가능

  private selection: Set<string> = new Set();
  private selectionBoxEl: HTMLElement | null = null;
  private isLassoSelecting: boolean = false;
  private lassoAdditive: boolean = false; // Shift 기반 추가 선택 모드
  private lassoBaseSelection: Set<string> | null = null; // 라쏘 시작 시 기존 선택 스냅샷
  private lassoStart: { x: number; y: number } | null = null;
  private groupMoveStartPositions: Map<string, GridPosition> = new Map();
  private groupStartPixelPos: Map<string, { left: number; top: number }> = new Map();
  private pendingGroupMovePositions: Map<string, GridPosition> | null = null;

  constructor(
    private container: HTMLElement,
    private grid: Grid,
    private getBlock: (id: string) => Block | undefined,
    private getAllBlocks: () => Block[],
    private getAllowOverlap?: () => boolean,
    private getPlugin?: (type: string) => AnyBlockExtension | undefined,
  ) {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.container.addEventListener('mousedown', this.handleLassoStart.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp);
  }

  private isEditorMode(): boolean {
    return this.container.classList.contains('pegboard-editor-mode');
  }

  private computeCellMetrics() {
    const rect = this.container.getBoundingClientRect();
    const config = this.grid.getConfig();
    const columnWidth = (rect.width - config.gap * (config.columns - 1)) / config.columns;
    return {
      columnWidth,
      cellTotalWidth: columnWidth + config.gap,
      rowUnit: config.rowHeight + config.gap,
    };
  }

  private handleMouseDown(event: MouseEvent): void {
    if (!this.isEditorMode()) return; // 뷰어 모드에서는 차단
    const target = event.target as HTMLElement;
    const blockElement = target.closest('.pegboard-block') as HTMLElement;

    if (!blockElement) return;

    const blockId = blockElement.dataset.blockId;
    if (!blockId) return;

    const block = this.getBlock(blockId);
    if (!block) return;

    event.preventDefault();

    const blockData = block.getData();
    const rawIsResizeHandle =
      target.classList.contains('pegboard-resize-handle') ||
      target.className.includes('pegboard-resize-handle');

    // resizable=false면 어떤 리사이즈 핸들도 무효 처리
    const isResizeHandle = rawIsResizeHandle && blockData.resizable !== false;

    // movable/resizable 검사: 둘 다 false면 상호작용 차단하되 선택은 허용
    if (!isResizeHandle && blockData.movable === false) {
      // Cmd/Ctrl 토글 선택만 처리
      const isModifier = (event.metaKey || event.ctrlKey) && !rawIsResizeHandle;
      if (isModifier) {
        if (this.selection.has(blockId)) {
          this.selection.delete(blockId);
          block.setSelected(false);
          if (this.selectedBlock && this.selectedBlock.getData().id === blockId) {
            const nextId = Array.from(this.selection)[0];
            this.selectedBlock = nextId ? this.getBlock(nextId) || null : null;
          }
        } else {
          this.selection.add(blockId);
          block.setSelected(true);
          this.selectedBlock = block;
        }
        this.emit('selection:changed', { ids: Array.from(this.selection) });
        this.emit('block:selected', {
          block: this.selectedBlock ? this.selectedBlock.getData() : null,
        });
      } else {
        // 단일 선택으로 전환
        this.selectBlock(block);
      }
      return; // 드래그 시작 안 함
    }

    // 리사이즈 핸들이면 라쏘 선택과의 충돌을 완전히 차단
    if (isResizeHandle) {
      const e: any = event as any;
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      // 진행 중인 라쏘 상태 정리
      if (this.isLassoSelecting) {
        this.isLassoSelecting = false;
        if (this.selectionBoxEl) {
          this.selectionBoxEl.remove();
          this.selectionBoxEl = null;
        }
        this.lassoStart = null;
      }
    }

    const isModifier = (event.metaKey || event.ctrlKey) && !isResizeHandle;

    // Cmd/Ctrl 토글 선택: 드래그 시작 대신 선택만 토글
    if (isModifier) {
      if (this.selection.has(blockId)) {
        this.selection.delete(blockId);
        block.setSelected(false);
        if (this.selectedBlock && this.selectedBlock.getData().id === blockId) {
          const nextId = Array.from(this.selection)[0];
          this.selectedBlock = nextId ? this.getBlock(nextId) || null : null;
        }
      } else {
        this.selection.add(blockId);
        block.setSelected(true);
        this.selectedBlock = block;
      }
      this.emit('selection:changed', { ids: Array.from(this.selection) });
      this.emit('block:selected', {
        block: this.selectedBlock ? this.selectedBlock.getData() : null,
      });
      return; // 선택 토글일 땐 드래그 시작하지 않음
    }

    this.startPosition = { ...blockData.position };
    this.startSize = { ...blockData.size };

    // metrics 저장
    const metrics = this.computeCellMetrics();
    this.dragState.columnWidth = metrics.columnWidth;
    this.dragState.cellTotalWidth = metrics.cellTotalWidth;
    this.dragState.rowUnit = metrics.rowUnit;

    // 블록 좌표 & 클릭 offset 저장 (정밀 이동)
    const blockRect = block.getElement().getBoundingClientRect();
    this.pointerDownOffset = {
      dx: event.clientX - blockRect.left,
      dy: event.clientY - blockRect.top,
    };
    // 드래그 시작 시 원래 픽셀 위치 저장 (컨테이너 상대)
    const containerRect = this.container.getBoundingClientRect();
    this.startBlockPixelPos = {
      left: blockRect.left - containerRect.left,
      top: blockRect.top - containerRect.top,
    };
    // 드래그 타입이 resize 면 시각적 상태 클래스 부여
    if (isResizeHandle) {
      block.getElement().classList.add('pegboard-block-resizing');
    }

    this.dragState = {
      ...this.dragState,
      isDragging: true,
      dragType: isResizeHandle ? 'resize' : 'move',
      startPosition: { x: event.clientX, y: event.clientY },
      targetBlockId: blockId,
    };

    // 다중 선택 드래그를 위해, 선택 보존 로직
    if (isResizeHandle) {
      // 리사이즈 중에는 기존 selectBlock을 호출해 핸들을 재생성하지 않음
      this.selectedBlock = block;
      // 다른 선택 해제 후 자신만 선택되도록 동기화
      if (!this.selection.has(blockId) || this.selection.size !== 1) {
        this.selection = new Set([blockId]);
        for (const b of this.getAllBlocks()) b.setSelected(b.getData().id === blockId);
        this.emit('selection:changed', { ids: Array.from(this.selection) });
        this.emit('block:selected', { block: block.getData() });
      }
    } else if (this.selection.size > 1 && this.selection.has(blockId)) {
      // 기존 selection 유지, 클릭된 블록만 anchor 로 설정
      if (this.selectedBlock && this.selectedBlock !== block) {
        this.selectedBlock.setSelected(false);
      }
      this.selectedBlock = block;
      this.selectedBlock.setSelected(true);
      this.emit('block:selected', { block: this.selectedBlock.getData() });
    } else {
      this.selectBlock(block);
    }

    if (isResizeHandle) {
      this.dragState.resizeDirection = this.getResizeDirection(target as HTMLElement);
    }

    // 그룹 이동을 위한 초기 스냅샷 저장
    this.groupMoveStartPositions.clear();
    this.groupStartPixelPos.clear();
    const ids = this.selection.size > 0 ? Array.from(this.selection) : [blockId];
    const contRect = this.container.getBoundingClientRect();
    ids.forEach((id) => {
      const b = this.getBlock(id);
      if (!b) return;
      const d = b.getData();
      this.groupMoveStartPositions.set(id, { ...d.position });
      const r = b.getElement().getBoundingClientRect();
      this.groupStartPixelPos.set(id, { left: r.left - contRect.left, top: r.top - contRect.top });
    });
  }

  private handleLassoStart(event: MouseEvent): void {
    if (!this.isEditorMode()) return; // 뷰어 모드에서는 차단
    const target = event.target as HTMLElement;
    const onBlock = target.closest('.pegboard-block');
    if (onBlock) return; // 블록 위에서는 기존 처리로 이동/리사이즈
    if (event.button !== 0) return;
    this.isLassoSelecting = true;
    this.lassoAdditive = !!event.shiftKey;
    // 라쏘 시작 시 항상 기존 선택을 스냅샷으로 보관하여 중간에 Shift 토글에도 대응
    this.lassoBaseSelection = new Set(this.selection);
    const rect = this.container.getBoundingClientRect();
    this.lassoStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.createSelectionBox(this.lassoStart.x, this.lassoStart.y);
  }

  private createSelectionBox(x: number, y: number) {
    if (this.selectionBoxEl) this.selectionBoxEl.remove();
    this.selectionBoxEl = document.createElement('div');
    this.selectionBoxEl.className = 'pegboard-selection-box';
    Object.assign(this.selectionBoxEl.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      width: '0px',
      height: '0px',
      border: '1px dashed #4096ff',
      background: 'rgba(64,150,255,0.1)',
      pointerEvents: 'none',
      zIndex: '10000',
    } as CSSStyleDeclaration);
    this.container.appendChild(this.selectionBoxEl);
  }

  private updateSelectionBox(x: number, y: number) {
    if (!this.selectionBoxEl || !this.lassoStart) return;
    const left = Math.min(this.lassoStart.x, x);
    const top = Math.min(this.lassoStart.y, y);
    const width = Math.abs(this.lassoStart.x - x);
    const height = Math.abs(this.lassoStart.y - y);
    this.selectionBoxEl.style.left = `${left}px`;
    this.selectionBoxEl.style.top = `${top}px`;
    this.selectionBoxEl.style.width = `${width}px`;
    this.selectionBoxEl.style.height = `${height}px`;
  }

  private recomputeLassoSelectionFromBox() {
    if (!this.selectionBoxEl) return;
    const box = {
      left: parseFloat(this.selectionBoxEl.style.left),
      top: parseFloat(this.selectionBoxEl.style.top),
      width: parseFloat(this.selectionBoxEl.style.width),
      height: parseFloat(this.selectionBoxEl.style.height),
    };
    this.updateLassoSelection(box);
  }

  private finalizeLasso() {
    if (!this.isLassoSelecting) return;
    this.isLassoSelecting = false;
    if (this.selectionBoxEl) {
      this.selectionBoxEl.remove();
      this.selectionBoxEl = null;
    }
    this.lassoStart = null;
    this.lassoAdditive = false;
    this.lassoBaseSelection = null;
    this.emit('selection:changed', { ids: Array.from(this.selection) });
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isEditorMode()) return; // 뷰어 모드에서는 차단
    if (this.isLassoSelecting) {
      const rect = this.container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      this.updateSelectionBox(x, y);
      this.updateLassoSelection({
        left: parseFloat(this.selectionBoxEl!.style.left),
        top: parseFloat(this.selectionBoxEl!.style.top),
        width: parseFloat(this.selectionBoxEl!.style.width),
        height: parseFloat(this.selectionBoxEl!.style.height),
      });
      return;
    }
    if (!this.dragState.isDragging || !this.selectedBlock) return;
    if (this.dragState.dragType === 'move') {
      this.handleSmoothMove(event);
    } else if (this.dragState.dragType === 'resize') {
      this.handleResize(event);
    }
  }

  private updateLassoSelection(box: { left: number; top: number; width: number; height: number }) {
    const sel = new Set<string>();
    const containerRect = this.container.getBoundingClientRect();
    const rect = new DOMRect(
      box.left + containerRect.left,
      box.top + containerRect.top,
      box.width,
      box.height,
    );
    for (const block of this.getAllBlocks()) {
      const bRect = block.getBoundingRect();
      const overlap = !(
        bRect.right < rect.left ||
        bRect.left > rect.right ||
        bRect.bottom < rect.top ||
        bRect.top > rect.bottom
      );
      if (overlap) sel.add(block.getData().id);
    }
    // Shift 라쏘면 기존 선택 스냅샷과 합집합, 아니면 라쏘 영역만
    if (this.lassoAdditive && this.lassoBaseSelection) {
      const merged = new Set(this.lassoBaseSelection);
      for (const id of sel) merged.add(id);
      this.selection = merged;
    } else {
      this.selection = sel;
    }
    // 선택된 UI 동기화
    const ids = new Set(this.selection);
    for (const b of this.getAllBlocks()) {
      const id = b.getData().id;
      b.setSelected(ids.has(id));
    }
    // 단일만 선택된 경우 포커스 블럭 갱신, 아니면 해제(기존 포커스가 포함되어 있으면 유지)
    if (this.selection.size === 1) {
      const onlyId = Array.from(this.selection)[0];
      if (onlyId) {
        this.selectedBlock = this.getBlock(onlyId) || null;
      }
    } else if (this.selectedBlock && !this.selection.has(this.selectedBlock.getData().id)) {
      this.selectedBlock = null;
    }
  }

  // 부드러운 이동 처리 + 힌트 오버레이 업데이트
  private handleSmoothMove(event: MouseEvent): void {
    if (
      !this.selectedBlock ||
      !this.startPosition ||
      !this.pointerDownOffset ||
      !this.startBlockPixelPos
    )
      return;

    const config = this.grid.getConfig();
    const rect = this.container.getBoundingClientRect();

    const rawLeft = event.clientX - rect.left - this.pointerDownOffset.dx;
    const rawTop = event.clientY - rect.top - this.pointerDownOffset.dy;

    // 시각적 이동: transform 사용 (grid-position 즉시 변경 안함)
    const deltaX = rawLeft - this.startBlockPixelPos.left;
    const deltaY = rawTop - this.startBlockPixelPos.top;

    const applyDraggingVisual = (b: Block, dxy: { dx: number; dy: number }) => {
      const el = b.getElement();
      el.style.transform = `translate(${dxy.dx}px, ${dxy.dy}px)`;
      el.classList.add('pegboard-block-dragging');
    };

    if (this.selection.size > 1) {
      // 그룹 전체에 동일 delta 적용하되 movable=false는 제외(정지)
      for (const id of this.selection) {
        const b = this.getBlock(id);
        if (!b) continue;
        const d = b.getData();
        if (d.movable === false) continue; // 프리뷰 제외
        const start = this.groupStartPixelPos.get(id);
        if (!start) continue;
        const el = b.getElement();
        el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        el.classList.add('pegboard-block-dragging');
      }
    } else {
      applyDraggingVisual(this.selectedBlock, { dx: deltaX, dy: deltaY });
    }

    // 스냅 후보 grid 좌표 계산 (기존 로직과 동일한 룰 적용)
    const col = Math.round(rawLeft / this.dragState.cellTotalWidth!) + 1; // 1-indexed
    const row = Math.round(rawTop / this.dragState.rowUnit!) + 1;
    const candidate: GridPosition = {
      x: Math.max(1, Math.min(config.columns, col)),
      y: Math.max(1, row),
      zIndex: this.startPosition.zIndex,
    };

    const allowOverlap = this.getAllowOverlap ? this.getAllowOverlap() : false;

    if (this.selection.size > 1) {
      // 그룹 유효성 검사: anchor 기준 delta 로 각 블록 적용
      const deltaCol = candidate.x - this.startPosition.x;
      const deltaRow = candidate.y - this.startPosition.y;
      const allBlocks = this.getAllBlocks();
      const allBlocksData = allBlocks.map((b) => b.getData());
      const immovableSelected = allBlocksData.filter(
        (b) => this.selection.has(b.id) && b.movable === false,
      );
      const othersNonSelected = allBlocksData.filter((b) => !this.selection.has(b.id));
      let groupValid = true;
      const nextPositions = new Map<string, GridPosition>();
      for (const id of this.selection) {
        const b = this.getBlock(id);
        if (!b) continue;
        const d = b.getData();
        if (d.movable === false) continue; // 이동 대상 아님
        const startPos = this.groupMoveStartPositions.get(id) || d.position;
        const targetPos: GridPosition = {
          x: Math.max(1, startPos.x + deltaCol),
          y: Math.max(1, startPos.y + deltaRow),
          zIndex: startPos.zIndex,
        };
        // 충돌 체크: 비선택 블럭 + 선택 중 immovable 블럭과 충돌 금지
        const others = [...othersNonSelected, ...immovableSelected];
        const collidesWithOthers =
          !allowOverlap && this.grid.checkGridCollision(targetPos, d.size, d.id, others);
        const valid = this.grid.isValidGridPosition(targetPos, d.size) && !collidesWithOthers;
        if (!valid) {
          groupValid = false;
          break;
        }
        nextPositions.set(id, targetPos);
      }
      this.pendingGroupMovePositions = groupValid ? nextPositions : null;
      // 힌트는 anchor 기준으로만 표시하되, groupValid 로 색 결정
      this.updateHintOverlay(candidate, this.selectedBlock.getData().size, groupValid);
    } else {
      // 단일 이동 기존 로직
      const blockData = this.selectedBlock.getData();
      const existingBlocks = this.getAllBlocks()
        .map((b) => b.getData())
        .filter((b) => b.id !== blockData.id);
      const collides =
        !allowOverlap &&
        this.grid.checkGridCollision(candidate, blockData.size, blockData.id, existingBlocks);
      const valid = this.grid.isValidGridPosition(candidate, blockData.size) && !collides;
      this.pendingMoveGridPosition = valid ? candidate : null;
      this.updateHintOverlay(candidate, blockData.size, valid);
    }
  }

  private updateHintOverlay(pos: GridPosition, size: GridSize, valid: boolean): void {
    if (!this.hintElement) {
      this.hintElement = document.createElement('div');
      this.hintElement.className = 'pegboard-hint-overlay';
      Object.assign(this.hintElement.style, {
        pointerEvents: 'none',
        boxSizing: 'border-box',
        border: '2px dashed #1e90ff',
        background: 'rgba(30,144,255,0.15)',
        zIndex: '50',
      } as CSSStyleDeclaration);
      this.container.appendChild(this.hintElement);
    }
    this.hintElement.style.gridColumn = `${pos.x} / span ${size.width}`;
    this.hintElement.style.gridRow = `${pos.y} / span ${size.height}`;
    if (valid) {
      this.hintElement.style.borderColor = '#1e90ff';
      this.hintElement.style.background = 'rgba(30,144,255,0.15)';
    } else {
      this.hintElement.style.borderColor = '#ff4d4f';
      this.hintElement.style.background = 'rgba(255,77,79,0.15)';
    }
  }

  private clearHintOverlay(): void {
    if (this.hintElement) {
      this.hintElement.remove();
      this.hintElement = null;
    }
  }

  private clearDragPreview(): void {
    // 선택된 항목 모두에서 프리뷰 transform 제거
    const ids =
      this.selection.size > 0
        ? Array.from(this.selection)
        : this.selectedBlock
          ? [this.selectedBlock.getData().id]
          : [];
    for (const id of ids) {
      const b = this.getBlock(id);
      if (!b) continue;
      const el = b.getElement();
      el.style.transform = '';
      el.classList.remove('pegboard-block-dragging');
    }
  }

  private handleMouseUp(): void {
    if (!this.isEditorMode() && !this.dragState.isDragging && !this.isLassoSelecting) return; // 뷰어 모드에서 진행 중 작업 없으면 무시
    if (this.dragState.isDragging && this.selectedBlock && this.startPosition && this.startSize) {
      const blockData = this.selectedBlock.getData();
      if (this.dragState.dragType === 'move') {
        this.clearDragPreview();
        const oldPosition = { ...this.startPosition };
        if (this.selection.size > 1) {
          if (this.pendingGroupMovePositions) {
            // 그룹 적용
            for (const [id, pos] of this.pendingGroupMovePositions.entries()) {
              const b = this.getBlock(id);
              if (!b) continue;
              b.setPosition(pos);
            }
            // anchor 기준 이벤트 하나만 발행
            this.emit('block:moved', {
              block: this.selectedBlock.getData(),
              oldPosition,
            });
          }
          this.pendingGroupMovePositions = null;
          this.clearHintOverlay();
        } else {
          if (this.pendingMoveGridPosition) {
            this.selectedBlock.setPosition(this.pendingMoveGridPosition);
            this.emit('block:moved', {
              block: this.selectedBlock.getData(),
              oldPosition,
            });
          }
          this.pendingMoveGridPosition = null;
          this.clearHintOverlay();
        }
      } else if (this.dragState.dragType === 'resize') {
        // 프리뷰 적용
        const oldSize = { ...this.startSize };
        if (this.pendingResizeGridPosition && this.pendingResizeGridSize) {
          this.selectedBlock.setPosition(this.pendingResizeGridPosition);
          this.selectedBlock.setSize(this.pendingResizeGridSize);
          this.emit('block:resized', {
            block: this.selectedBlock.getData(),
            oldSize,
          });
        }
        this.pendingResizeGridPosition = null;
        this.pendingResizeGridSize = null;
        this.clearHintOverlay();
        this.selectedBlock.getElement().classList.remove('pegboard-block-resizing');
      }
    }
    if (this.isLassoSelecting) {
      this.finalizeLasso();
    }
    this.resetDragState();
  }

  private resetDragState(): void {
    this.dragState = {
      isDragging: false,
      dragType: 'move',
      startPosition: { x: 0, y: 0 },
    };
    this.startPosition = null;
    this.startSize = null;
    this.pointerDownOffset = null;
    this.groupMoveStartPositions.clear();
    this.groupStartPixelPos.clear();
  }

  private handleMove(event: MouseEvent): void {
    if (!this.selectedBlock || !this.startPosition || !this.pointerDownOffset) return;

    const config = this.grid.getConfig();
    const rect = this.container.getBoundingClientRect();

    // 클릭했을 때 블록 내부 offset을 유지하면서 좌측 상단 기준 계산
    const rawLeft = event.clientX - rect.left - this.pointerDownOffset.dx;
    const rawTop = event.clientY - rect.top - this.pointerDownOffset.dy;

    const col = Math.round(rawLeft / this.dragState.cellTotalWidth!) + 1; // 1-indexed
    const row = Math.round(rawTop / this.dragState.rowUnit!) + 1;

    const newPosition: GridPosition = {
      x: Math.max(1, Math.min(config.columns, col)),
      y: Math.max(1, row),
      zIndex: this.startPosition.zIndex,
    };

    const allowOverlap = this.getAllowOverlap ? this.getAllowOverlap() : false;
    const blockData = this.selectedBlock.getData();
    const existingBlocks = this.getAllBlocks()
      .map((b) => b.getData())
      .filter((b) => b.id !== blockData.id);

    const noCollision =
      allowOverlap ||
      !this.grid.checkGridCollision(newPosition, blockData.size, blockData.id, existingBlocks);
    if (noCollision && this.grid.isValidGridPosition(newPosition, blockData.size)) {
      this.selectedBlock.setPosition(newPosition);
    }
  }

  private handleResize(event: MouseEvent): void {
    if (!this.selectedBlock || !this.startPosition || !this.startSize) return;
    const direction = this.dragState.resizeDirection || '';

    const deltaX = event.clientX - this.dragState.startPosition.x;
    const deltaY = event.clientY - this.dragState.startPosition.y;

    const gridDeltaX = Math.round(deltaX / this.dragState.cellTotalWidth!);
    const gridDeltaY = Math.round(deltaY / this.dragState.rowUnit!);

    let candidatePos = { ...this.startPosition };
    let candidateSize = { ...this.startSize };

    if (direction.includes('e')) {
      candidateSize.width = Math.max(1, this.startSize.width + gridDeltaX);
    }
    if (direction.includes('w')) {
      const newSpan = Math.max(1, this.startSize.width - gridDeltaX);
      const change = this.startSize.width - newSpan;
      if (this.startPosition.x + change >= 1) {
        candidatePos.x = this.startPosition.x + change;
        candidateSize.width = newSpan;
      }
    }
    if (direction.includes('s')) {
      candidateSize.height = Math.max(1, this.startSize.height + gridDeltaY);
    }
    if (direction.includes('n')) {
      const newSpan = Math.max(1, this.startSize.height - gridDeltaY);
      const change = this.startSize.height - newSpan;
      if (this.startPosition.y + change >= 1) {
        candidatePos.y = this.startPosition.y + change;
        candidateSize.height = newSpan;
      }
    }

    // 제약
    const blockData = this.selectedBlock.getData();
    const plugin = this.getPlugin ? this.getPlugin(blockData.type) : undefined;
    const layout = plugin?.defaultLayout;
    if (layout) {
      const clamp = (v: number, min?: number, max?: number) => {
        if (min !== undefined) v = Math.max(min, v);
        if (max !== undefined) v = Math.min(max, v);
        return v;
      };
      const beforeW = candidateSize.width;
      const beforeH = candidateSize.height;
      candidateSize.width = clamp(candidateSize.width, layout.minWidth, layout.maxWidth);
      candidateSize.height = clamp(candidateSize.height, layout.minHeight, layout.maxHeight);
      if (candidateSize.width !== beforeW && direction.includes('w')) {
        candidatePos.x = this.startPosition.x + (this.startSize.width - candidateSize.width);
      }
      if (candidateSize.height !== beforeH && direction.includes('n')) {
        candidatePos.y = this.startPosition.y + (this.startSize.height - candidateSize.height);
      }
    }

    const allowOverlap = this.getAllowOverlap ? this.getAllowOverlap() : false;
    const existingBlocks = this.getAllBlocks()
      .map((b) => b.getData())
      .filter((b) => b.id !== blockData.id);
    const collides =
      !allowOverlap &&
      this.grid.checkGridCollision(candidatePos, candidateSize, blockData.id, existingBlocks);
    const valid = this.grid.isValidGridPosition(candidatePos, candidateSize) && !collides;

    // 힌트 업데이트 (실제 블록 변경 안 함)
    this.updateHintOverlay(candidatePos, candidateSize, valid);
    if (valid) {
      this.pendingResizeGridPosition = candidatePos;
      this.pendingResizeGridSize = candidateSize;
    } else {
      this.pendingResizeGridPosition = null;
      this.pendingResizeGridSize = null;
    }
  }

  private getResizeDirection(handle: HTMLElement): string {
    const className = handle.className;
    if (className.includes('nw')) return 'nw';
    if (className.includes('ne')) return 'ne';
    if (className.includes('sw')) return 'sw';
    if (className.includes('se')) return 'se';
    if (className.includes('-n')) return 'n';
    if (className.includes('-s')) return 's';
    if (className.includes('-w')) return 'w';
    if (className.includes('-e')) return 'e';
    return '';
  }

  selectBlock(block: Block | null): void {
    if (this.selectedBlock) {
      this.selectedBlock.setSelected(false);
    }

    this.selectedBlock = block;

    if (this.selectedBlock) {
      this.selectedBlock.setSelected(true);
      // 단일 클릭 시 기존 선택을 이 블록 하나로 교체
      this.selection = new Set([this.selectedBlock.getData().id]);
      // 선택 UI 동기화
      const ids = new Set(this.selection);
      for (const b of this.getAllBlocks()) {
        const id = b.getData().id;
        b.setSelected(ids.has(id));
      }
    } else {
      // 모두 해제
      this.selection.clear();
      for (const b of this.getAllBlocks()) b.setSelected(false);
    }
    this.emit('block:selected', {
      block: this.selectedBlock ? this.selectedBlock.getData() : null,
    });
    this.emit('selection:changed', { ids: Array.from(this.selection) });
  }

  getSelectedBlock(): Block | null {
    return this.selectedBlock;
  }

  // 선택된 여러 블럭 동시 이동 (키보드/툴바 같은 외부에서 호출할 수 있도록)
  moveSelectedBy(delta: { dcol: number; drow: number }): void {
    const ids = Array.from(this.selection);
    if (ids.length === 0) return;
    const blocks = ids.map((id) => this.getBlock(id)!).filter(Boolean);
    const moving = blocks.filter((b) => b.getData().movable !== false);
    if (moving.length === 0) return;

    const existing = this.getAllBlocks().map((b) => b.getData());
    const allow = this.getAllowOverlap ? this.getAllowOverlap() : false;

    // 검증: 이동 대상 각각에 대해, 비이동 대상(모든 나머지)과 충돌/경계 체크
    for (const b of moving) {
      const d = b.getData();
      const targetPos: GridPosition = {
        ...d.position,
        x: d.position.x + delta.dcol,
        y: d.position.y + delta.drow,
        zIndex: d.position.zIndex,
      };
      const others = existing.filter((e) => e.id !== d.id);
      const ok =
        (allow || !this.grid.checkGridCollision(targetPos, d.size, d.id, others)) &&
        this.grid.isValidGridPosition(targetPos, d.size);
      if (!ok) return; // 하나라도 불가하면 전체 취소
    }

    // 적용: movable=true 인 것만 이동
    for (const b of moving) {
      const d = b.getData();
      b.setPosition({
        ...d.position,
        x: d.position.x + delta.dcol,
        y: d.position.y + delta.drow,
      });
    }

    // 이벤트 앵커: 현재 selectedBlock이 이동됐다면 그것, 아니면 moving[0]
    const anchor =
      this.selectedBlock && this.selectedBlock.getData().movable !== false
        ? this.selectedBlock
        : moving[0] || null;
    if (anchor) {
      const oldPosition = {
        x: anchor.getData().position.x - delta.dcol,
        y: anchor.getData().position.y - delta.drow,
        zIndex: anchor.getData().position.zIndex,
      } as GridPosition;
      this.emit('block:moved', { block: anchor.getData(), oldPosition });
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    // 라쏘 중 Shift 키를 누르면 즉시 추가 선택 모드로 전환
    if (this.isLassoSelecting && event.key === 'Shift') {
      if (!this.lassoAdditive) {
        this.lassoAdditive = true;
        this.recomputeLassoSelectionFromBox();
      }
      event.preventDefault();
      return;
    }
    // 에디터 모드에서만 동작
    if (!this.container.classList.contains('pegboard-editor-mode')) return;
    if (this.selection.size === 0) return;
    let delta = { dcol: 0, drow: 0 };
    switch (event.key) {
      case 'ArrowLeft':
        delta.dcol = -1;
        break;
      case 'ArrowRight':
        delta.dcol = 1;
        break;
      case 'ArrowUp':
        delta.drow = -1;
        break;
      case 'ArrowDown':
        delta.drow = 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.moveSelectedBy(delta);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    // 라쏘 중 Shift 키를 떼면 즉시 일반 모드로 전환(기존 선택과의 합집합 해제)
    if (this.isLassoSelecting && event.key === 'Shift') {
      if (this.lassoAdditive) {
        this.lassoAdditive = false;
        this.recomputeLassoSelectionFromBox();
      }
      event.preventDefault();
    }
  };

  destroy(): void {
    this.removeAllListeners();
    this.container.removeEventListener('mousedown', this.handleMouseDown);
    this.container.removeEventListener('mousedown', this.handleLassoStart);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('keydown', this.handleKeyDown as any);
    document.removeEventListener('keyup', this.handleKeyUp as any);
  }
}
