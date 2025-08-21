export type {
  BlockOperationResult,
  BlockValidationResult,
} from './BlockManager';

export type {
  SelectionState,
  SelectionChangeEvent,
} from './SelectionManager';

export type { IPreviewStrategy } from './PreviewManager';
export type { 
  ITransitioner, 
  BlockChange, 
  BlockMove, 
  BlockResize, 
  BlockAdd, 
  BlockRemove,
  ChangeSet,
  TransitionStrategy,
  FLIPConfig 
} from './TransitionManager';

export { BlockManager } from './BlockManager';
export { SelectionManager } from './SelectionManager';
export { PreviewManager, DomHintPreview } from './PreviewManager';
export { TransitionManager, FLIPTransitioner } from './TransitionManager';