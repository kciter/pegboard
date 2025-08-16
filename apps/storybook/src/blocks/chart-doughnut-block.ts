import { BlockData, BlockExtension } from '@pegboard/core';
import Chart from 'chart.js/auto';

export interface ChartDoughnutAttrs {
  label: string;
  percent: number; // 0..100
  color?: string;
}

export class ChartDoughnutBlock extends BlockExtension<ChartDoughnutAttrs> {
  readonly type = 'chart-doughnut';
  readonly defaultAttributes = { label: 'Usage', percent: 0 } as const;

  render(data: BlockData<ChartDoughnutAttrs>, container: HTMLElement) {
    // Clean up previous chart if any
    const prev: any = (container as any).__chartInstance;
    if (prev && typeof prev.destroy === 'function') prev.destroy();

    const root = document.createElement('div');
    root.className = 'metric-card metric-card--tight';

    const title = document.createElement('div');
    title.className = 'metric-title';
    title.textContent = data.attributes.label;

    const canvas = document.createElement('canvas');
    canvas.style.flex = '1';
    canvas.style.minHeight = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    root.appendChild(title);
    root.appendChild(canvas);

    container.innerHTML = '';
    container.appendChild(root);

    const pct = Math.max(0, Math.min(100, data.attributes.percent));
    const color = data.attributes.color || 'hsl(205,70%,50%)';

    const chart = new Chart(canvas.getContext('2d')!, {
      type: 'doughnut',
      data: {
        labels: ['Used', 'Free'],
        datasets: [
          {
            data: [pct, 100 - pct],
            backgroundColor: [color, 'rgba(255,255,255,0.1)'],
            borderWidth: 0,
            hoverOffset: 0,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      } as any,
    });

    (container as any).__chartInstance = chart;
  }
}
