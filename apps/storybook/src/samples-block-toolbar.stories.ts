import type { Meta, StoryObj } from '@storybook/html';
import { Pegboard } from '@pegboard/core';
import { BoxBlock } from './blocks/box-block';

interface BlockToolbarArgs {
  allowOverlap: boolean;
  autoArrange: boolean;
}

const meta: Meta<BlockToolbarArgs> = {
  title: 'Samples/Block Toolbar',
  argTypes: {
    allowOverlap: { control: 'boolean' },
    autoArrange: { control: 'boolean' },
  },
  args: {
    allowOverlap: false,
    autoArrange: false,
  },
};
export default meta;

export const BlockToolbar: StoryObj<BlockToolbarArgs> = {
  render: (args) => {
    const root = document.createElement('div');
    root.style.width = '100%';

    const container = document.createElement('div');
    root.appendChild(container);

    const pegboard = new Pegboard({
      container,
      grid: { columns: 12, rows: 10, rowHeight: 60, gap: 8 },
      editable: true,
      allowOverlap: !!args.allowOverlap,
      autoArrange: !!args.autoArrange,
      arrangeAnimationMs: 160,
      gridOverlayMode: 'active',
    });

    pegboard.registerExtension(new BoxBlock());

    // Seed blocks
    const colors = ['#ff7875', '#95de64', '#69c0ff', '#ffd666'];
    for (let i = 0; i < 4; i++) {
      pegboard.addBlock({
        type: 'box',
        position: { x: 1 + (i % 2) * 6, y: 1 + Math.floor(i / 2) * 3, zIndex: i + 1 },
        size: { width: 5, height: 2 },
        attributes: { text: `Box ${i + 1}`, color: colors[i % colors.length] },
      });
    }

    // Floating toolbar
    const toolbar = document.createElement('div');
    toolbar.style.position = 'absolute';
    toolbar.style.display = 'none';
    toolbar.style.padding = '6px 8px';
    toolbar.style.borderRadius = '6px';
    toolbar.style.background = 'rgba(32, 32, 32, 0.9)';
    toolbar.style.color = '#fff';
    toolbar.style.fontSize = '12px';
    toolbar.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
    toolbar.style.gap = '6px';
    toolbar.style.alignItems = 'center';
    toolbar.style.zIndex = '10000';
    toolbar.style.pointerEvents = 'auto';
    toolbar.style.userSelect = 'none';
    toolbar.style.whiteSpace = 'nowrap';

    const makeBtn = (label: string) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.background = '#fff';
      b.style.color = '#333';
      b.style.border = '1px solid #ddd';
      b.style.borderRadius = '4px';
      b.style.padding = '4px 8px';
      b.style.fontSize = '12px';
      b.style.cursor = 'pointer';
      return b;
    };

    const btnFront = makeBtn('Front');
    const btnForward = makeBtn('Forward');
    const btnBackward = makeBtn('Backward');
    const btnBack = makeBtn('Back');
    const btnColor = makeBtn('Random Color');

    [btnFront, btnForward, btnBackward, btnBack, btnColor].forEach((b) => {
      b.onmousedown = (e) => e.stopPropagation();
      b.onclick = (e) => e.stopPropagation();
      toolbar.appendChild(b);
    });

    container.appendChild(toolbar);

    let currentId: string | null = null;
    let dragging = false;
    let followRaf: number | null = null;

    const stopFollowing = () => {
      if (followRaf != null) {
        cancelAnimationFrame(followRaf);
        followRaf = null;
      }
    };

    const followFor = (ms: number) => {
      stopFollowing();
      const start = performance.now();
      const tick = () => {
        if (!currentId) {
          stopFollowing();
          return;
        }
        positionToolbar();
        if (performance.now() - start < ms) {
          followRaf = requestAnimationFrame(tick);
        } else {
          stopFollowing();
        }
      };
      followRaf = requestAnimationFrame(tick);
    };

    const positionToolbar = () => {
      if (!currentId) {
        toolbar.style.display = 'none';
        return;
      }
      const blockEl = container.querySelector(
        `.pegboard-block[data-block-id="${currentId}"]`,
      ) as HTMLElement | null;
      if (!blockEl) {
        toolbar.style.display = 'none';
        return;
      }
      if (dragging) {
        // 드래그 중에는 숨김(미리보기 따라가도록 바꾸고 싶으면 여기서 위치만 갱신)
        toolbar.style.display = 'none';
        return;
      }
      const contRect = container.getBoundingClientRect();
      const rect = blockEl.getBoundingClientRect();
      // 처음 표시될 때 offsetWidth/Height가 0인 문제를 피하기 위한 가시성 트릭
      const wasHidden = toolbar.style.display === 'none';
      if (wasHidden) {
        toolbar.style.display = 'flex';
        toolbar.style.visibility = 'hidden';
        // 레이아웃 점프 방지용 임시 위치
        toolbar.style.left = '-9999px';
        toolbar.style.top = '-9999px';
      }
      const pad = 6;
      // place toolbar centered above the block
      const left = rect.left - contRect.left + rect.width / 2 - toolbar.offsetWidth / 2;
      const top = rect.top - contRect.top - toolbar.offsetHeight - pad;
      toolbar.style.left = `${Math.max(0, left)}px`;
      toolbar.style.top = `${Math.max(0, top)}px`;
      if (wasHidden) {
        // 최종 위치가 잡힌 뒤 표시
        toolbar.style.visibility = '';
      }
      toolbar.style.display = 'flex';
    };

    pegboard.on('block:selected', ({ block }) => {
      currentId = block ? block.id : null;
      positionToolbar();
    });

    pegboard.on('block:moved', () => {
      // 드롭 후 FLIP 애니메이션을 따라 짧게 추적
      dragging = false;
      positionToolbar();
      followFor(240);
    });

    pegboard.on('block:resized', () => {
      positionToolbar();
    });

    pegboard.on('block:removed', ({ blockId }) => {
      if (currentId === blockId) {
        currentId = null;
        toolbar.style.display = 'none';
      }
    });

    const randomColor = () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;

    btnFront.onclick = () => {
      if (!currentId) return;
      pegboard.bringToFront(currentId);
      positionToolbar();
    };

    btnForward.onclick = () => {
      if (!currentId) return;
      pegboard.bringForward(currentId);
      positionToolbar();
    };

    btnBackward.onclick = () => {
      if (!currentId) return;
      pegboard.sendBackward(currentId);
      positionToolbar();
    };

    btnBack.onclick = () => {
      if (!currentId) return;
      pegboard.sendToBack(currentId);
      positionToolbar();
    };

    btnColor.onclick = () => {
      if (!currentId) return;
      const block = pegboard.getBlock(currentId);
      if (!block) return;
      pegboard.updateBlock(currentId, {
        attributes: { ...block.attributes, color: randomColor() },
      } as any);
      // no need to reposition
    };

    // Reposition on window resize as well
    const onResize = () => positionToolbar();
    window.addEventListener('resize', onResize);

    // 드래그 상호작용 상태에 따라 표시/추적 제어
    pegboard.on('interaction:active' as any, () => {
      dragging = true;
      stopFollowing();
      positionToolbar();
    });
    pegboard.on('interaction:idle' as any, () => {
      dragging = false;
      positionToolbar();
      followFor(240);
    });

    // Cleanup when story unmounts
    (root as any).__cleanup = () => {
      window.removeEventListener('resize', onResize);
      stopFollowing();
    };

    return root;
  },
};
