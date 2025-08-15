import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface DeleteBlockArgs {
  keyboardDelete: boolean;
}

const meta: Meta<DeleteBlockArgs> = {
  title: 'Interactions/Delete Block',
  argTypes: {
    keyboardDelete: { control: 'boolean' },
  },
  args: {
    keyboardDelete: true,
  },
};
export default meta;

export const DeleteBlock: StoryObj<DeleteBlockArgs> = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '8px';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Block';
    addBtn.style.padding = '6px 10px';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Selected';
    deleteBtn.style.padding = '6px 10px';
    deleteBtn.disabled = true;

    toolbar.appendChild(addBtn);
    toolbar.appendChild(deleteBtn);
    root.appendChild(toolbar);

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: false,
      autoArrange: false,
      keyboardMove: false, // 이동은 이 스토리에서 비활성화
      keyboardDelete: !!args.keyboardDelete,
    });

    pegboard.registerPlugin(new BoxBlock());

    // 선택 상태 관리하여 버튼 활성화
    let selectedIds: string[] = [];
    pegboard.on('selection:changed', ({ ids }) => {
      selectedIds = ids;
      deleteBtn.disabled = ids.length === 0;
    });

    // 초기 블럭 세 개 추가
    const colors = ['#ff7875', '#95de64', '#69c0ff'];
    for (let i = 0; i < 3; i++) {
      pegboard.addBlock({
        type: 'box',
        size: { width: 3, height: 2 },
        attributes: { text: `Box ${i + 1}`, color: colors[i % colors.length] },
      });
    }

    addBtn.onclick = () => {
      pegboard.addBlock({
        type: 'box',
        size: { width: 2, height: 2 },
        attributes: { text: 'New', color: `hsl(${Math.floor(Math.random() * 360)},70%,60%)` },
      });
    };

    deleteBtn.onclick = () => {
      if (selectedIds.length === 0) return;
      selectedIds.forEach((id) => pegboard.removeBlock(id));
    };

    return root;
  },
};
