import React from 'react';

interface ActionButtonProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  size?: 'default' | 'large' | 'xl';
}

/**
 * Large action button component for Home View
 */
const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  title,
  subtitle,
  onClick,
  disabled = false,
  variant = 'primary',
  className = '',
  size = 'default',
}) => {
  const variantClasses = {
    primary: 'bg-[#24c8db]/95 hover:bg-[#1eb0c3]/95 active:bg-[#1aa0b1]/95 text-white',
    secondary: 'bg-white/95 hover:bg-white/80 active:bg-gray-100/80 text-[#0f0f0f]',
    danger: 'bg-[#ef4444]/95 hover:bg-[#dc2626]/95 active:bg-[#b91c1c]/95 text-white',
  };

  const sizeClasses = {
    default: 'h-32 text-3xl',
    large: 'h-40 text-4xl',
    xl: 'h-48 text-5xl py-8',
  };

  const disabledClasses = disabled
    ? 'opacity-50 cursor-not-allowed'
    : 'cursor-pointer';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${variantClasses[variant]}
        ${disabledClasses}
        ${sizeClasses[size]}
        ${className}
        w-full rounded-3xl 
        transition-all duration-200 
        flex flex-col items-center justify-center 
        shadow-lg hover:shadow-xl
        p-6 gap-3
        font-medium
        transform hover:scale-[1.02] active:scale-[0.98]
      `}
    >
      <div className={size === 'xl' ? 'text-6xl mb-2' : 'text-4xl'}>
        {icon}
      </div>
      <div className={size === 'xl' ? 'text-2xl font-bold text-center' : 'text-xl font-semibold text-center'}>
        {title}
      </div>
      {subtitle && (
        <div className={size === 'xl' ? 'text-lg opacity-80 text-center' : 'text-sm opacity-80 text-center'}>
          {subtitle}
        </div>
      )}
    </button>
  );
};

export default ActionButton;