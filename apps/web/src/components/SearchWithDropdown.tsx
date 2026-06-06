"use client";

import { useEffect, useRef, useState } from "react";

interface StandardResult {
  id: string;
  code: string;
  description: string;
  subject?: string;
  gradeLevel?: number;
  framework?: string;
}

interface SearchWithDropdownProps {
  value: string[];
  onChange: (selectedIds: string[]) => void;
  placeholder?: string;
}

export function SearchWithDropdown({
  value,
  onChange,
  placeholder = "Search standards...",
}: SearchWithDropdownProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StandardResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<StandardResult[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.length > 0) {
      // Initialize selected items from props (in a real app, we'd fetch these)
      // For now, we'll keep the IDs and populate details when results come in
    }
  }, [value]);

  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);

    if (!searchQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/standards?q=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();
      setResults(data.standards || []);
      setIsOpen(true);
    } catch (error) {
      console.error("Failed to fetch standards:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      handleSearch(newQuery);
    }, 300);
  };

  const handleSelectItem = (item: StandardResult) => {
    const isAlreadySelected = selectedItems.some((s) => s.id === item.id);

    if (isAlreadySelected) {
      const filtered = selectedItems.filter((s) => s.id !== item.id);
      setSelectedItems(filtered);
      onChange(filtered.map((s) => s.id));
    } else {
      const updated = [...selectedItems, item];
      setSelectedItems(updated);
      onChange(updated.map((s) => s.id));
    }
  };

  const handleRemoveChip = (id: string) => {
    const filtered = selectedItems.filter((s) => s.id !== id);
    setSelectedItems(filtered);
    onChange(filtered.map((s) => s.id));
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(e.target as Node)
    ) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="w-full" ref={dropdownRef}>
      <div className="border border-gray-300 rounded-md p-2 bg-white">
        {/* Selected items as chips */}
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedItems.map((item) => (
            <div
              key={item.id}
              className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 px-3 py-1 rounded-full text-sm"
            >
              <span className="font-medium">{item.code}</span>
              <button
                onClick={() => handleRemoveChip(item.id)}
                className="ml-1 text-blue-600 hover:text-blue-800 font-bold"
                aria-label={`Remove ${item.code}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Search input */}
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => query.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full outline-none text-sm"
        />
      </div>

      {/* Dropdown results */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {loading && (
            <div className="p-4 text-gray-600 text-center">Loading...</div>
          )}

          {!loading && results.length === 0 && query.trim() && (
            <div className="p-4 text-gray-600 text-center">
              No standards found
            </div>
          )}

          {!loading &&
            results.map((item) => {
              const isSelected = selectedItems.some((s) => s.id === item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  className={`p-3 border-b last:border-0 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-blue-50 border-l-4 border-l-blue-500"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-900">
                        {item.code}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {item.description}
                      </div>
                      {(item.subject || item.gradeLevel) && (
                        <div className="text-xs text-gray-500 mt-1">
                          {[item.subject, item.gradeLevel && `Grade ${item.gradeLevel}`]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <div className="ml-2 text-blue-600 font-bold">✓</div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
