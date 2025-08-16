import { BlockData, BlockExtension } from '@pegboard/core';

export interface LogsBlockAttributes {
  title: string;
  lines: string[];
}

export class LogsBlock extends BlockExtension<LogsBlockAttributes> {
  readonly type = 'logs';
  readonly defaultAttributes = { title: 'Logs', lines: [] as string[] };

  render(data: BlockData & { attributes: LogsBlockAttributes }, container: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'metric-card';

    const header = document.createElement('div');
    header.className = 'metric-title';
    header.textContent = data.attributes.title;

    const list = document.createElement('div');
    list.className = 'logs-list';

    const lines = data.attributes.lines || [];
    list.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');

    root.appendChild(header);
    root.appendChild(list);

    container.innerHTML = '';
    container.appendChild(root);
  }
}
