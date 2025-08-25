# Pegboard Project Guide for AI Assistants

## Project Overview
**Pegboard** is a grid-based WYSIWYG editor for web applications. It provides a powerful, interactive grid system where users can place, move, resize, and manage blocks/components with drag-and-drop functionality.

- **Repository**: https://github.com/kciter/pegboard
- **Author**: Sunhyoup Lee <kciter@naver.com>
- **License**: MIT
- **Package Manager**: pnpm (version 10.10.0)

## Architecture

### Monorepo Structure
This is a **pnpm workspace** with the following structure:

```
pegboard/
├── packages/
│   ├── core/           # Core Pegboard library (@pegboard/core)
│   └── react/          # React bindings (@pegboard/react)
├── apps/
│   └── storybook/      # Storybook for demos and testing
└── internals/
    ├── builder/        # Build tooling
    ├── eslint-config/  # ESLint configuration
    └── typescript-config/ # TypeScript configuration
```

### Core Package (@pegboard/core)
The main library implementing the grid-based editor with sophisticated architecture:

**Key Components:**
- `Pegboard.ts` - Main orchestrator class using the Orchestrator pattern
- `Block.ts` - Individual blocks/components in the grid
- `Grid.ts` - Grid system management
- `EventEmitter.ts` - Event handling system

**Manager Architecture:**
- `StateManager` - Global state management
- `ConfigManager` - Configuration management
- `BlockManager` - Block lifecycle management
- `SelectionManager` - Selection handling
- `PreviewManager` - Visual previews during interactions
- `TransitionManager` - Animation and transition handling
- `ReflowPreviewManager` - Layout reflow previews

**Event System:**
- `UIEventListener` - Main UI event coordination
- `SelectionHandler` - Selection interactions
- `KeyboardHandler` - Keyboard shortcuts
- `LassoHandler` - Lasso selection
- `DragHandler` - Drag and drop operations

**Command/Operation System:**
- `CommandRunner` - Command execution and undo/redo
- `Transaction` & `TransactionContext` - Batch operations
- Commands: Add, Delete, Move, Resize, Update, Z-order, Auto-arrange, etc.

**Utilities:**
- `ReflowCalculator` - Layout calculation utilities
- `SpatialIndex` - Spatial indexing for performance
- `PerformanceTest` - Performance monitoring

### React Package (@pegboard/react)
React bindings for the core library:
- `PegboardProvider.tsx` - React context provider
- `PegboardContainer.tsx` - Main container component
- `PegboardEditor.tsx` - Editor component
- `usePegboard.ts` - React hook for Pegboard functionality

## Development Setup

### Package Management
- **Always use pnpm** - This project uses pnpm workspaces
- Install dependencies: `pnpm install`
- Run commands across workspace: `pnpm -r run <command>`

### Available Scripts
**Root level:**
- `pnpm lint` - Lint all packages
- `pnpm build` - Build all packages in parallel
- `pnpm build:storybook` - Build Storybook
- `pnpm clean` - Clean all build artifacts
- `pnpm dev:storybook` - Start Storybook development server
- `pnpm format` - Format code with Prettier

**Package level (@pegboard/core, @pegboard/react):**
- `pnpm lint` - ESLint with max 0 warnings
- `pnpm typecheck` - TypeScript type checking
- `pnpm build` - Build using internal build tool
- `pnpm clean` - Clean dist directory

### Key Development Commands
```bash
# Start development with Storybook
pnpm dev:storybook

# Build everything
pnpm build

# Type check and lint
pnpm typecheck && pnpm lint

# Format code
pnpm format
```

## Technology Stack

### Build Tools
- **TypeScript** 5.8.3 - Primary language
- **tsup** - Build tool for packages
- **esbuild** - Fast JavaScript bundler
- **Vite** - Development server for Storybook

### Development Tools
- **ESLint** 9.x with custom @chance/eslint configs
- **Prettier** for code formatting
- **Storybook** 8.x for component development and testing
- **Chromatic** for visual testing

### Frameworks
- **Vanilla TypeScript** for core library
- **React** 18.x support through bindings
- **Chart.js** for example chart components in Storybook

## Key Features

### Grid System
- Dynamic grid with customizable cell size
- Auto-growing rows
- Grid overlay and controls
- Multiple grid support

### Block Management
- Add, remove, duplicate, move, resize blocks
- Z-order management (bring to front, send to back)
- Batch operations with transactions
- Block extensions and customization

### Interactions
- Drag and drop
- Lasso selection
- Keyboard shortcuts
- Undo/redo system
- Edit mode toggle

### Layout & Performance
- Auto-arrange functionality
- Reflow system for layout optimization
- Collision detection and validation
- Spatial indexing for performance
- Concurrent task management

## Working with the Codebase

### Adding New Features
1. **Core functionality** goes in `packages/core/src/`
2. **React integration** goes in `packages/react/src/`
3. **Examples/demos** go in `apps/storybook/src/`
4. Follow the existing manager pattern for complex features
5. Use the command pattern for user actions
6. Add Storybook stories for visual testing

### Code Style
- No comments unless explicitly requested
- Use existing patterns and conventions
- Follow TypeScript strict mode
- Maintain 0 ESLint warnings
- Use the existing event system and manager architecture

### File Organization
- Keep related functionality in the same directory
- Use index files for clean imports
- Separate types, implementations, and utilities
- Follow the established manager/handler/operation patterns

### Testing
- No formal test framework setup currently
- Use Storybook stories for visual/integration testing
- Examples in `apps/storybook/src/*.stories.ts`
- Test complex interactions through Storybook

## Common Tasks

### Running Lint and Type Check
```bash
# From root
pnpm lint
pnpm -r run typecheck

# Individual packages
cd packages/core && pnpm lint && pnpm typecheck
cd packages/react && pnpm lint && pnpm typecheck
```

### Building
```bash
# Build all packages
pnpm build

# Build specific package
cd packages/core && pnpm build
```

### Development Workflow
1. Start Storybook: `pnpm dev:storybook`
2. Make changes to packages
3. View changes in Storybook (hot reload enabled)
4. Run lint/typecheck before committing
5. Build to verify everything works

## Important Notes

### Performance Considerations
- The codebase uses sophisticated performance optimizations
- Spatial indexing for collision detection
- Frame scheduling for smooth animations
- Concurrent task management for heavy operations

### State Management
- Uses custom StateManager instead of external state libraries
- Transaction system for batch operations
- Event-driven architecture throughout

### Extensibility
- BlockExtension system for custom block types
- Command pattern makes adding new operations straightforward
- Manager pattern allows for feature isolation

### Browser Compatibility
- Modern browser features assumed (ES2020+)
- No specific IE support mentioned
- Uses native DOM APIs extensively

## Storybook Examples
The `apps/storybook/src/` directory contains comprehensive examples:
- Basic usage patterns
- Advanced interactions
- Layout management
- Performance demonstrations
- Custom block implementations

These stories serve as both documentation and testing for the library's capabilities.
