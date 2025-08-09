import React, { createContext, useContext, ReactNode } from 'react';
import { usePegboard, UsePegboardOptions, UsePegboardReturn } from './usePegboard';

const PegboardContext = createContext<UsePegboardReturn | null>(null);

export interface PegboardProviderProps extends UsePegboardOptions {
  children: ReactNode;
}

export const PegboardProvider: React.FC<PegboardProviderProps> = ({ children, ...options }) => {
  const pegboardValue = usePegboard(options);

  return <PegboardContext.Provider value={pegboardValue}>{children}</PegboardContext.Provider>;
};

export const usePegboardContext = (): UsePegboardReturn => {
  const context = useContext(PegboardContext);
  if (!context) {
    throw new Error('usePegboardContext must be used within a PegboardProvider');
  }
  return context;
};

export default PegboardProvider;
