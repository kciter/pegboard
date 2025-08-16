import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Grid & Layout/Grid Overlay',
};
export default meta;

type Mode = 'always' | 'never' | 'active';

export const GridOverlay: StoryObj<{ mode: Mode }> = {
  argTypes: {
    mode: {
      control: { type: 'select' },
      options: ['always', 'never', 'active'],
    },
  },
  args: {
    mode: 'active',
  },
  render: (args) => {
    const mode = (args.mode || 'active') as Mode;
    const root = document.createElement('div');
    root.style.width = '100%';

    const header = document.createElement('div');
    header.style.marginBottom = '8px';
    header.textContent = `overlay mode = ${mode}`;
    root.appendChild(header);

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 8, rowHeight: 48, gap: 8 },
      editable: true,
      allowOverlap: false,
      autoArrange: false,
      autoGrowRows: false,
      gridOverlayMode: mode,
    });

    pegboard.registerExtension(new BoxBlock());

    const randomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;

    // seed blocks
    pegboard.addBlock({
      type: 'box',
      position: { x: 1, y: 1, zIndex: 1 },
      size: { width: 3, height: 3 },
      attributes: { color: randomColor() },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 5, y: 2, zIndex: 2 },
      size: { width: 4, height: 2 },
      attributes: { color: randomColor() },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 10, y: 4, zIndex: 3 },
      size: { width: 3, height: 3 },
      attributes: { color: randomColor() },
    });

    return root;
  },
};
