import forkConfig from '../../fork-config';
import type React from 'react';

export const modules = forkConfig.modules;

export function isEnabled(module: keyof typeof modules): boolean {
  return modules[module] === true;
}

export function ModuleGuard({
  module,
  children,
}: {
  module: keyof typeof modules;
  children: React.ReactNode;
}): React.ReactNode {
  if (!isEnabled(module)) return null;
  return children;
}
