import { BlockData } from './types';

export interface BlockLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

// 필드 오버라이드 패턴: 서브클래스에서 type / defaultLayout / defaultAttributes를 직접 정의
export abstract class BlockExtension<Attrs extends Record<string, any> = Record<string, any>> {
  abstract readonly type: string; // 반드시 서브클래스에서 제공
  readonly defaultLayout?: BlockLayout; // 선택적으로 서브클래스에서 제공 (제약 포함)
  readonly defaultAttributes?: Attrs; // 선택적으로 서브클래스에서 제공
  constructor() {}

  /**
   * Must render the block content into the container (replace or mutate as desired).
   */
  abstract render(
    data: BlockData & { attributes: Attrs },
    container: HTMLElement,
    isEditorMode: boolean,
  ): void;

  // Lifecycle hooks (no-op by default)
  onCreate?(
    data: BlockData & { attributes: Attrs },
    container: HTMLElement,
    isEditorMode: boolean,
  ): void;
  onDestroy?(data: BlockData & { attributes: Attrs }): void;
  onBeforeRender?(
    data: BlockData & { attributes: Attrs },
    container: HTMLElement,
    isEditorMode: boolean,
  ): void;
  onAfterRender?(
    data: BlockData & { attributes: Attrs },
    container: HTMLElement,
    isEditorMode: boolean,
  ): void;
  onUpdateAttributes?(
    data: BlockData & { attributes: Attrs },
    container: HTMLElement,
    isEditorMode: boolean,
  ): void;
}

export type AnyBlockExtension = BlockExtension<any>;
