import * as React from "react";

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center 
          rounded-md text-sm font-medium 
          transition-all duration-200 ease-in-out
          focus-visible:outline-none focus-visible:ring-2 
          focus-visible:ring-ring disabled:pointer-events-none 
          disabled:opacity-50 
          bg-blue-500 text-white
          shadow-md
          hover:bg-blue-600 
          active:bg-blue-700 
          h-9 px-4 py-2 ${className ?? ""}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
