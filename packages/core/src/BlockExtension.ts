import { BlockData } from './types';

export abstract class BlockExtension<Attrs extends Record<string, any>> {
  abstract readonly type: string;
  readonly defaultAttributes?: Attrs;
  // Opt-in: set to true if this block supports in-place edit mode
  readonly allowEditMode?: boolean;
  constructor() {}

  /**
   * Must render the block content into the container
   */
  abstract render(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;

  // Lifecycle hooks
  onCreate?(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;
  onDestroy?(data: BlockData<Attrs>): void;
  onBeforeRender?(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;
  onAfterRender?(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;
  onUpdateAttributes?(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;

  // Edit mode lifecycle (optional)
  onEnterEditMode?(data: BlockData<Attrs>, container: HTMLElement): void;
  onExitEditMode?(data: BlockData<Attrs>, container: HTMLElement): void;
}

export type AnyBlockExtension = BlockExtension<any>;
