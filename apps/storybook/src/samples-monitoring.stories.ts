import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';
import { DonutBlock } from './blocks/donut-block';
import { ChartDoughnutBlock } from './blocks/chart-doughnut-block';
import { SparklineBlock } from './blocks/sparkline-block';
import { ChartLineBlock } from './blocks/chart-line-block';
import { LogsBlock } from './blocks/logs-block';
import { AlertsBlock } from './blocks/alerts-block';
import '../src/styles/monitoring-theme.css';

const meta: Meta = {
  title: 'Samples/Monitoring',
};
export default meta;

export const Monitoring: StoryObj = {
  render: () => {
    const root = document.createElement('div');
    root.className = 'monitoring-theme';
    root.style.position = 'fixed';
    root.style.top = '0';
    root.style.left = '0';
    root.style.right = '0';
    root.style.bottom = '0';

    const container = document.createElement('div');
    container.style.maxWidth = '1200px';
    container.style.margin = '24px auto';
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 14, rowHeight: 56, gap: 8 },
      editable: true,
      allowOverlap: false,
      dragReflow: 'axis-shift',
    });

    pegboard.registerExtension(new BoxBlock());
    pegboard.registerExtension(new DonutBlock());
    pegboard.registerExtension(new ChartDoughnutBlock());
    pegboard.registerExtension(new SparklineBlock());
    pegboard.registerExtension(new ChartLineBlock());
    pegboard.registerExtension(new LogsBlock());
    pegboard.registerExtension(new AlertsBlock());

    // Top charts (donut + sparkline)
    pegboard.addBlock({
      type: 'chart-doughnut',
      position: { x: 1, y: 1, zIndex: 2 },
      size: { width: 4, height: 4 },
      constraints: { minWidth: 3, minHeight: 3, maxWidth: 6, maxHeight: 6 },
      attributes: { label: 'CPU', percent: 62, color: 'hsl(205,70%,50%)' },
    });
    pegboard.addBlock({
      type: 'chart-doughnut',
      position: { x: 5, y: 1, zIndex: 2 },
      size: { width: 4, height: 4 },
      constraints: { minWidth: 3, minHeight: 3, maxWidth: 6, maxHeight: 6 },
      attributes: { label: 'Memory', percent: 73, color: 'hsl(135,60%,45%)' },
    });
    pegboard.addBlock({
      type: 'chart-line',
      position: { x: 9, y: 1, zIndex: 1 },
      size: { width: 4, height: 4 },
      constraints: { minWidth: 4, minHeight: 3, maxWidth: 6, maxHeight: 6 },
      attributes: {
        label: 'RPS',
        values: Array.from({ length: 60 }, (_, i) => 0.5 + 0.4 * Math.sin(i / 6)),
        color: 'hsl(265,60%,60%)',
      },
    });

    // Middle KPIs (sparklines)
    pegboard.addBlock({
      type: 'chart-line',
      position: { x: 1, y: 5, zIndex: 1 },
      size: { width: 4, height: 3 },
      constraints: { minWidth: 3, minHeight: 2, maxWidth: 6, maxHeight: 4 },
      attributes: {
        label: 'Error Rate',
        values: Array.from({ length: 60 }, (_, i) => 0.1 + 0.05 * Math.sin(i / 4)),
        color: 'hsl(5,75%,55%)',
      },
    });
    pegboard.addBlock({
      type: 'chart-line',
      position: { x: 5, y: 5, zIndex: 1 },
      size: { width: 4, height: 3 },
      constraints: { minWidth: 3, minHeight: 2, maxWidth: 6, maxHeight: 4 },
      attributes: {
        label: 'Latency (p95)',
        values: Array.from({ length: 60 }, (_, i) => 0.4 + 0.1 * Math.sin(i / 8)),
        color: 'hsl(30,80%,55%)',
      },
    });
    pegboard.addBlock({
      type: 'chart-line',
      position: { x: 9, y: 5, zIndex: 1 },
      size: { width: 4, height: 3 },
      constraints: { minWidth: 3, minHeight: 2, maxWidth: 6, maxHeight: 4 },
      attributes: {
        label: 'Traffic (RPS)',
        values: Array.from({ length: 60 }, (_, i) => 0.5 + 0.2 * Math.sin(i / 5)),
        color: 'hsl(265,60%,60%)',
      },
    });

    // Bottom area (logs + alerts)
    pegboard.addBlock({
      type: 'logs',
      position: { x: 1, y: 8, zIndex: 1 },
      size: { width: 8, height: 6 },
      constraints: { minWidth: 6, minHeight: 6, maxWidth: 12, maxHeight: 12 },
      attributes: {
        title: 'Logs',
        lines: Array.from(
          { length: 40 },
          (_, i) => `${new Date().toISOString()} INFO request id=${1000 + i} status=200`,
        ),
      },
    });
    pegboard.addBlock({
      type: 'alerts',
      position: { x: 9, y: 8, zIndex: 1 },
      size: { width: 4, height: 6 },
      constraints: { minWidth: 3, minHeight: 6, maxWidth: 6, maxHeight: 14 },
      attributes: {
        title: 'Alerts',
        alerts: [
          { level: 'warn', message: 'High latency on api-gateway (p95 > 800ms)' },
          { level: 'error', message: 'Pod restart loop detected in orders-service' },
          { level: 'info', message: 'Deploy completed: web-frontend v1.2.3' },
        ],
      },
    });

    return root;
  },
};
