import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

type Reflow = 'none' | 'axis-shift';

const meta: Meta = {
  title: 'Grid & Layout/Reflow',
};
export default meta;

export const Reflow: StoryObj<{ reflow: Reflow; autoGrowRows: boolean }> = {
  argTypes: {
    reflow: {
      control: { type: 'select' },
      options: ['none', 'axis-shift'],
    },
    autoGrowRows: { control: { type: 'boolean' } },
  },
  args: {
    reflow: 'axis-shift',
    autoGrowRows: true,
  },
  render: (args) => {
    const reflow = (args.reflow || 'axis-shift') as Reflow;
    const root = document.createElement('div');
    root.style.width = '100%';

    const header = document.createElement('div');
    header.style.marginBottom = '8px';
    header.textContent = `dragReflow = ${reflow}  |  autoGrowRows=${!!args.autoGrowRows}`;
    root.appendChild(header);

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 8, rowHeight: 48, gap: 8 },
      editable: true,
      allowOverlap: false,
      autoArrange: false,
      autoGrowRows: !!args.autoGrowRows,
      dragReflow: reflow,
    });

    pegboard.registerExtension(new BoxBlock());

    const color = (h: number) => `hsl(${h}, 70%, 60%)`;

    // Seed a few blocks so dragging the leftmost down/right will collide and trigger reflow
    pegboard.addBlock({
      type: 'box',
      position: { x: 1, y: 1, zIndex: 1 },
      size: { width: 3, height: 2 },
      attributes: { color: color(10) },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 4, y: 2, zIndex: 2 },
      size: { width: 3, height: 2 },
      attributes: { color: color(200) },
    });
    pegboard.addBlock({
      type: 'box',
      position: { x: 7, y: 3, zIndex: 3 },
      size: { width: 3, height: 2 },
      attributes: { color: color(320) },
    });

    return root;
  },
};
