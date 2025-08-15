import { BlockData, GridPosition, GridSize, Position } from './types';
import { createElement } from './utils';

export class Block {
  private element: HTMLElement;
  private contentElement: HTMLElement;
  private resizeHandles: HTMLElement[] = [];

  constructor(private data: BlockData) {
    this.element = this.createElement();
    this.contentElement = createElement('div', 'pegboard-block-content', this.element);

    // 기본 콘텐츠 컨테이너 스타일: 플러그인에서 100% 높이/절대배치 등을 안정적으로 사용하도록
    this.contentElement.style.position = 'relative';
    this.contentElement.style.width = '100%';
    this.contentElement.style.height = '100%';
    this.contentElement.style.boxSizing = 'border-box';

    this.updateElement();
  }

  private createElement(): HTMLElement {
    const element = createElement('div', 'pegboard-block');
    element.dataset.blockId = this.data.id;
    element.dataset.blockType = this.data.type;

    // Grid 아이템 내부에서 resize handle 절대배치 위한 relative
    element.style.position = 'relative';
    element.style.boxSizing = 'border-box';
    element.style.userSelect = 'none';

    return element;
  }

  private createResizeHandles(): void {
    this.clearResizeHandles();

    // resizable=false면 핸들 생성 안 함
    if (this.data.resizable === false) return;

    const handles = [
      { class: 'pegboard-resize-handle-nw', cursor: 'nw-resize' },
      { class: 'pegboard-resize-handle-ne', cursor: 'ne-resize' },
      { class: 'pegboard-resize-handle-sw', cursor: 'sw-resize' },
      { class: 'pegboard-resize-handle-se', cursor: 'se-resize' },
      { class: 'pegboard-resize-handle-n', cursor: 'n-resize' },
      { class: 'pegboard-resize-handle-s', cursor: 's-resize' },
      { class: 'pegboard-resize-handle-w', cursor: 'w-resize' },
      { class: 'pegboard-resize-handle-e', cursor: 'e-resize' },
    ];

    handles.forEach(({ class: className, cursor }) => {
      const handle = createElement('div', className, this.element);
      handle.style.position = 'absolute';
      handle.style.cursor = cursor;
      handle.style.width = '8px';
      handle.style.height = '8px';
      handle.style.backgroundColor = '#007acc';
      handle.style.border = '1px solid #fff';
      handle.style.borderRadius = '2px';
      handle.style.zIndex = '1000';

      this.positionResizeHandle(handle, className);
      this.resizeHandles.push(handle);
    });
  }

  private positionResizeHandle(handle: HTMLElement, className: string): void {
    const offset = '-4px';

    switch (className) {
      case 'pegboard-resize-handle-nw':
        handle.style.top = offset;
        handle.style.left = offset;
        break;
      case 'pegboard-resize-handle-ne':
        handle.style.top = offset;
        handle.style.right = offset;
        break;
      case 'pegboard-resize-handle-sw':
        handle.style.bottom = offset;
        handle.style.left = offset;
        break;
      case 'pegboard-resize-handle-se':
        handle.style.bottom = offset;
        handle.style.right = offset;
        break;
      case 'pegboard-resize-handle-n':
        handle.style.top = offset;
        handle.style.left = '50%';
        handle.style.transform = 'translateX(-50%)';
        break;
      case 'pegboard-resize-handle-s':
        handle.style.bottom = offset;
        handle.style.left = '50%';
        handle.style.transform = 'translateX(-50%)';
        break;
      case 'pegboard-resize-handle-w':
        handle.style.left = offset;
        handle.style.top = '50%';
        handle.style.transform = 'translateY(-50%)';
        break;
      case 'pegboard-resize-handle-e':
        handle.style.right = offset;
        handle.style.top = '50%';
        handle.style.transform = 'translateY(-50%)';
        break;
    }
  }

  private clearResizeHandles(): void {
    this.resizeHandles.forEach((handle) => handle.remove());
    this.resizeHandles = [];
  }

  private updateElement(): void {
    const { position, size } = this.data;

    // grid 레이아웃 강제 적용
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

  setSelected(selected: boolean): void {
    if (selected) {
      this.element.classList.add('pegboard-block-selected');
      this.createResizeHandles();
    } else {
      this.element.classList.remove('pegboard-block-selected');
      this.clearResizeHandles();
    }
  }

  setEditorMode(isEditor: boolean): void {
    if (isEditor) {
      this.element.classList.add('pegboard-block-editor');
      // movable=false면 move 커서를 강제하지 않음
      this.element.style.cursor = this.data.movable === false ? 'default' : 'move';
    } else {
      this.element.classList.remove('pegboard-block-editor');
      this.element.style.cursor = 'default';
      this.clearResizeHandles();
    }
  }

  setInteractionFlags(flags: { movable?: boolean; resizable?: boolean }) {
    this.data.movable = flags.movable ?? this.data.movable;
    this.data.resizable = flags.resizable ?? this.data.resizable;
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
