import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FloatingSidebar, getInitialCollapsed } from './FloatingSidebar';
import { TopBar } from './TopBar';
import { cn } from '../../lib/cn';

export function Shell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(getInitialCollapsed());
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile sidebar on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-bg min-h-screen">
      {/* Desktop floating sidebar */}
      <div className="hidden lg:block">
        <FloatingSidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          'lg:hidden fixed inset-0 z-50 transition',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        <div
          className={cn(
            'absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <FloatingSidebar collapsed={false} setCollapsed={() => {}} />
        </div>
      </div>

      <div
        className={cn(
          'transition-[padding] duration-300 ease-out',
          'lg:pl-[96px]',
          !collapsed && 'lg:pl-[288px]',
        )}
      >
        <TopBar
          onToggleMobileSidebar={() => setMobileOpen((v) => !v)}
          mobileSidebarOpen={mobileOpen}
        />
        <main className="px-4 sm:px-6 pb-10 pt-4">{children}</main>
      </div>
    </div>
  );
}
