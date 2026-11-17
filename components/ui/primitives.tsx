"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------- Button ----------------
type ButtonVariant = "primary" | "ghost" | "subtle" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button({ className, variant = "ghost", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 rounded-lg font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        variant === "primary" && "bg-accent text-on-accent shadow-sm hover:brightness-[1.06]",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        variant === "subtle" && "bg-hover text-fg hover:bg-active",
        variant === "outline" && "border border-line-strong text-fg hover:bg-hover",
        variant === "danger" && "bg-danger text-white hover:brightness-110",
        size === "sm" && "h-7 px-2.5 text-[13px]",
        size === "md" && "h-8 px-3 text-sm",
        size === "lg" && "h-11 px-5 text-[15px]",
        size === "icon" && "size-8",
        size === "icon-sm" && "size-7",
        className,
      )}
      {...props}
    />
  );
});

// ---------------- Input ----------------
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-lg border border-line-strong bg-elevated px-3 text-[15px] text-fg outline-none transition-shadow placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15",
          className,
        )}
        {...props}
      />
    );
  },
);

/** Textarea that grows with its content. */
export function AutoTextarea({
  className,
  value,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={cn("resize-none overflow-hidden", className)} {...props} />;
}

// ---------------- Dialog ----------------
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  hideTitle,
  sheetOnMobile = true,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
  hideTitle?: boolean;
  sheetOnMobile?: boolean;
  showClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] animate-fade-in dark:bg-black/50" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden bg-elevated text-fg shadow-pop outline-none",
          sheetOnMobile
            ? "inset-x-0 bottom-[var(--kb,0px)] max-h-[calc(92dvh-var(--kb,0px))] rounded-t-[22px] pb-safe animate-sheet-up sm:inset-auto sm:left-1/2 sm:top-[12vh] sm:bottom-auto sm:max-h-[76vh] sm:w-[calc(100%-2rem)] sm:max-w-md sm:-translate-x-1/2 sm:rounded-2xl sm:pb-0 sm:animate-scale-in"
            : "left-1/2 top-[12vh] max-h-[76vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl animate-scale-in",
          className,
        )}
        {...props}
      >
        {sheetOnMobile && <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong sm:hidden" />}
        <div className={cn("flex items-start justify-between gap-4 px-5 pt-4", hideTitle && "sr-only")}>
          <div>
            <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          {showClose && !hideTitle && (
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-2 -mt-1">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          )}
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ---------------- Popover ----------------
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn("z-[60] rounded-xl bg-elevated p-1 text-fg shadow-pop outline-none animate-scale-in", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// ---------------- Dropdown menu ----------------
export const Menu = DropdownPrimitive.Root;
export const MenuTrigger = DropdownPrimitive.Trigger;

export function MenuContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn("z-[60] min-w-44 rounded-xl bg-elevated p-1 text-fg shadow-pop outline-none animate-scale-in", className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function MenuItem({
  className,
  danger,
  icon,
  shortcut,
  children,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Item> & { danger?: boolean; icon?: React.ReactNode; shortcut?: string }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none data-[highlighted]:bg-hover [&_svg]:size-4 [&_svg]:text-muted",
        danger && "text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-faint">{shortcut}</span>}
    </DropdownPrimitive.Item>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DropdownPrimitive.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{children}</DropdownPrimitive.Label>;
}

export function MenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-line" />;
}

export const MenuRadioGroup = DropdownPrimitive.RadioGroup;
export function MenuRadioItem({ children, className, ...props }: React.ComponentProps<typeof DropdownPrimitive.RadioItem>) {
  return (
    <DropdownPrimitive.RadioItem
      className={cn(
        "relative flex h-8 cursor-default select-none items-center rounded-lg pl-8 pr-2.5 text-sm outline-none data-[highlighted]:bg-hover",
        className,
      )}
      {...props}
    >
      <DropdownPrimitive.ItemIndicator className="absolute left-2.5 size-1.5 rounded-full bg-accent" />
      {children}
    </DropdownPrimitive.RadioItem>
  );
}

// ---------------- Kbd ----------------
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-sunken px-1 font-sans text-[11px] font-medium text-muted", className)}>
      {children}
    </kbd>
  );
}

// ---------------- Segmented control ----------------
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-sunken p-0.5", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-muted transition-all",
            value === o.value && "bg-elevated text-fg shadow-card",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
