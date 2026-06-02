import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import MobileNav from './MobileNav';

const AppLayout: React.FC = () => {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
};

export default AppLayout;
