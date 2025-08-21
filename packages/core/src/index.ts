// New Architecture (Primary)
export { Pegboard } from './Pegboard';

// New Architecture - Managers
export * from './managers';
export * from './state';
export * from './config';

// New Architecture - Event System
export * from './events';

// New Architecture - Operations & Commands
export * from './operations';

// New Architecture - Validation
export * from './validation';

// New Architecture - Scheduling (temporarily disabled due to type issues)
// export * from './scheduling';

// Core Components
export { Block } from './Block';
export { Grid } from './Grid';
export { EventEmitter } from './EventEmitter';
export { BlockExtension } from './BlockExtension';

// Legacy Support removed in refactoring

// DragManager removed - replaced by UIEventListener + DragHandler

export * from './types';
export * from './utils';
