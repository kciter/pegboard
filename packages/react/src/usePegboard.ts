import { useRef, useEffect, useCallback, useState } from 'react';
import {
  Pegboard,
  PegboardConfig,
  BlockData,
  GridConfig,
  EventCallback,
  AnyBlockExtension,
  DragReflowStrategy,
  GridOverlayMode,
} from '@pegboard/core';

export interface UsePegboardOptions {
  grid: GridConfig;
  editable?: boolean; // default true
  extensions?: AnyBlockExtension[];
  allowOverlap?: boolean;
  // advanced options (applied at construction; instance 재생성 필요 시 의존성으로 사용)
  autoArrange?: boolean;
  autoArrangeStrategy?: 'top-left';
  arrangeAnimationMs?: number;
  dragReflow?: DragReflowStrategy;
  lassoSelection?: boolean;
  keyboardMove?: boolean;
  keyboardDelete?: boolean;
  autoGrowRows?: boolean;
  gridOverlayMode?: GridOverlayMode;
  // events
  onBlockAdded?: EventCallback<{ block: BlockData }>;
  onBlockRemoved?: EventCallback<{ blockId: string }>;
  onBlockMoved?: EventCallback<{ block: BlockData; oldPosition: any }>;
  onBlockResized?: EventCallback<{ block: BlockData; oldSize: any }>;
  onBlockUpdated?: EventCallback<{ block: BlockData }>;
  onEditableChanged?: EventCallback<{ editable: boolean }>;
  onGridChanged?: EventCallback<{ grid: GridConfig }>;
}

export interface UsePegboardReturn {
  pegboard: Pegboard | null;
  containerRef: React.RefObject<HTMLDivElement>;
  addBlock: (
    data: Omit<Partial<BlockData>, 'id' | 'attributes'> & {
      type: string;
      position: BlockData['position'];
      size: BlockData['size'];
      attributes?: BlockData['attributes'];
      id?: string;
    },
  ) => string | null;
  removeBlock: (id: string) => boolean;
  updateBlock: (id: string, updates: Partial<BlockData>) => boolean;
  getBlock: (id: string) => BlockData | null;
  getAllBlocks: () => BlockData[];
  selectBlock: (id: string | null) => void;
  getSelectedBlockId: () => string | null;
  setEditable: (editable: boolean) => void;
  setGridConfig: (config: Partial<GridConfig>) => void;
  clear: () => void;
  exportData: () => { blocks: BlockData[]; grid: GridConfig } | null;
  importData: (data: { blocks?: BlockData[]; grid?: GridConfig; version?: number }) => void;
}

export function usePegboard(options: UsePegboardOptions): UsePegboardReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const pegboardRef = useRef<Pegboard | null>(null);
  const [, setReadyTick] = useState(0); // 최초 1회 re-render 용
  const registeredTypesRef = useRef<Set<string>>(new Set());

  // 최초 1회 생성
  useEffect(() => {
    if (!containerRef.current || pegboardRef.current) return;
    const config: PegboardConfig = {
      container: containerRef.current,
      grid: options.grid,
      editable: options.editable ?? true,
      allowOverlap: options.allowOverlap ?? false,
      autoArrange: options.autoArrange ?? false,
      autoArrangeStrategy: options.autoArrangeStrategy ?? 'top-left',
      arrangeAnimationMs: options.arrangeAnimationMs ?? 160,
      dragReflow: options.dragReflow ?? 'none',
      lassoSelection: options.lassoSelection ?? false,
      keyboardMove: options.keyboardMove ?? true,
      keyboardDelete: options.keyboardDelete ?? false,
      autoGrowRows: options.autoGrowRows ?? false,
      gridOverlayMode: options.gridOverlayMode ?? 'always',
    };
    pegboardRef.current = new Pegboard(config);
    setReadyTick(1); // 한 번만 렌더 유도
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 플러그인 등록 (새로운 type 만)
  useEffect(() => {
    if (!pegboardRef.current || !options.extensions) return;
    for (const ext of options.extensions) {
      if (!registeredTypesRef.current.has(ext.type)) {
        pegboardRef.current.registerExtension(ext);
        registeredTypesRef.current.add(ext.type);
      }
    }
  }, [options.extensions]);

  // grid 변경 반영
  useEffect(() => {
    if (pegboardRef.current) {
      pegboardRef.current.setGridConfig(options.grid);
    }
  }, [options.grid]);

  // editable 변경 반영
  useEffect(() => {
    if (pegboardRef.current) {
      pegboardRef.current.setEditable(options.editable ?? true);
    }
  }, [options.editable]);

  // allowOverlap 변경 반영
  useEffect(() => {
    if (pegboardRef.current) {
      pegboardRef.current.setAllowOverlap(!!options.allowOverlap);
    }
  }, [options.allowOverlap]);

  // lasso/keyboard 옵션 동기화
  useEffect(() => {
    if (!pegboardRef.current) return;
    pegboardRef.current.setLassoSelection(!!options.lassoSelection);
    pegboardRef.current.setKeyboardMove(options.keyboardMove ?? true);
    pegboardRef.current.setKeyboardDelete(!!options.keyboardDelete);
  }, [options.lassoSelection, options.keyboardMove, options.keyboardDelete]);

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
    bind('editable:changed', options.onEditableChanged);
    bind('grid:changed', options.onGridChanged);
    return () => {
      bindings.forEach(([ev, h]) => pb.off(ev as any, h));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addBlock = useCallback((data: any): string | null => {
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
    setEditable: useCallback((editable: boolean) => {
      pegboardRef.current?.setEditable(editable);
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
    importData: useCallback(
      (data: { blocks?: BlockData[]; grid?: GridConfig; version?: number }) => {
        pegboardRef.current?.importJSON(JSON.stringify(data));
      },
      [],
    ),
  };
}
