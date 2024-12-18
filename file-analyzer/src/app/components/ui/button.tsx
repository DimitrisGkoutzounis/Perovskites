import * as React from "react";

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center
          rounded-lg px-4 py-2 text-sm font-medium
          bg-white text-gray-900 border border-gray-200
          hover:bg-gray-50 
          data-[state=selected]:bg-gray-900 data-[state=selected]:text-white
          transition-colors duration-200
          shadow-sm ${className ?? ""}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
