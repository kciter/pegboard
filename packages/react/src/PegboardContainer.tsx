import React, { CSSProperties } from 'react';
import { usePegboardContext } from './PegboardProvider';

export interface PegboardContainerProps {
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
}

export const PegboardContainer: React.FC<PegboardContainerProps> = ({
  className,
  style,
  children,
}) => {
  const { containerRef } = usePegboardContext();

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

export default PegboardContainer;
