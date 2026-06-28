"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ProductSpec } from "@/types";

interface ProductSpecsEditorProps {
  specs: ProductSpec[];
  onChange: (specs: ProductSpec[]) => void;
}

export function ProductSpecsEditor({ specs, onChange }: ProductSpecsEditorProps) {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Specifications</Label>
        <Button type="button" variant="outline" size="sm" onClick={addSpec}>
          <Plus className="mr-1 h-3 w-3" />
          Add spec
        </Button>
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
}

export function TagsInput({
  tags,
  onChange,
  placeholder = "Type a tag and press Enter",
}: TagsInputProps) {
  const [input, setInput] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <Input
        value={input}
        placeholder={placeholder}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag(input);
          }
        }}
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                className="rounded-full hover:bg-muted"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
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
