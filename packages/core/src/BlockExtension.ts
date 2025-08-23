import type { BlockData } from './types';

export abstract class BlockExtension<Attrs extends Record<string, any>> {
  abstract readonly type: string;
  readonly defaultAttributes?: Attrs;
  readonly allowEditMode?: boolean;

  // render method to be implemented by subclasses
  abstract render(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;

  // lifecycle hooks
  onCreate?(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;
  onDestroy?(data: BlockData<Attrs>): void;
  onBeforeRender?(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;
  onAfterRender?(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;
  onUpdateAttributes?(data: BlockData<Attrs>, container: HTMLElement, isEditorMode: boolean): void;
  onEnterEditMode?(data: BlockData<Attrs>, container: HTMLElement): void;
  onExitEditMode?(data: BlockData<Attrs>, container: HTMLElement): void;
}
