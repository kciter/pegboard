import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Getting Started/Basic',
};
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: {
        columns: 12,
        rows: 10,
        rowHeight: 60,
        gap: 8,
      },
      allowOverlap: false,
      autoArrange: false,
    });

    pegboard.registerPlugin(new BoxBlock());

    const randomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    pegboard.addBlock({
      type: 'box',
      position: { x: 1, y: 1, zIndex: 0 },
      size: { width: 3, height: 2 },
      attributes: {
        text: 'Box',
        color: randomColor(),
      },
    });

    return root;
  },
};
