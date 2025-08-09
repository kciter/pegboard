import React, { CSSProperties, useEffect } from 'react';
import { usePegboard, UsePegboardOptions } from './usePegboard';

// PegboardInstanceType 임시 타입 추론
import type { Pegboard as PegboardInstanceType } from '@pegboard/core';

export interface PegboardProps extends UsePegboardOptions {
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
  onReady?: (pegboard: PegboardInstanceType) => void; // 추가
}

export const Pegboard: React.FC<PegboardProps> = ({
  className,
  style,
  children,
  onReady,
  ...options
}) => {
  const { containerRef, pegboard } = usePegboard(options);

  useEffect(() => {
    if (pegboard) {
      (window as any).__lastPegboardInstance = pegboard;
      onReady?.(pegboard);
    }
  }, [pegboard, onReady]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// Backward compatibility export
export const PegboardEditor = Pegboard;
export default Pegboard;
