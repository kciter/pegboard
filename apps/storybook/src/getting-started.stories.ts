import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard, BlockExtension, BlockData } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Getting Started/Basic Editor',
};
export default meta;

type Story = StoryObj;

export const BasicEditor: Story = {
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
      attributes: {
        text: 'Box',
        color: randomColor(),
      },
    });

    return root;
  },
};
