import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { NoteBlock } from './blocks/note-block';

const meta: Meta = {
  title: 'Interactions/Edit Mode',
};
export default meta;

export const EditMode: StoryObj = {
  render: () => {
    const root = document.createElement('div');
    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 8, rowHeight: 56, gap: 8 },
      editable: true,
      allowOverlap: false,
      keyboardMove: true,
    });

    pegboard.registerExtension(new NoteBlock());

    pegboard.addBlock({
      type: 'note',
      position: { x: 2, y: 2, zIndex: 1 },
      size: { width: 6, height: 4 },
      attributes: {
        title: 'Inline editing',
        body: 'Double-click to edit. Click outside to save & exit.',
        hue: 265,
      },
    });

    return root;
  },
};
