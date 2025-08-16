import { BlockData, BlockExtension } from '@pegboard/core';
import Chart from 'chart.js/auto';

export interface ChartLineAttrs {
  label: string;
  values: number[]; // normalized 0..1 recommended
  color?: string;
}

export class ChartLineBlock extends BlockExtension<ChartLineAttrs> {
  readonly type = 'chart-line';
  readonly defaultAttributes = { label: 'Series', values: [] as number[] };

  render(data: BlockData<ChartLineAttrs>, container: HTMLElement) {
    // Destroy previous chart if present
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

    root.appendChild(title);
    root.appendChild(canvas);

    container.innerHTML = '';
    container.appendChild(root);

    const vals = (data.attributes.values || []).slice(-60);
    const labels = vals.map((_, i) => String(i + 1));
    const color = data.attributes.color || 'hsl(205,70%,55%)';

    const chart = new Chart(canvas.getContext('2d')!, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: vals,
            borderColor: color,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.35,
            fill: false,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false, min: 0, max: 1 },
        },
      } as any,
    });

    (container as any).__chartInstance = chart;
  }
}
