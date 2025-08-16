import { useRef, useEffect, useCallback, useState } from 'react';
import {
  Pegboard,
  PegboardConfig,
  BlockData,
  BlockExtension,
  GridConfig,
  EventCallback,
} from '@pegboard/core';

export interface UsePegboardOptions {
  grid: GridConfig;
  mode: 'editor' | 'viewer';
  plugins?: BlockExtension[];
  allowOverlap?: boolean; // 추가
  onBlockAdded?: EventCallback<{ block: BlockData }>;
  onBlockRemoved?: EventCallback<{ blockId: string }>;
  onBlockMoved?: EventCallback<{ block: BlockData; oldPosition: any }>;
  onBlockResized?: EventCallback<{ block: BlockData; oldSize: any }>;
  onBlockUpdated?: EventCallback<{ block: BlockData }>;
  onModeChanged?: EventCallback<{ mode: 'editor' | 'viewer' }>;
  onGridChanged?: EventCallback<{ grid: GridConfig }>;
}

export interface UsePegboardReturn {
  pegboard: Pegboard | null;
  containerRef: React.RefObject<HTMLDivElement>;
  addBlock: (data: Partial<BlockData>) => string | null;
  removeBlock: (id: string) => boolean;
  updateBlock: (id: string, updates: Partial<BlockData>) => boolean;
  getBlock: (id: string) => BlockData | null;
  getAllBlocks: () => BlockData[];
  selectBlock: (id: string | null) => void;
  getSelectedBlockId: () => string | null;
  setMode: (mode: 'editor' | 'viewer') => void;
  setGridConfig: (config: Partial<GridConfig>) => void;
  clear: () => void;
  exportData: () => { blocks: BlockData[]; grid: GridConfig } | null;
  importData: (data: { blocks?: BlockData[]; grid?: GridConfig }) => void;
}

export function usePegboard(options: UsePegboardOptions): UsePegboardReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const pegboardRef = useRef<Pegboard | null>(null);
  const [, setReadyTick] = useState(0); // 최초 1회 re-render 용
  const registeredPluginTypesRef = useRef<Set<string>>(new Set());

  // 최초 1회 생성
  useEffect(() => {
    if (!containerRef.current || pegboardRef.current) return;
    const config: PegboardConfig = {
      container: containerRef.current,
      grid: options.grid,
      mode: options.mode,
      allowOverlap: options.allowOverlap,
    };
    pegboardRef.current = new Pegboard(config);
    setReadyTick(1); // 한 번만 렌더 유도
  }, []);

  // 플러그인 등록 (새로운 type 만)
  useEffect(() => {
    if (!pegboardRef.current || !options.plugins) return;
    for (const plugin of options.plugins) {
      if (!registeredPluginTypesRef.current.has(plugin.type)) {
        pegboardRef.current.registerExtension(plugin);
        registeredPluginTypesRef.current.add(plugin.type);
      }
    }
  }, [options.plugins]);

  // grid 변경 반영
  useEffect(() => {
    if (pegboardRef.current) {
      pegboardRef.current.setGridConfig(options.grid);
    }
  }, [options.grid]);

  // mode 변경 반영
  useEffect(() => {
    if (pegboardRef.current) {
      pegboardRef.current.setMode(options.mode);
    }
  }, [options.mode]);

  // allowOverlap 변경 반영
  useEffect(() => {
    if (pegboardRef.current) {
      pegboardRef.current.setAllowOverlap(!!options.allowOverlap);
    }
  }, [options.allowOverlap]);

  // 이벤트 핸들러 1회 바인드 (옵션 변경 시 재바인드 필요하면 개선 가능)
  useEffect(() => {
    if (!pegboardRef.current) return;
    const pb = pegboardRef.current;
    const bindings: Array<[string, any]> = [];
    const bind = (ev: string, handler: any | undefined) => {
      if (handler) {
        pb.on(ev as any, handler as any);
        bindings.push([ev, handler]);
      }
    };
    bind('block:added', options.onBlockAdded);
    bind('block:removed', options.onBlockRemoved);
    bind('block:moved', options.onBlockMoved);
    bind('block:resized', options.onBlockResized);
    bind('block:updated', options.onBlockUpdated);
    bind('mode:changed', options.onModeChanged);
    bind('grid:changed', options.onGridChanged);
    return () => {
      bindings.forEach(([ev, h]) => pb.off(ev as any, h));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addBlock = useCallback((data: Partial<BlockData>): string | null => {
    return pegboardRef.current ? pegboardRef.current.addBlock(data) : null;
  }, []);

  return {
    pegboard: pegboardRef.current,
    containerRef,
    addBlock,
    removeBlock: useCallback(
      (id: string): boolean => (pegboardRef.current ? pegboardRef.current.removeBlock(id) : false),
      [],
    ),
    updateBlock: useCallback(
      (id: string, updates: Partial<BlockData>): boolean =>
        pegboardRef.current ? pegboardRef.current.updateBlock(id, updates) : false,
      [],
    ),
    getBlock: useCallback(
      (id: string): BlockData | null =>
        pegboardRef.current ? pegboardRef.current.getBlock(id) : null,
      [],
    ),
    getAllBlocks: useCallback(
      (): BlockData[] => (pegboardRef.current ? pegboardRef.current.getAllBlocks() : []),
      [],
    ),
    selectBlock: useCallback((id: string | null) => {
      pegboardRef.current?.selectBlock(id);
    }, []),
    getSelectedBlockId: useCallback(
      () => (pegboardRef.current ? pegboardRef.current.getSelectedBlockId() : null),
      [],
    ),
    setMode: useCallback((mode: 'editor' | 'viewer') => {
      pegboardRef.current?.setMode(mode);
    }, []),
    setGridConfig: useCallback((config: Partial<GridConfig>) => {
      pegboardRef.current?.setGridConfig(config);
    }, []),
    clear: useCallback(() => {
      pegboardRef.current?.clear();
    }, []),
    exportData: useCallback(
      () => (pegboardRef.current ? pegboardRef.current.exportData() : null),
      [],
    ),
    importData: useCallback((data: { blocks?: BlockData[]; grid?: GridConfig }) => {
      pegboardRef.current?.importJSON(JSON.stringify(data));
    }, []),
  };
}
