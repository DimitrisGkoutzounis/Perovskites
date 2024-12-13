import * as React from "react";

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center gap-2 rounded-lg py-2 px-4 text-sm
          transition-all duration-200 ease-in-out font-medium 
          bg-white border border-gray-200 text-gray-900 hover:bg-gray-50
          data-[state=active]:bg-gray-900 data-[state=active]:text-white
          data-[state=selected]:bg-gray-900 data-[state=selected]:text-white
          shadow-sm`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
