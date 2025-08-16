import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

const meta: Meta = {
  title: 'Interactions/Duplicate Block',
};
export default meta;

export const DuplicateBlock: StoryObj = {
  render: () => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '8px';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Block';
    addBtn.style.padding = '6px 10px';

    const dupBtn = document.createElement('button');
    dupBtn.textContent = 'Duplicate Selected';
    dupBtn.style.padding = '6px 10px';
    dupBtn.disabled = true;

    toolbar.appendChild(addBtn);
    toolbar.appendChild(dupBtn);
    root.appendChild(toolbar);

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: false,
      autoArrange: false,
    });

    pegboard.registerExtension(new BoxBlock());

    let selectedIds: string[] = [];
    pegboard.on('selection:changed', ({ ids }) => {
      selectedIds = ids;
      dupBtn.disabled = ids.length === 0;
    });

    const colors = ['#ffa940', '#36cfc9', '#597ef7'];
    for (let i = 0; i < 3; i++) {
      pegboard.addBlock({
        type: 'box',
        position: { x: i * 4, y: 1, zIndex: i + 1 },
        size: { width: 3, height: 2 },
        attributes: { text: `Box ${i + 1}`, color: colors[i % colors.length] },
      });
    }

    addBtn.onclick = () => {
      pegboard.addBlock({
        type: 'box',
        position: { x: 1, y: 1, zIndex: 1 },
        size: { width: 2, height: 2 },
        attributes: { text: 'New', color: `hsl(${Math.floor(Math.random() * 360)},70%,60%)` },
      });
    };

    dupBtn.onclick = () => {
      if (selectedIds.length === 0) return;
      // 여러 개 선택 시 모두 복제
      for (const id of selectedIds) {
        try {
          pegboard.duplicateBlock(id);
        } catch (e) {
          alert((e as Error).message);
        }
      }
    };

    return root;
  },
};
