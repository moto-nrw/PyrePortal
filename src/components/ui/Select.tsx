import React from 'react';

import theme from '../../styles/theme';

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: string;
  error?: string;
}

/**
 * Custom Select component with consistent styling
 */
const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '',
  width = '350px',
  className = '',
  error,
  ...props
}) => {
  // Base select styles
  const selectStyles: React.CSSProperties = {
    fontFamily: theme.fonts.family,
    minWidth: width,
    height: '3em',
    fontSize: theme.fonts.size.large,
    fontWeight: theme.fonts.weight.medium,
    padding: `0.6em 1.2em`,
    paddingRight: '2.5em',
    backgroundColor: theme.colors.background.light,
    color: theme.colors.text.primary,
    borderRadius: theme.borders.radius.md,
    border: error ? '1px solid #ef4444' : '1px solid transparent',
    boxShadow: theme.shadows.sm,
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.7em center',
    backgroundSize: '1em',
    outline: 'none',
  };

  // Handle change event
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      style={selectStyles}
      className={`rounded-[12px] border ${error ? 'border-red-500' : 'border-transparent'} transition-colors ${className}`}
      {...props}
    >
      {placeholder && (
        <option value="" disabled={props.required}>
          {placeholder}
        </option>
      )}

      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export default Select;
