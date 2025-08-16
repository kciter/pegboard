import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard, BlockExtension, BlockData } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Getting Started/Constraints Size',
};
export default meta;

export const ConstraintsSize: StoryObj = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: false,
    });

    pegboard.registerExtension(new BoxBlock());

    pegboard.addBlock({
      type: 'box',
      position: { x: 2, y: 2, zIndex: 1 },
      size: { width: 4, height: 2 },
      constraints: {
        minWidth: 2,
        minHeight: 2,
        maxWidth: 4,
        maxHeight: 4,
      },
      attributes: { text: 'Box 1 (min 2x2, max 4x4)', color: 'hsl(200,70%,55%)' },
    });

    pegboard.addBlock({
      type: 'box',
      position: { x: 7, y: 2, zIndex: 2 },
      size: { width: 3, height: 2 },
      constraints: {
        minWidth: 3,
        minHeight: 2,
        maxWidth: 5,
        maxHeight: 3,
      },
      attributes: { text: 'Box 2 (min 3x2, max 5x3)', color: 'hsl(10,70%,60%)' },
    });

    return root;
  },
};
