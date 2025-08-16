import { DragState, Position, GridSize, GridPosition, DragReflowStrategy } from './types';
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
  private interactionNotified: boolean = false;

  constructor(
    private container: HTMLElement,
    private grid: Grid,
    private getBlock: (id: string) => Block | undefined,
    private getAllBlocks: () => Block[],
    private getAllowOverlap?: () => boolean,
    private getLassoEnabled?: () => boolean,
    private getKeyboardMove?: () => boolean,
    private getKeyboardDelete?: () => boolean,
    private onDeleteSelected?: (ids: string[]) => void,
    private getAutoGrowRows?: () => boolean,
    private requestGrowRows?: (rows: number) => void,
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

  private isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
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

    // 편집 모드인 블록은 내부 상호작용을 위해 드래그/리사이즈 시작을 차단
    if ((block as any).isEditing && (block as any).isEditing()) {
      return; // 기본 이벤트 그대로 통과 (contenteditable, inputs, buttons 등)
    }

    event.preventDefault();

    // 전역 transition 초기화 제거: 드래그 중 트랜지션 제어는 CSS(.pegboard-block-dragging)로 처리

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
    // 실제 이동이 발생할 때 최초 1회 알림
    this.interactionNotified = false;

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

    const enabled = this.getLassoEnabled ? !!this.getLassoEnabled() : false;
    if (!enabled) {
      // 라쏘 비활성: 빈 공간 클릭 시 선택 해제
      this.selectBlock(null);
      return;
    }

    this.isLassoSelecting = true;
    this.lassoAdditive = !!event.shiftKey;
    // 라쏘 시작 시 기존 선택을 스냅샷으로 보관(Shift 추가 선택 지원)
    this.lassoBaseSelection = new Set(this.selection);
    const rect = this.container.getBoundingClientRect();
    this.lassoStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.createSelectionBox(this.lassoStart.x, this.lassoStart.y);
  }

  private createSelectionBox(x: number, y: number) {
    if (this.selectionBoxEl) this.selectionBoxEl.remove();
    this.selectionBoxEl = document.createElement('div');
    this.selectionBoxEl.className = 'pegboard-selection-box';
    // 위치/크기만 JS에서 관리, 시각은 CSS로
    this.selectionBoxEl.style.position = 'absolute';
    this.selectionBoxEl.style.left = `${x}px`;
    this.selectionBoxEl.style.top = `${y}px`;
    this.selectionBoxEl.style.width = '0px';
    this.selectionBoxEl.style.height = '0px';
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

    // 클릭(이동 거의 없음) 시에는 선택 해제로 처리
    if (this.selectionBoxEl) {
      const w = parseFloat(this.selectionBoxEl.style.width || '0');
      const h = parseFloat(this.selectionBoxEl.style.height || '0');
      if (w < 2 && h < 2) {
        // 선택 해제 및 UI 정리
        this.selectBlock(null);
        this.selectionBoxEl.remove();
        this.selectionBoxEl = null;
        this.isLassoSelecting = false;
        this.lassoStart = null;
        this.lassoAdditive = false;
        this.lassoBaseSelection = null;
        return; // 추가 이벤트 중복 방지
      }
    }

    // 드래그 박스 기준으로 최종 선택 재계산 후 종료
    this.recomputeLassoSelectionFromBox();
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
    if (!this.interactionNotified) {
      this.emit('interaction:active', { mode: this.dragState.dragType } as any);
      this.interactionNotified = true;
    }
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

    // 마우스 기준 원시 좌상단 (컨테이너 좌표계)
    let rawLeft = event.clientX - rect.left - this.pointerDownOffset.dx;
    let rawTop = event.clientY - rect.top - this.pointerDownOffset.dy;

    // 컨테이너 패딩 및 블록 픽셀 크기를 고려하여 프리뷰가 경계를 넘지 않도록 클램핑
    const styles = getComputedStyle(this.container);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const paddingBottom = parseFloat(styles.paddingBottom) || 0;

    const innerWidth = rect.width - paddingLeft - paddingRight;
    const innerHeight = rect.height - paddingTop - paddingBottom;

    const anchorSize = this.selectedBlock.getData().size;
    const blockPixelWidth =
      anchorSize.width * (this.dragState.columnWidth || 0) +
      Math.max(0, anchorSize.width - 1) * config.gap;
    const blockPixelHeight =
      anchorSize.height * config.rowHeight + Math.max(0, anchorSize.height - 1) * config.gap;

    const minLeft = paddingLeft;
    const minTop = paddingTop;
    const maxLeft = paddingLeft + Math.max(0, innerWidth - blockPixelWidth);

    const autoGrow = this.getAutoGrowRows ? !!this.getAutoGrowRows() : false;
    // rows 상한 클램프 제거(자동 증가 모드)
    const hasRowCap = !!config.rows && config.rows > 0 && !autoGrow;
    const maxTop = hasRowCap ? paddingTop + Math.max(0, innerHeight - blockPixelHeight) : Infinity;

    rawLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));
    rawTop = Math.max(minTop, Math.min(maxTop, rawTop));

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

    // 스냅 후보 grid 좌표 계산
    const gridX = Math.round((rawLeft - paddingLeft) / this.dragState.cellTotalWidth!) + 1; // 1-indexed
    const gridY = Math.round((rawTop - paddingTop) / this.dragState.rowUnit!) + 1;

    // 후보 위치를 열/행 범위 내로 클램핑. 앵커 블록의 크기를 고려
    const maxXStart = Math.max(1, config.columns - anchorSize.width + 1);
    const maxYStart = hasRowCap
      ? Math.max(1, (config.rows as number) - anchorSize.height + 1)
      : Infinity;

    const candidate: GridPosition = {
      x: Math.max(1, Math.min(maxXStart, gridX)),
      y: Math.max(1, Math.min(maxYStart as number, gridY)),
      zIndex: this.startPosition.zIndex,
    };

    // 자동 증가 모드: 필요한 경우 rows를 즉시 늘림(컨테이너 높이 업데이트)
    if (autoGrow) {
      const requiredBottom = candidate.y + anchorSize.height - 1;
      const currentRows = config.rows || 0;
      if (requiredBottom > currentRows) {
        this.requestGrowRows && this.requestGrowRows(requiredBottom);
      }
    }

    const allowOverlap = this.getAllowOverlap ? this.getAllowOverlap() : false;

    if (this.selection.size > 1) {
      // 그룹 유효성 검사: anchor 기준 delta 로 각 블록 적용
      const deltaCol = candidate.x - this.startPosition.x;
      const deltaRow = candidate.y - this.startPosition.y;
      const allBlocks = this.getAllBlocks();
      const allBlocksData = allBlocks.map((b) => b.getData());
      const othersNonSelected = allBlocksData.filter((b) => !this.selection.has(b.id));
      let groupValid = true;
      const nextPositions = new Map<string, GridPosition>();
      let groupRequiredBottom = 0;
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
        groupRequiredBottom = Math.max(groupRequiredBottom, targetPos.y + d.size.height - 1);
        // 충돌 체크: 비선택 블럭과의 충돌 금지
        const collidesWithOthers =
          !allowOverlap && this.grid.checkGridCollision(targetPos, d.size, d.id, othersNonSelected);
        const valid = this.grid.isValidGridPosition(targetPos, d.size) && !collidesWithOthers;
        if (!valid) {
          groupValid = false;
          break;
        }
        nextPositions.set(id, targetPos);
      }
      if (autoGrow && groupRequiredBottom > (this.grid.getConfig().rows || 0)) {
        this.requestGrowRows && this.requestGrowRows(groupRequiredBottom);
      }
      this.pendingGroupMovePositions = groupValid ? nextPositions : null;
      // 힌트는 anchor 기준으로만 표시하되, groupValid 로 색 결정
      this.updateHintOverlay(candidate, this.selectedBlock.getData().size, groupValid);
    } else {
      // 단일 이동: 충돌 기반 검증 또는 재배치 프리뷰
      const blockData = this.selectedBlock.getData();
      const allBlocks = this.getAllBlocks();
      const othersData = allBlocks.map((b) => b.getData()).filter((d) => d.id !== blockData.id);

      if (allowOverlap) {
        const collides =
          !allowOverlap &&
          this.grid.checkGridCollision(candidate, blockData.size, blockData.id, othersData);
        const valid = this.grid.isValidGridPosition(candidate, blockData.size) && !collides;
        this.pendingMoveGridPosition = valid ? candidate : null;
        this.updateHintOverlay(candidate, blockData.size, valid);
      } else {
        // 겹침 금지: 모든 다른 블록과 충돌 금지
        const collideAny = this.grid.checkGridCollision(
          candidate,
          blockData.size,
          blockData.id,
          othersData,
        );
        const within = this.grid.isValidGridPosition(candidate, blockData.size);
        if (collideAny || !within) {
          this.pendingMoveGridPosition = null;
          this.updateHintOverlay(candidate, blockData.size, false);
        } else {
          this.pendingMoveGridPosition = candidate;
          this.updateHintOverlay(candidate, blockData.size, true);
        }
      }
    }
  }

  private handleMouseUp(): void {
    if (!this.isEditorMode() && !this.dragState.isDragging && !this.isLassoSelecting) return; // 뷰어 모드에서 진행 중 작업 없으면 무시
    if (this.dragState.isDragging && this.selectedBlock && this.startPosition && this.startSize) {
      const blockData = this.selectedBlock.getData();
      if (this.dragState.dragType === 'move') {
        this.clearDragPreview();
        const oldPosition = { ...this.startPosition };
        // 전역 transition 초기화 제거 (Pegboard FLIP 보존)
        if (this.selection.size > 1) {
          if (this.pendingGroupMovePositions) {
            // 그룹 적용
            for (const [id, pos] of this.pendingGroupMovePositions.entries()) {
              const b = this.getBlock(id);
              if (!b) continue;
              b.setPosition(pos);
            }
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
        const oldSize = { ...this.startSize };
        // 전역 transition 초기화 제거
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
    // 인터랙션 종료 알림
    this.emit('interaction:idle', {} as any);
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
    this.interactionNotified = false;
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

    // 통합 제약 계산: 방향별로 플러그인 제약과 그리드 경계를 함께 고려
    const blockData = this.selectedBlock.getData();
    const layout = blockData.constraints || {};
    const cfg = this.grid.getConfig();
    const columns = cfg.columns;
    const hasRowCap = !!cfg.rows && cfg.rows > 0;
    const maxRows = hasRowCap ? (cfg.rows as number) : Infinity;

    const clamp = (v: number, min?: number, max?: number) => {
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return v;
    };

    const minW = layout.minWidth ?? 1;
    const maxW = layout.maxWidth ?? Infinity;
    const minH = layout.minHeight ?? 1;
    const maxH = layout.maxHeight ?? Infinity;

    const endXFixed = this.startPosition.x + this.startSize.width - 1; // 서쪽 리사이즈 시 우측 엣지 고정
    const endYFixed = this.startPosition.y + this.startSize.height - 1; // 북쪽 리사이즈 시 하단 엣지 고정

    let candidatePos = { ...this.startPosition };
    let candidateSize = { ...this.startSize };

    // 가로 방향 처리
    let impossibleByMin = false;
    if (direction.includes('e') || direction.includes('w')) {
      if (direction.includes('e')) {
        // 동쪽: x는 고정, width만 증가/감소. 컬럼 경계와 제약을 동시 고려.
        const rawW = this.startSize.width + gridDeltaX;
        const maxWGrid = columns - this.startPosition.x + 1; // 우측 경계
        const maxWAll = Math.min(maxW, maxWGrid);
        if (minW > maxWAll) impossibleByMin = true;
        // min을 만족할 수 없는 경우에도 그리드 경계 내로만 움직이며 invalid로 표기
        let w = clamp(rawW, 1, Math.max(1, maxWAll));
        if (minW <= maxWAll) w = Math.max(w, minW);
        candidateSize.width = w;
      }
      if (direction.includes('w')) {
        // 서쪽: 우측 엣지(endXFixed) 고정, width 변화에 따라 x 재계산
        const rawW = this.startSize.width - gridDeltaX;
        const maxWGrid = endXFixed; // 좌측 경계가 1이므로 width 최대치는 endXFixed(=rightEdgeIndex)
        const maxWAll = Math.min(maxW, maxWGrid);
        if (minW > maxWAll) impossibleByMin = true;
        // minW가 maxWAll보다 큰 경우엔 그리드 경계 우선 (만족 불가), 가능한 최대치로 제한
        const wClamped = clamp(rawW, 1, Math.max(1, maxWAll));
        candidateSize.width = Math.max(1, Math.min(wClamped, Math.max(1, maxWAll)));
        candidateSize.width = Math.max(1, Math.min(candidateSize.width, maxWAll));
        candidateSize.width = Math.max(1, Math.min(candidateSize.width, maxWAll));
        // minW 적용 (불가능하면 그리드 경계치 유지)
        candidateSize.width = Math.max(candidateSize.width, 1);
        if (minW <= maxWAll) {
          candidateSize.width = Math.max(candidateSize.width, minW);
        }
        // 위치 재계산 (우측 고정)
        candidatePos.x = Math.max(1, endXFixed - candidateSize.width + 1);
      }
    }

    // 세로 방향 처리
    if (direction.includes('s') || direction.includes('n')) {
      if (direction.includes('s')) {
        // 남쪽: y 고정, height 변화. 행 상한(cap)이 있으면 그리드 경계 포함.
        const rawH = this.startSize.height + gridDeltaY;
        const maxHGrid = hasRowCap ? maxRows - this.startPosition.y + 1 : Infinity;
        const maxHAll = Math.min(maxH, maxHGrid);
        if (minH > maxHAll) impossibleByMin = true;
        let h = clamp(rawH, 1, Math.max(1, maxHAll));
        if (minH <= maxHAll) h = Math.max(h, minH);
        candidateSize.height = h;
      }
      if (direction.includes('n')) {
        // 북쪽: 하단 엣지(endYFixed) 고정, height 변화에 따라 y 재계산
        const rawH = this.startSize.height - gridDeltaY;
        const maxHGrid = endYFixed; // 상단 경계가 1이므로 최대 높이
        const maxHAll = Math.min(maxH, maxHGrid);
        if (minH > maxHAll) impossibleByMin = true;
        const hClamped = clamp(rawH, 1, Math.max(1, maxHAll));
        candidateSize.height = Math.max(1, Math.min(hClamped, Math.max(1, maxHAll)));
        if (minH <= maxHAll) {
          candidateSize.height = Math.max(candidateSize.height, minH);
        }
        candidatePos.y = Math.max(1, endYFixed - candidateSize.height + 1);
      }
    }

    // 최종 유효성 및 충돌 검사
    const allowOverlap = this.getAllowOverlap ? this.getAllowOverlap() : false;
    const existingBlocks = this.getAllBlocks()
      .map((b) => b.getData())
      .filter((b) => b.id !== blockData.id);
    const collides =
      !allowOverlap &&
      this.grid.checkGridCollision(candidatePos, candidateSize, blockData.id, existingBlocks);
    const valid =
      this.grid.isValidGridPosition(candidatePos, candidateSize) && !collides && !impossibleByMin;

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

  // 외부에서 현재 드래그 중인지 확인할 수 있도록 공개 메서드 추가
  isDragging(): boolean {
    return !!this.dragState.isDragging;
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
    if (this.isTypingTarget(event.target)) return; // 입력 중엔 무시

    const ids =
      this.selection.size > 0
        ? Array.from(this.selection)
        : this.selectedBlock
          ? [this.selectedBlock.getData().id]
          : [];

    // Delete / Backspace
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const allowDelete = this.getKeyboardDelete ? !!this.getKeyboardDelete() : false;
      if (!allowDelete) return;
      if (ids.length === 0) return;
      event.preventDefault();
      // 선택 UI 해제
      for (const id of ids) {
        const b = this.getBlock(id);
        if (b) b.setSelected(false);
        this.selection.delete(id);
      }
      if (this.selectedBlock && ids.includes(this.selectedBlock.getData().id)) {
        this.selectedBlock = null;
      }
      this.emit('selection:changed', { ids: Array.from(this.selection) });
      // 삭제 콜백 호출
      if (this.onDeleteSelected) this.onDeleteSelected(ids);
      return;
    }

    if (this.selection.size === 0) return;
    // 방향키 이동: 옵션 체크
    const allowMove = this.getKeyboardMove ? !!this.getKeyboardMove() : true;
    if (!allowMove) return;

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

  private updateHintOverlay(pos: GridPosition, size: GridSize, valid: boolean): void {
    if (!this.hintElement) {
      this.hintElement = document.createElement('div');
      this.hintElement.className = 'pegboard-hint-overlay';
      this.hintElement.setAttribute('aria-hidden', 'true');
      this.container.appendChild(this.hintElement);
    }
    this.hintElement.style.gridColumn = `${pos.x} / span ${size.width}`;
    this.hintElement.style.gridRow = `${pos.y} / span ${size.height}`;
    this.hintElement.classList.toggle('invalid', !valid);
  }

  private clearHintOverlay(): void {
    if (this.hintElement) {
      this.hintElement.remove();
      this.hintElement = null;
    }
  }

  private clearDragPreview(): void {
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
