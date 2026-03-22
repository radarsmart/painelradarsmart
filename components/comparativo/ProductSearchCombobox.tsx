"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import type { CompareOffer } from "./ComparativoClient";

type ProductSearchComboboxProps = {
  label: string;
  placeholder: string;
  options: CompareOffer[];
  value: string | null;
  onChange: (id: string) => void;
  excludedId?: string | null;
};

export default function ProductSearchCombobox({
  label,
  placeholder,
  options,
  value,
  onChange,
  excludedId,
}: ProductSearchComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((item) => item.id === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (selected) {
      setQuery(selected.title);
    } else {
      setQuery("");
    }
  }, [selected]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options
      .filter((item) => item.id !== excludedId)
      .filter((item) => {
        if (!normalized) return true;
        return (
          item.title.toLowerCase().includes(normalized) ||
          item.marketplace.toLowerCase().includes(normalized)
        );
      })
      .slice(0, 8);
  }, [excludedId, options, query]);

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-9 text-sm text-slate-800 outline-none transition focus:border-[#9e6a18] focus:ring-2 focus:ring-[#9e6a18]/20"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>

      {isOpen ? (
        <div className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChange(item.id);
                  setIsOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.marketplace} · {formatBRL(item.price)}
                  </p>
                </div>
                {item.id === value ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500">
              Nenhum produto encontrado.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

