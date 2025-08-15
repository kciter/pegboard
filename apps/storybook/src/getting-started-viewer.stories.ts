import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Getting Started/Viewer Mode',
};
export default meta;

type Story = StoryObj;

export const ViewerMode: Story = {
  render: () => {
    const root = document.createElement('div');
    root.style.width = '100%';
    root.style.height = '480px';

    const boardHost = document.createElement('div');
    boardHost.style.height = '100%';
    root.appendChild(boardHost);

    const pegboard = new Pegboard({
      container: boardHost,
      grid: { columns: 12, rowHeight: 60, gap: 8 },
      mode: 'viewer',
      allowOverlap: false,
    });

    pegboard.registerPlugin(new BoxBlock());

    pegboard.addBlock({
      type: 'box',
      position: { x: 2, y: 2, zIndex: 1 },
      size: { width: 3, height: 2 },
      attributes: { text: 'A', color: 'hsl(210,70%,60%)' },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 6, y: 2, zIndex: 2 },
      size: { width: 4, height: 3 },
      attributes: { text: 'B', color: 'hsl(140,70%,55%)' },
    });

    return root;
  },
};
