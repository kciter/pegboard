import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface UndoRedoArgs {
  allowOverlap: boolean;
  autoArrange: boolean;
}

const meta: Meta<UndoRedoArgs> = {
  title: 'Samples/Undo & Redo',
  argTypes: {
    allowOverlap: { control: 'boolean' },
    autoArrange: { control: 'boolean' },
  },
  args: {
    allowOverlap: false,
    autoArrange: false,
  },
};
export default meta;

export const UndoRedo: StoryObj<UndoRedoArgs> = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '8px';

    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Undo';
    undoBtn.style.padding = '6px 10px';
    undoBtn.disabled = true;

    const redoBtn = document.createElement('button');
    redoBtn.textContent = 'Redo';
    redoBtn.style.padding = '6px 10px';
    redoBtn.disabled = true;

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Block';
    addBtn.style.padding = '6px 10px';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.padding = '6px 10px';

    toolbar.appendChild(undoBtn);
    toolbar.appendChild(redoBtn);
    toolbar.appendChild(addBtn);
    toolbar.appendChild(clearBtn);
    root.appendChild(toolbar);

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: !!args.allowOverlap,
      autoArrange: !!args.autoArrange,
      arrangeAnimationMs: 160,
    });

    pegboard.registerExtension(new BoxBlock());

    // Seed blocks
    const colors = ['#ff7875', '#95de64', '#69c0ff'];
    for (let i = 0; i < 3; i++) {
      pegboard.addBlock({
        type: 'box',
        position: { x: 1 + i * 4, y: 1, zIndex: i + 1 },
        size: { width: 3, height: 2 },
        attributes: { text: `Box ${i + 1}`, color: colors[i % colors.length] },
      });
    }

    // History stacks
    const undoStack: string[] = [];
    const redoStack: string[] = [];
    const MAX_HISTORY = 100;
    let isRestoring = false;

    const updateButtons = () => {
      undoBtn.disabled = undoStack.length <= 1; // at least one previous state
      redoBtn.disabled = redoStack.length === 0;
    };

    const pushSnapshot = () => {
      if (isRestoring) return; // skip capturing during import
      try {
        const json = pegboard.exportJSON(false);
        // Avoid duplicate consecutive states
        if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== json) {
          undoStack.push(json);
          if (undoStack.length > MAX_HISTORY) undoStack.shift();
          // any new action invalidates redo branch
          redoStack.length = 0;
          updateButtons();
        }
      } catch (e) {
        // no-op
      }
    };

    // Capture state after mutating events
    const captureEvents = [
      'block:added',
      'block:removed',
      'block:moved',
      'block:resized',
      'block:updated',
      'grid:changed',
    ] as const;
    captureEvents.forEach((ev) => pegboard.on(ev as any, pushSnapshot));

    // Initial snapshot
    pushSnapshot();

    // Commands
    undoBtn.onclick = () => {
      if (undoStack.length <= 1) return;
      const current = undoStack.pop()!; // move current to redo
      redoStack.push(current);
      const previous = undoStack[undoStack.length - 1];
      if (!previous) return;
      isRestoring = true;
      try {
        pegboard.importJSON(previous);
      } finally {
        isRestoring = false;
        updateButtons();
      }
    };

    redoBtn.onclick = () => {
      if (redoStack.length === 0) return;
      const next = redoStack.pop()!;
      isRestoring = true;
      try {
        pegboard.importJSON(next);
      } finally {
        isRestoring = false;
        // import 완료 후 redo된 상태를 현재로 반영
        undoStack.push(next);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        updateButtons();
      }
    };

    const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;

    addBtn.onclick = () => {
      const w = rand(2, 4);
      const h = rand(1, 3);
      try {
        pegboard.addBlock({
          type: 'box',
          position: { x: 1, y: 1, zIndex: 1 },
          size: { width: w, height: h },
          attributes: { text: 'Box', color: randomColor() },
        });
      } catch (e) {
        alert((e as Error).message);
      }
    };

    clearBtn.onclick = () => {
      pegboard.clear();
    };

    return root;
  },
};

UndoRedo.storyName = 'Undo & Redo';
