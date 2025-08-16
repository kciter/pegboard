import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface ExportImportArgs {
  pretty: boolean;
}

const meta: Meta<ExportImportArgs> = {
  title: 'Data/Export & Import',
  argTypes: {
    pretty: { control: 'boolean' },
  },
  args: {
    pretty: true,
  },
};
export default meta;

export const ExportAndImport: StoryObj<ExportImportArgs> = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '8px';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Block';
    addBtn.style.padding = '6px 10px';

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export JSON';
    exportBtn.style.padding = '6px 10px';

    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import JSON';
    importBtn.style.padding = '6px 10px';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.padding = '6px 10px';

    const prettyWrap = document.createElement('label');
    prettyWrap.style.display = 'inline-flex';
    prettyWrap.style.alignItems = 'center';
    prettyWrap.style.gap = '6px';
    const prettyCk = document.createElement('input');
    prettyCk.type = 'checkbox';
    prettyCk.checked = !!args.pretty;
    const prettyText = document.createElement('span');
    prettyText.textContent = 'Pretty';
    prettyWrap.appendChild(prettyCk);
    prettyWrap.appendChild(prettyText);

    toolbar.appendChild(addBtn);
    toolbar.appendChild(exportBtn);
    toolbar.appendChild(importBtn);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(prettyWrap);

    root.appendChild(toolbar);

    const container = document.createElement('div');
    root.appendChild(container);

    const jsonWrap = document.createElement('div');
    jsonWrap.style.marginTop = '8px';
    const jsonArea = document.createElement('textarea');
    jsonArea.placeholder = 'Exported JSON will appear here. Paste JSON to import...';
    jsonArea.style.width = '100%';
    jsonArea.style.height = '200px';
    jsonArea.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    jsonArea.style.fontSize = '12px';
    jsonArea.style.padding = '8px';
    jsonWrap.appendChild(jsonArea);
    root.appendChild(jsonWrap);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: false,
      autoArrange: false,
    });

    pegboard.registerExtension(new BoxBlock());

    const colors = ['#ff7875', '#95de64', '#69c0ff'];
    for (let i = 0; i < 3; i++) {
      pegboard.addBlock({
        type: 'box',
        size: { width: 3, height: 2 },
        attributes: { text: `Box ${i + 1}`, color: colors[i % colors.length] },
      });
    }

    const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;

    addBtn.onclick = () => {
      const w = rand(2, 4);
      const h = rand(1, 3);
      try {
        pegboard.addBlock({
          type: 'box',
          size: { width: w, height: h },
          attributes: { text: 'Box', color: randomColor() },
        });
      } catch (e) {
        alert((e as Error).message);
      }
    };

    exportBtn.onclick = () => {
      try {
        const json = pegboard.exportJSON(!!prettyCk.checked);
        jsonArea.value = json;
      } catch (e) {
        alert((e as Error).message);
      }
    };

    importBtn.onclick = () => {
      try {
        pegboard.importJSON(jsonArea.value || '');
      } catch (e) {
        alert((e as Error).message);
      }
    };

    clearBtn.onclick = () => {
      pegboard.clear();
    };

    return root;
  },
};

ExportAndImport.storyName = 'Export & Import';
