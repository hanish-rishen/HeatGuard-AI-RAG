import React, { useState, useRef, useEffect, createContext, useContext } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// --- Context ---
interface SelectContextType {
    value: string | number;
    onChange: (value: string | number) => void;
    open: boolean;
    setOpen: (open: boolean) => void;
}

const SelectContext = createContext<SelectContextType | undefined>(undefined);

// --- Components ---

interface SelectProps {
    value: string | number;
    onChange: (value: string | number) => void;
    children: React.ReactNode;
}

export const Select: React.FC<SelectProps> = ({ value, onChange, children }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <SelectContext.Provider value={{ value, onChange, open, setOpen }}>
            <div className="relative inline-block w-full" ref={ref}>
                {children}
            </div>
        </SelectContext.Provider>
    );
};

interface SelectTriggerProps {
    children: React.ReactNode;
    className?: string;
}

export const SelectTrigger: React.FC<SelectTriggerProps> = ({ children, className }) => {
    const context = useContext(SelectContext);
    if (!context) throw new Error("SelectTrigger must be used within Select");

    return (
        <button
            type="button"
            onClick={() => context.setOpen(!context.open)}
            className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
            {children}
            <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
    );
};

interface SelectContentProps {
    children: React.ReactNode;
    className?: string;
}

export const SelectContent: React.FC<SelectContentProps> = ({ children, className }) => {
    const context = useContext(SelectContext);
    if (!context) throw new Error("SelectContent must be used within Select");

    if (!context.open) return null;

    return (
        <div className={`absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 top-[calc(100%+4px)] w-full ${className}`}>
            <div className="p-1 max-h-60 overflow-y-auto">
                {children}
            </div>
        </div>
    );
};

interface SelectItemProps {
    value: string | number;
    children: React.ReactNode;
}

export const SelectItem: React.FC<SelectItemProps> = ({ value, children }) => {
    const context = useContext(SelectContext);
    if (!context) throw new Error("SelectItem must be used within Select");

    const isSelected = context.value === value;

    return (
        <div
            onClick={() => {
                context.onChange(value);
                context.setOpen(false);
            }}
            className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-accent hover:text-accent-foreground cursor-pointer"
        >
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {isSelected && <Check className="h-4 w-4 text-primary" />}
            </span>
            <span className="truncate">{children}</span>
        </div>
    );
};

export const SelectValue: React.FC<{ placeholder?: string; value?: string | number }> = ({ placeholder, value }) => {
    const context = useContext(SelectContext);
    return <span style={{ pointerEvents: 'none' }}>{value || placeholder}</span>
};
