import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoCloseDelay?: number;
  type?: 'success' | 'error' | 'info';
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  autoCloseDelay,
  type = 'info',
  children,
}) => {
  useEffect(() => {
    if (isOpen && autoCloseDelay) {
      const timer = setTimeout(onClose, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoCloseDelay, onClose]);

  if (!isOpen) return null;

  const typeStyles = {
    success: 'bg-green-100 border-green-500 text-green-900',
    error: 'bg-red-100 border-red-500 text-red-900',
    info: 'bg-blue-100 border-blue-500 text-blue-900',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        className={`relative max-w-md w-full mx-4 p-8 rounded-lg border-2 shadow-xl transform transition-all ${
          typeStyles[type]
        } ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
      >
        {children}
      </div>
    </div>
  );
};