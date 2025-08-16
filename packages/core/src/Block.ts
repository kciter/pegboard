import { BlockData, GridPosition, GridSize, Position, GridSizeConstraints } from './types';
import { createElement } from './utils';

export class Block {
  private element: HTMLElement;
  private contentElement: HTMLElement;
  private resizeHandles: HTMLElement[] = [];
  private supportsEditMode: boolean = false;
  private editing: boolean = false;

  constructor(private data: BlockData) {
    this.element = this.createElement();
    this.contentElement = createElement('div', 'pegboard-block-content', this.element);

    // 콘텐츠 영역 스타일은 CSS로 위임
    this.updateElement();
  }

  private createElement(): HTMLElement {
    const element = createElement('div', 'pegboard-block');
    element.dataset.blockId = this.data.id;
    element.dataset.blockType = this.data.type;
    return element;
  }

  private createResizeHandles(): void {
    this.clearResizeHandles();
    if (this.data.resizable === false) return;

    const handles = [
      'pegboard-resize-handle-nw',
      'pegboard-resize-handle-ne',
      'pegboard-resize-handle-sw',
      'pegboard-resize-handle-se',
      'pegboard-resize-handle-n',
      'pegboard-resize-handle-s',
      'pegboard-resize-handle-w',
      'pegboard-resize-handle-e',
    ];

    handles.forEach((className) => {
      const handle = createElement('div', className, this.element);
      // 스타일은 CSS에서
      this.positionResizeHandle(handle, className);
      this.resizeHandles.push(handle);
    });
  }

  private positionResizeHandle(handle: HTMLElement, className: string): void {
    // 위치는 CSS에서 처리. 여기서는 의미상 클래스를 보정만 할 수 있음.
  }

  private clearResizeHandles(): void {
    this.resizeHandles.forEach((handle) => handle.remove());
    this.resizeHandles = [];
  }

  private updateElement(): void {
    const { position, size } = this.data;
    this.element.style.removeProperty('grid-area');
    const gridColumnValue = `${position.x} / span ${size.width}`;
    const gridRowValue = `${position.y} / span ${size.height}`;
    this.element.style.setProperty('grid-column', gridColumnValue, 'important');
    this.element.style.setProperty('grid-row', gridRowValue, 'important');
    this.element.style.setProperty('z-index', position.zIndex.toString(), 'important');
  }

  setPosition(position: GridPosition): void {
    this.data.position = { ...position };
    this.updateElement();
  }

  setSize(size: GridSize): void {
    this.data.size = { ...size };
    this.updateElement();
  }

  setAttributes(attributes: Record<string, any>): void {
    this.data.attributes = { ...this.data.attributes, ...attributes };
  }

  setConstraints(constraints: GridSizeConstraints | undefined): void {
    this.data.constraints = constraints;
  }

  setSelected(selected: boolean): void {
    this.element.classList.toggle('pegboard-block-selected', !!selected);
    if (selected) {
      this.createResizeHandles();
    } else {
      this.clearResizeHandles();
    }
  }

  setEditable(isEditable: boolean): void {
    this.element.classList.toggle('pegboard-block-editor', !!isEditable);
    // 커서는 CSS에서 [data-movable=false] 등으로 제어 가능하게 위임
  }

  setInteractionFlags(flags: { movable?: boolean; resizable?: boolean }) {
    this.data.movable = flags.movable ?? this.data.movable;
    this.data.resizable = flags.resizable ?? this.data.resizable;
    // immovable 표시를 위해 data-attr 토글(스타일은 CSS에서)
    if (this.data.movable === false) this.element.dataset.movable = 'false';
    else delete this.element.dataset.movable;
  }

  // Edit mode support
  setSupportsEditMode(supported: boolean) {
    this.supportsEditMode = !!supported;
    if (this.supportsEditMode) this.element.dataset.allowEdit = 'true';
    else delete this.element.dataset.allowEdit;
  }

  getSupportsEditMode(): boolean {
    return this.supportsEditMode;
  }

  setEditing(editing: boolean) {
    if (!this.supportsEditMode && editing) return; // ignore enter if not supported
    this.editing = !!editing;
    this.element.classList.toggle('pegboard-block-editing', this.editing);
    // 편집 중에는 리사이즈 핸들 숨김(시각적/상호작용 충돌 방지)
    if (this.editing) this.clearResizeHandles();
  }

  isEditing(): boolean {
    return this.editing;
  }

  getData(): BlockData {
    return { ...this.data };
  }

  getElement(): HTMLElement {
    return this.element;
  }

  getContentElement(): HTMLElement {
    return this.contentElement;
  }

  getResizeHandles(): HTMLElement[] {
    return [...this.resizeHandles];
  }

  getBoundingRect(): DOMRect {
    return this.element.getBoundingClientRect();
  }

  getGridArea(): {
    column: number;
    row: number;
    columnSpan: number;
    rowSpan: number;
  } {
    return {
      column: this.data.position.x,
      row: this.data.position.y,
      columnSpan: this.data.size.width,
      rowSpan: this.data.size.height,
    };
  }

  destroy(): void {
    this.clearResizeHandles();
    this.element.remove();
  }
}
