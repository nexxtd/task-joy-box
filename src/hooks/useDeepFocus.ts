import { useState, useEffect } from 'react';
import { Task } from '@/types/board';

export const useDeepFocus = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [task, setTask] = useState<Task | undefined>();

  useEffect(() => {
    const handleOpen = (e: any) => {
      setIsOpen(true);
      setTask(e.detail?.task);
    };
    const handleClose = () => {
      setIsOpen(false);
      setTask(undefined);
    };

    document.addEventListener('openDeepFocus', handleOpen);
    document.addEventListener('closeDeepFocus', handleClose);

    return () => {
      document.removeEventListener('openDeepFocus', handleOpen);
      document.removeEventListener('closeDeepFocus', handleClose);
    };
  }, []);

  const open = (task?: Task) => {
    document.dispatchEvent(new CustomEvent('openDeepFocus', { detail: { task } }));
  };

  const close = () => {
    document.dispatchEvent(new CustomEvent('closeDeepFocus'));
  };

  return {
    isOpen,
    task,
    open,
    close,
  };
};
