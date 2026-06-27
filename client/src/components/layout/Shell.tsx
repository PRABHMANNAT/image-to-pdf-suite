import { ReactNode } from 'react';
import { TopBar } from './TopBar';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-bg min-h-screen">
      <TopBar />
      <main className="px-4 sm:px-6 pb-12 pt-6">{children}</main>
    </div>
  );
}
