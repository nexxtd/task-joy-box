import { useState, useEffect } from 'react';
export function useAdminPreview() {
  const [viewAsUser, setViewAsUser] = useState(() => {
    try { return localStorage.getItem('admin_view_as_user') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    const handler = () => {
      try { setViewAsUser(localStorage.getItem('admin_view_as_user') === 'true'); } catch {}
    };
    window.addEventListener('storage', handler);
    window.addEventListener('admin_view_as_user_changed', handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('admin_view_as_user_changed', handler as EventListener);
    };
  }, []);
  const setViewAsUserWrapped = (val: boolean) => {
    try { localStorage.setItem('admin_view_as_user', String(val)); } catch {}
    setViewAsUser(val);
    window.dispatchEvent(new Event('admin_view_as_user_changed'));
  };
  return { viewAsUser, setViewAsUser: setViewAsUserWrapped };
}
