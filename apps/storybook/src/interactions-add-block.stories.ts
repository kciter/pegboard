import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface AddBlockArgs {
  autoArrange: boolean;
  allowOverlap: boolean;
}

const meta: Meta<AddBlockArgs> = {
  title: 'Interactions/Add Block',
  argTypes: {
    autoArrange: { control: 'boolean' },
    allowOverlap: { control: 'boolean' },
  },
  args: {
    autoArrange: false,
    allowOverlap: false,
  },
};
export default meta;

export const AddBlock: StoryObj<AddBlockArgs> = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '8px';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Block';
    addBtn.style.padding = '6px 10px';

    toolbar.appendChild(addBtn);
    root.appendChild(toolbar);

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: !!args.allowOverlap,
      autoArrange: !!args.autoArrange,
      arrangeAnimationMs: 220,
    });

    pegboard.registerExtension(new BoxBlock());

    const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;

    const addOne = () => {
      const w = rand(2, 4);
      const h = rand(1, 3);

      try {
        pegboard.addBlock({
          type: 'box',
          position: { x: 1, y: 1, zIndex: 1 },
          size: { width: w, height: h },
          attributes: { text: 'Box', color: randomColor() },
        });
      } catch (error) {
        alert((error as Error).message);
      }
    };

    addBtn.onclick = () => addOne();

    return root;
  },
};
