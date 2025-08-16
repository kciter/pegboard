import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Grid & Layout/Auto Grow Rows',
};
export default meta;

export const AutoGrowRows: StoryObj = {
  render: () => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 8, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: false,
      autoArrange: false,
      autoGrowRows: true,
    });

    pegboard.registerExtension(new BoxBlock());

    const randomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;

    pegboard.addBlock({
      type: 'box',
      position: { x: 0, y: 0, zIndex: 1 },
      size: { width: 4, height: 4 },
      attributes: { color: randomColor() },
    });

    return root;
  },
};
