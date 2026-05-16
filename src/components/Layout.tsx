import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ReceiptText, PlusCircle, LogOut } from 'lucide-react';
import { auth } from '../lib/firebase';
import { cn } from '../lib/utils';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/orders', icon: ReceiptText, label: 'Orders' },
    { path: '/add-order', icon: PlusCircle, label: 'Add' },
  ];

  return (
    <div className="flex flex-col min-h-screen pb-20 md:pb-0 md:pl-64 bg-slate-50">
      {/* Sidebar - Hidden on mobile */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-slate-900 text-white p-6">
        <h1 className="text-2xl font-bold mb-10 tracking-tight">Admin<span className="text-blue-400">Pro</span></h1>
        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                location.pathname === item.path 
                  ? "bg-blue-600 text-white" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <item.icon size={20} />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          ))}
        </nav>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white transition-colors mt-auto"
        >
          <LogOut size={20} />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </aside>

      {/* Header - Mobile Only or common? */}
      <header className="md:hidden sticky top-0 z-10 bg-white border-b px-4 py-3">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight">Admin<span className="text-blue-600">Pro</span></h1>
          <button onClick={handleLogout} className="text-slate-500 p-2">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-10 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around p-3 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center gap-1 min-w-[64px]",
              location.pathname === item.path ? "text-blue-600" : "text-slate-400"
            )}
          >
            <item.icon size={22} strokeWidth={location.pathname === item.path ? 2.5 : 2} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
