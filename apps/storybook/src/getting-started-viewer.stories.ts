import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface ViewerArgs {
  editable: boolean;
}

const meta: Meta<ViewerArgs> = {
  title: 'Getting Started/Viewer',
  argTypes: {
    editable: { control: 'boolean' },
  },
  args: {
    editable: false,
  },
};
export default meta;

export const Viewer: StoryObj<ViewerArgs> = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rowHeight: 60, gap: 8 },
      editable: args.editable,
      allowOverlap: false,
    });

    pegboard.registerExtension(new BoxBlock());

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
