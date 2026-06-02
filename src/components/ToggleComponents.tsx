import React from 'react';

interface CircleToggleProps {
  completed: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
  className?: string;
}

export const CircleToggle: React.FC<CircleToggleProps> = ({
  completed,
  onClick,
  size = 'md',
  title,
  className = '',
}) => {
  const sizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
  const checkSizes = { sm: 'w-2 h-2', md: 'w-2.5 h-2.5', lg: 'w-3 h-3' };

  return (
    <button
      onClick={onClick}
      title={title}
      className={`${sizes[size]} rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
        completed
          ? 'bg-label-green border-label-green shadow-sm shadow-label-green/30'
          : 'border-muted-foreground/40 hover:border-label-green hover:bg-label-green/10'
      } ${className}`}
    >
      {completed && (
        <svg
          className={`${checkSizes[size]} text-white`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
};

interface SquareToggleProps {
  completed: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md';
  title?: string;
  className?: string;
}

export const SquareToggle: React.FC<SquareToggleProps> = ({
  completed,
  onClick,
  size = 'md',
  title,
  className = '',
}) => {
  const sizes = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4' };
  const checkSizes = { sm: 'w-2 h-2', md: 'w-2.5 h-2.5' };

  return (
    <button
      onClick={onClick}
      title={title}
      className={`${sizes[size]} rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
        completed
          ? 'bg-label-green border-label-green shadow-sm shadow-label-green/30'
          : 'border-muted-foreground/40 hover:border-label-green hover:bg-label-green/10'
      } ${className}`}
    >
      {completed && (
        <svg
          className={`${checkSizes[size]} text-white`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
};
