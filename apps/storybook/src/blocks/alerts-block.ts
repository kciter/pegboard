import { BlockData, BlockExtension } from '@pegboard/core';

export interface AlertsBlockAttributes {
  title: string;
  alerts: { level: 'info' | 'warn' | 'error'; message: string }[];
}

export class AlertsBlock extends BlockExtension<AlertsBlockAttributes> {
  readonly type = 'alerts';
  readonly defaultAttributes = {
    title: 'Alerts',
    alerts: [] as { level: 'info' | 'warn' | 'error'; message: string }[],
  };

  render(data: BlockData & { attributes: AlertsBlockAttributes }, container: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'metric-card';

    const header = document.createElement('div');
    header.className = 'metric-title';
    header.textContent = data.attributes.title;

    const list = document.createElement('div');
    list.className = 'alerts-list';

    const items = data.attributes.alerts || [];
    for (const a of items) {
      const row = document.createElement('div');
      row.textContent = a.message;
      row.className = `alert-item ${
        a.level === 'info' ? 'alert-info' : a.level === 'warn' ? 'alert-warn' : 'alert-error'
      }`;
      list.appendChild(row);
    }

    root.appendChild(header);
    root.appendChild(list);
    container.innerHTML = '';
    container.appendChild(root);
  }
}
