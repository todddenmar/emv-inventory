"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ProductOption } from "@/types";

interface ProductOptionsEditorProps {
  options: ProductOption[];
  onChange: (options: ProductOption[]) => void;
  disabled?: boolean;
}

function OptionValueInput({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft("");
  };

  return (
    <div className="flex gap-2">
      <Input
        value={draft}
        placeholder="Add value and press Enter"
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          submit();
        }}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={submit}
      >
        Add
      </Button>
    </div>
  );
}

export function ProductOptionsEditor({
  options,
  onChange,
  disabled,
}: ProductOptionsEditorProps) {
  const addOption = () => {
    onChange([
      ...options,
      { name: "", values: [], position: options.length },
    ]);
  };

  const updateOption = (index: number, patch: Partial<ProductOption>) => {
    onChange(
      options.map((option, i) =>
        i === index ? { ...option, ...patch } : option
      )
    );
  };

  const removeOption = (index: number) => {
    onChange(
      options
        .filter((_, i) => i !== index)
        .map((option, i) => ({ ...option, position: i }))
    );
  };

  const moveOption = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= options.length) return;
    const copy = [...options];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    onChange(copy.map((option, i) => ({ ...option, position: i })));
  };

  const addValue = (index: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const option = options[index];
    if (option.values.includes(trimmed)) return;
    updateOption(index, { values: [...option.values, trimmed] });
  };

  const removeValue = (index: number, value: string) => {
    const option = options[index];
    updateOption(index, {
      values: option.values.filter((v) => v !== value),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Options</Label>
          <p className="text-xs text-muted-foreground">
            e.g. Size, Color — variants are generated from all combinations.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOption}
          disabled={disabled}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add option
        </Button>
      </div>

      {options.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No options — this product will have a single default variant.
        </p>
      ) : (
        <div className="space-y-3">
          {options.map((option, index) => (
            <div
              key={index}
              className="rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`option-name-${index}`}>Option name</Label>
                  <Input
                    id={`option-name-${index}`}
                    value={option.name}
                    placeholder="e.g. Size"
                    disabled={disabled}
                    onChange={(e) =>
                      updateOption(index, { name: e.target.value })
                    }
                  />
                </div>
                <div className="flex gap-1 pt-7">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || index === 0}
                    onClick={() => moveOption(index, -1)}
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || index === options.length - 1}
                    onClick={() => moveOption(index, 1)}
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    onClick={() => removeOption(index)}
                    aria-label="Remove option"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Values</Label>
                <div className="flex flex-wrap gap-2">
                  {option.values.map((value) => (
                    <Badge key={value} variant="secondary" className="gap-1 pr-1">
                      {value}
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-muted"
                        disabled={disabled}
                        onClick={() => removeValue(index, value)}
                        aria-label={`Remove ${value}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <OptionValueInput
                  disabled={disabled}
                  onAdd={(value) => addValue(index, value)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
