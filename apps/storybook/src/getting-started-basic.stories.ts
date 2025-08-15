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
    root.style.height = '600px';

    const boardHost = document.createElement('div');
    boardHost.style.height = '100%';
    root.appendChild(boardHost);

    const pegboard = new Pegboard({
      container: boardHost,
      grid: { columns: 12, rowHeight: 60, gap: 8 },
      mode: 'editor',
      allowOverlap: false,
      autoArrange: false,
    });

    pegboard.registerPlugin(new BoxBlock());

    const randomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    pegboard.addBlock({
      type: 'box',
      position: { x: 2, y: 2, zIndex: 0 },
      size: { width: 3, height: 2 },
      id: 'box-1',
      attributes: {
        text: 'Box',
        color: randomColor(),
      },
    });

    return root;
  },
};
