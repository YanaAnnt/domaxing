"use client";

import * as React from "react";
import { Check, Inbox, Hash } from "lucide-react";
import { useCategories, useListsByCategory } from "@/lib/selectors";
import { CATEGORY_ICONS } from "@/lib/constants";
import { useCategoryColor } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/primitives";

export function CategoryIcon({ icon, color, className, boxed }: { icon: string; color: string; className?: string; boxed?: boolean }) {
  const Icon = CATEGORY_ICONS[icon] ?? CATEGORY_ICONS.folder;
  const c = useCategoryColor(color);
  if (boxed)
    return (
      <span className={cn("grid place-items-center rounded-[10px]", className)} style={{ background: `color-mix(in oklab, ${c} 14%, transparent)`, color: c }}>
        <Icon className="size-[55%]" strokeWidth={2} />
      </span>
    );
  return <Icon className={cn("size-4", className)} style={{ color: c }} strokeWidth={2} />;
}

type Target = { listId: string | null; categoryId: string | null };

export function ListPicker({ value, onChange, trigger }: { value: Target; onChange: (t: Target) => void; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const categories = useCategories();
  const byCat = useListsByCategory();
  const pick = (t: Target) => {
    onChange(t);
    setOpen(false);
    setQ("");
  };
  const ql = q.toLowerCase();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <div className="border-b border-line p-1.5">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Move to…"
            className="h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-faint"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {"inbox".includes(ql) && (
            <Row selected={!value.categoryId} onClick={() => pick({ listId: null, categoryId: null })} icon={<Inbox className="size-4 text-accent" />}>
              Inbox
            </Row>
          )}
          {categories.map((c) => {
            const lists = (byCat[c.id] ?? []).filter((l) => !ql || l.name.toLowerCase().includes(ql) || c.name.toLowerCase().includes(ql));
            if (ql && !lists.length && !c.name.toLowerCase().includes(ql)) return null;
            return (
              <div key={c.id} className="mt-1">
                <Row
                  selected={value.categoryId === c.id && !value.listId}
                  onClick={() => pick({ listId: null, categoryId: c.id })}
                  icon={<CategoryIcon icon={c.icon} color={c.color} />}
                  bold
                >
                  {c.name}
                </Row>
                {lists.map((l) => (
                  <Row key={l.id} selected={value.listId === l.id} onClick={() => pick({ listId: l.id, categoryId: c.id })} icon={<Hash className="size-3.5 text-faint" />} indent>
                    {l.name}
                  </Row>
                ))}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({
  children, icon, selected, onClick, indent, bold,
}: { children: React.ReactNode; icon: React.ReactNode; selected?: boolean; onClick: () => void; indent?: boolean; bold?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm hover:bg-hover", indent && "pl-7", bold && "font-medium")}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {selected && <Check className="size-4 text-accent" />}
    </button>
  );
}
