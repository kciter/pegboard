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

export abstract class BlockExtension<Attrs extends Record<string, any>> {
  abstract readonly type: string;
  readonly defaultLayout?: BlockLayout;
  readonly defaultAttributes?: Attrs;
  constructor() {}

  /**
   * Must render the block content into the container
   */
  abstract render(
    data: BlockData & { attributes: Attrs },
    container: HTMLElement,
    isEditorMode: boolean,
  ): void;

  // Lifecycle hooks
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
