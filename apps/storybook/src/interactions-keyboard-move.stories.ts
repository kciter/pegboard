import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface KeyboardMoveArgs {
  keyboardMove: boolean;
}

const meta: Meta<KeyboardMoveArgs> = {
  title: 'Interactions/Keyboard Move',
  argTypes: {
    keyboardMove: { control: 'boolean' },
  },
  args: {
    keyboardMove: true,
  },
};
export default meta;

export const KeyboardMove: StoryObj<KeyboardMoveArgs> = {
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
      autoArrange: false,
      keyboardMove: !!args.keyboardMove,
      keyboardDelete: false,
    });

    pegboard.registerPlugin(new BoxBlock());

    pegboard.addBlock({
      type: 'box',
      size: { width: 2, height: 2 },
    });

    return root;
  },
};
