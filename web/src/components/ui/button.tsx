import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-button text-button-foreground shadow-lg shadow-button/25 hover:shadow-xl hover:shadow-button/30 hover:-translate-y-0.5",
        gold: "bg-gradient-to-l from-accent via-[#f2d885] to-accent bg-[length:200%_100%] text-accent-foreground shadow-lg shadow-accent/25 hover:bg-[position:100%_0] hover:shadow-xl hover:shadow-accent/35 hover:-translate-y-0.5",
        outline:
          "border-2 border-primary/20 bg-transparent text-foreground hover:border-primary hover:bg-primary/5",
        ghost: "bg-transparent text-foreground hover:bg-foreground/5",
        whatsapp:
          "bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 hover:shadow-xl hover:-translate-y-0.5",
        link: "text-primary underline-offset-4 hover:underline rounded-none",
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-10 px-4 text-[13px]",
        lg: "h-14 px-8 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
