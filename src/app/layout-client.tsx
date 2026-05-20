'use client';

import React from 'react';
import { ConfigProvider } from 'antd';
import { activeTheme } from '@/config/theme.config';

export function RootLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfigProvider theme={activeTheme.antdTheme}>{children}</ConfigProvider>
  );
}
