"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { ProductSpec } from "@/types";

export function parseSpecsBulk(input: string): ProductSpec[] {
  const parts = input
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed: ProductSpec[] = [];

  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    if (colonIndex === -1) continue;

    const label = part.slice(0, colonIndex).trim();
    const value = part.slice(colonIndex + 1).trim();
    if (!label || !value) continue;

    parsed.push({ label, value });
  }

  return parsed;
}

interface ProductSpecsEditorProps {
  specs: ProductSpec[];
  onChange: (specs: ProductSpec[]) => void;
}

export function ProductSpecsEditor({ specs, onChange }: ProductSpecsEditorProps) {
  const [bulkInput, setBulkInput] = useState("");

  const addSpec = () => {
    onChange([...specs, { label: "", value: "" }]);
  };

  const updateSpec = (index: number, field: keyof ProductSpec, value: string) => {
    onChange(
      specs.map((spec, i) => (i === index ? { ...spec, [field]: value } : spec))
    );
  };

  const removeSpec = (index: number) => {
    onChange(specs.filter((_, i) => i !== index));
  };

  const addFromBulk = () => {
    const parsed = parseSpecsBulk(bulkInput);
    if (parsed.length === 0) {
      toast.error('Use label:value pairs separated by commas, e.g. "Size: Large, Weight: 500g"');
      return;
    }

    onChange([...specs, ...parsed]);
    setBulkInput("");
    toast.success(
      `Added ${parsed.length} spec${parsed.length === 1 ? "" : "s"}`
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Specifications</Label>
        <Button type="button" variant="outline" size="sm" onClick={addSpec}>
          <Plus className="mr-1 h-3 w-3" />
          Add spec
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <Label htmlFor="specs-bulk" className="text-xs text-muted-foreground">
          Paste multiple specs
        </Label>
        <Textarea
          id="specs-bulk"
          rows={3}
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          placeholder="Size: Large, Weight: 500g, Color: Red"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Format: label:value, label:value (commas or new lines)
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addFromBulk}
            disabled={!bulkInput.trim()}
          >
            Add to list
          </Button>
        </div>
      </div>

      {specs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No specs added yet.</p>
      ) : (
        <div className="space-y-2">
          {specs.map((spec, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder="Label (e.g. Size)"
                value={spec.label}
                onChange={(e) => updateSpec(index, "label", e.target.value)}
              />
              <Input
                placeholder="Value (e.g. Large)"
                value={spec.value}
                onChange={(e) => updateSpec(index, "value", e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSpec(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TagsInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function TagsInput({
  tags,
  onChange,
  placeholder = "Type a tag and press Enter",
  disabled = false,
  id,
}: TagsInputProps) {
  const [input, setInput] = useState("");
  const safeTags = Array.isArray(tags) ? tags : [];

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag || safeTags.includes(tag)) {
      setInput("");
      return;
    }
    onChange([...safeTags, tag]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={input}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
        onBlur={() => {
          if (input.trim()) addTag(input);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag(input);
          }
        }}
      />
      {safeTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {safeTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                className="rounded-full hover:bg-muted disabled:pointer-events-none"
                disabled={disabled}
                onClick={() => onChange(safeTags.filter((t) => t !== tag))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
