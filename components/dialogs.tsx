"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { useCategories } from "@/lib/selectors";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/constants";
import { useIsDark } from "@/lib/theme";
import { cn, modKey } from "@/lib/utils";
import { Button, Dialog, DialogContent, Input, Kbd } from "./ui/primitives";

// ---------------- Category ----------------
export function CategoryDialog() {
  const state = useUI((s) => s.categoryDialog);
  const existing = useData((s) => (state?.mode === "edit" ? s.categories[state.id] : undefined));
  const dark = useIsDark();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("blue");
  const [icon, setIcon] = React.useState("folder");

  React.useEffect(() => {
    if (!state) return;
    setName(existing?.name ?? "");
    setColor(existing?.color ?? Object.keys(CATEGORY_COLORS)[Math.floor(Math.random() * 10)]);
    setIcon(existing?.icon ?? "folder");
  }, [state, existing]);

  const close = () => useUI.getState().setCategoryDialog(null);
  const save = () => {
    if (!name.trim()) return;
    if (existing) useData.getState().updateCategory(existing.id, { name: name.trim(), color, icon });
    else {
      const c = useData.getState().addCategory({ name, color, icon });
      useUI.getState().navigate({ type: "category", id: c.id });
    }
    close();
  };
  const PreviewIcon = CATEGORY_ICONS[icon];
  const c = CATEGORY_COLORS[color];
  const hex = dark ? c.dark : c.light;

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && close()}>
      <DialogContent title={existing ? "Edit category" : "New category"} description={existing ? undefined : "An area of your life, like Work, University or Fitness."}>
        <form
          className="flex flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl transition-colors" style={{ background: `color-mix(in oklab, ${hex} 14%, transparent)`, color: hex }}>
              <PreviewIcon className="size-5" />
            </span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" aria-label="Category name" />
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-muted">Color</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY_COLORS).map(([k, v]) => (
                <button
                  type="button"
                  key={k}
                  aria-label={v.label}
                  aria-pressed={color === k}
                  onClick={() => setColor(k)}
                  className="grid size-7 place-items-center rounded-full transition-transform hover:scale-110"
                  style={{ background: dark ? v.dark : v.light }}
                >
                  {color === k && <Check className="size-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-muted">Icon</div>
            <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
              {Object.entries(CATEGORY_ICONS).map(([k, I]) => (
                <button
                  type="button"
                  key={k}
                  aria-label={k}
                  aria-pressed={icon === k}
                  onClick={() => setIcon(k)}
                  className={cn("grid aspect-square place-items-center rounded-lg text-muted transition-colors hover:bg-hover", icon === k && "bg-active")}
                  style={icon === k ? { color: hex } : undefined}
                >
                  <I className="size-[18px]" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!name.trim()}>{existing ? "Save" : "Create category"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- List ----------------
export function ListDialog() {
  const state = useUI((s) => s.listDialog);
  const existing = useData((s) => (state?.mode === "edit" ? s.lists[state.id] : undefined));
  const categories = useCategories();
  const [name, setName] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");

  React.useEffect(() => {
    if (!state) return;
    setName(existing?.name ?? "");
    setCategoryId(existing?.categoryId ?? (state.mode === "create" ? state.categoryId : undefined) ?? categories[0]?.id ?? "");
  }, [state, existing, categories]);

  const close = () => useUI.getState().setListDialog(null);
  const save = () => {
    if (!name.trim() || !categoryId) return;
    if (existing) useData.getState().updateList(existing.id, { name: name.trim(), categoryId });
    else {
      const l = useData.getState().addList({ name, categoryId });
      useData.getState().updateCategory(categoryId, { collapsed: false });
      useUI.getState().navigate({ type: "list", id: l.id });
    }
    close();
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && close()}>
      <DialogContent title={existing ? "Edit list" : "New list"} description={existing ? undefined : "A project or list inside a category."}>
        <form className="flex flex-col gap-4 px-5 pb-5 pt-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Assignments, Shopping, Q4 Launch" aria-label="List name" />
          {categories.length === 0 ? (
            <p className="text-sm text-muted">Create a category first.</p>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Category</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-10 rounded-lg border border-line-strong bg-elevated px-3 text-[15px] outline-none focus:border-accent">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!name.trim() || !categoryId}>{existing ? "Save" : "Create list"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Shortcuts ----------------
export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const m = modKey();
  const rows: [string[], string][] = [
    [[m, "K"], "Search & command menu"],
    [["N"], "New task (or " + m + " N)"],
    [["/"], "Search"],
    [["↑", "↓"], "Move selection"],
    [["Enter"], "Open selected task"],
    [["X"], "Complete selected task"],
    [["⌫"], "Delete selected task"],
    [["Alt", "↑/↓"], "Reorder selected task"],
    [["F"], "Focus mode for selected task"],
    [["G", "then T/S/U/I/W/A"], "Go to Today / Assistant / Upcoming / Inbox / Week / All"],
    [["Esc"], "Close panel or dialog"],
    [["?"], "Show this help"],
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => useUI.getState().setShortcutsOpen(o)}>
      <DialogContent title="Keyboard shortcuts">
        <div className="flex flex-col px-5 pb-5 pt-3">
          {rows.map(([keys, label]) => (
            <div key={label} className="flex h-9 items-center justify-between border-b border-line text-sm last:border-0">
              <span className="text-fg/90">{label}</span>
              <span className="flex items-center gap-1">
                {keys.map((k) => (k.startsWith("then") ? <span key={k} className="text-xs text-faint">{k}</span> : <Kbd key={k}>{k}</Kbd>))}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
