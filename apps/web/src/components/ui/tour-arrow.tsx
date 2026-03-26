import React from 'react';

interface TourArrowProps {
  className?: string;
  style?: React.CSSProperties;
  direction?: 'up-right' | 'up-left' | 'down-right' | 'down-left' | 'right' | 'left' | 'up' | 'down';
}

export const TourArrow: React.FC<TourArrowProps> = ({ 
  className = '', 
  style = {}, 
  direction = 'up-right' 
}) => {
  // Create the hand-drawn style curved arrow matching the reference image
  const getArrowPath = () => {
    switch (direction) {
      case 'up-right':
        // Curved arrow from bottom-left to top-right (matching the reference)
        return "M 4 20 Q 12 4 20 4";
      case 'up-left':
        return "M 20 20 Q 12 4 4 4";
      case 'down-right':
        return "M 4 4 Q 12 20 20 20";
      case 'down-left':
        return "M 20 4 Q 12 20 4 20";
      case 'right':
        return "M 4 12 Q 12 6 20 12";
      case 'left':
        return "M 20 12 Q 12 18 4 12";
      case 'up':
        return "M 12 20 Q 6 12 12 4";
      case 'down':
        return "M 12 4 Q 18 12 12 20";
      default:
        return "M 4 20 Q 12 4 20 4";
    }
  };

  const getArrowHeadPath = () => {
    switch (direction) {
      case 'up-right':
        return "M 20 4 L 26 2 L 24 8";
      case 'up-left':
        return "M 4 4 L -2 2 L 0 8";
      case 'down-right':
        return "M 20 20 L 26 22 L 24 16";
      case 'down-left':
        return "M 4 20 L -2 22 L 0 16";
      case 'right':
        return "M 20 12 L 26 10 L 24 16";
      case 'left':
        return "M 4 12 L -2 10 L 0 16";
      case 'up':
        return "M 12 4 L 10 -2 L 16 0";
      case 'down':
        return "M 12 20 L 10 26 L 16 24";
      default:
        return "M 20 4 L 26 2 L 24 8";
    }
  };

  return (
    <div className={`tour-arrow ${className}`} style={style}>
      <svg
        width="28"
        height="24"
        viewBox="0 0 28 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
      >
        {/* Main curved arrow shaft - thick, smooth curve */}
        <path
          d={getArrowPath()}
          stroke="#F77F00"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          className="animate-pulse"
          style={{
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
          }}
        />
        {/* Arrow head - triangular, seamlessly connected */}
        <path
          d={getArrowHeadPath()}
          stroke="#F77F00"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          className="animate-pulse"
          style={{
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
          }}
        />
      </svg>
    </div>
  );
};
