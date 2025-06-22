import React, { useState, useRef, useEffect } from 'react';

import theme from '../../styles/theme';

interface DropdownOption {
  value: string | number;
  label: string;
  subLabel?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  width?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Bitte auswählen...',
  disabled = false,
  width = '100%',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Find selected option
  const selectedOption = options.find(opt => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          onChange(options[highlightedIndex].value);
          setIsOpen(false);
        } else {
          setIsOpen(!isOpen);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev => 
            prev < options.length - 1 ? prev + 1 : 0
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex(prev => 
            prev > 0 ? prev - 1 : options.length - 1
          );
        }
        break;
    }
  };

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && optionsRef.current) {
      const highlightedElement = optionsRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div 
      ref={dropdownRef}
      style={{ 
        position: 'relative', 
        width,
      }}
    >
      {/* Dropdown Header */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        style={{
          width: '100%',
          padding: theme.spacing.md,
          fontSize: theme.fonts.size.base,
          borderRadius: theme.borders.radius.md,
          border: `1px solid ${isOpen ? theme.colors.primary : theme.colors.border.light}`,
          backgroundColor: disabled ? theme.colors.background.muted : theme.colors.background.light,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'border-color 0.2s ease',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ 
          color: selectedOption ? theme.colors.text.primary : theme.colors.text.secondary,
        }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {/* Dropdown Arrow */}
        <svg
          width="12"
          height="8"
          viewBox="0 0 12 8"
          fill="none"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          <path
            d="M1 1.5L6 6.5L11 1.5"
            stroke={theme.colors.text.secondary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Dropdown Options */}
      {isOpen && (
        <div
          ref={optionsRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: theme.colors.background.light,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borders.radius.md,
            boxShadow: theme.shadows.md,
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 1000,
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                setHighlightedIndex(-1);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              style={{
                padding: theme.spacing.md,
                cursor: 'pointer',
                backgroundColor: 
                  highlightedIndex === index 
                    ? theme.colors.background.muted 
                    : option.value === value 
                    ? theme.colors.primary + '10' 
                    : 'transparent',
                borderBottom: 
                  index < options.length - 1 
                    ? `1px solid ${theme.colors.border.light}` 
                    : 'none',
                transition: 'background-color 0.1s ease',
              }}
            >
              <div style={{ 
                fontSize: theme.fonts.size.base,
                color: theme.colors.text.primary,
                fontWeight: option.value === value ? theme.fonts.weight.semibold : theme.fonts.weight.normal,
              }}>
                {option.label}
              </div>
              {option.subLabel && (
                <div style={{ 
                  fontSize: theme.fonts.size.small,
                  color: theme.colors.text.secondary,
                  marginTop: '2px',
                }}>
                  {option.subLabel}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dropdown;