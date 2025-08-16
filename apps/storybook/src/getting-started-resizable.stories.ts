import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Getting Started/Resizable',
};
export default meta;

export const Resizable: StoryObj = {
  render: () => {
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

    // Resizable A
    pegboard.addBlock({
      type: 'box',
      position: { x: 2, y: 2, zIndex: 1 },
      size: { width: 3, height: 2 },
      attributes: { text: 'Resizable', color: 'hsl(140,70%,55%)' },
      resizable: true,
    });

    // Non-resizable B
    pegboard.addBlock({
      type: 'box',
      position: { x: 7, y: 2, zIndex: 2 },
      size: { width: 4, height: 3 },
      attributes: { text: 'Non-resizable', color: 'hsl(330,70%,60%)' },
      resizable: false,
    });

    return root;
  },
};
