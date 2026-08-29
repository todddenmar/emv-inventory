"use client";

import { useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface GalleryItem {
  id: string;
  url: string;
  storagePath: string;
  file?: File;
  isPending: boolean;
}

interface ProductImageGalleryProps {
  items: GalleryItem[];
  thumbnailId: string | null;
  onChange: (items: GalleryItem[]) => void;
  onThumbnailChange: (id: string | null) => void;
  /** Variant labels keyed by gallery image id. */
  variantLabelsByImageId?: Record<string, string[]>;
}

function SortableImage({
  item,
  isThumbnail,
  variantLabels,
  onSetThumbnail,
  onRemove,
}: {
  item: GalleryItem;
  isThumbnail: boolean;
  variantLabels: string[];
  onSetThumbnail: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg border bg-muted",
        isDragging && "z-10 opacity-80 ring-2 ring-primary"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url}
        alt=""
        className="h-full w-full object-cover object-center"
      />
      <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1">
        {isThumbnail && (
          <Badge className="gap-1 text-xs">
            <Star className="h-3 w-3 fill-current" />
            Thumbnail
          </Badge>
        )}
        {variantLabels.map((label) => (
          <Badge
            key={label}
            variant="secondary"
            className="max-w-full truncate text-xs shadow-sm"
            title={`Used by variant: ${label}`}
          >
            {label}
          </Badge>
        ))}
      </div>
      {item.isPending && (
        <Badge
          variant="secondary"
          className="absolute right-2 top-2 text-xs"
        >
          New
        </Badge>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="cursor-grab rounded p-1 text-white active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex gap-1">
          {!isThumbnail && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-7 w-7"
              onClick={onSetThumbnail}
            >
              <Star className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="h-7 w-7"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProductImageGallery({
  items,
  thumbnailId,
  onChange,
  onThumbnailChange,
  variantLabelsByImageId = {},
}: ProductImageGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    onChange(arrayMove(items, oldIndex, newIndex));
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const newItems: GalleryItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
      storagePath: "",
      file,
      isPending: true,
    }));
    onChange([...items, ...newItems]);
    if (!thumbnailId && newItems.length > 0) {
      onThumbnailChange(newItems[0].id);
    }
  };

  const removeItem = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item?.isPending && item.url.startsWith("blob:")) {
      URL.revokeObjectURL(item.url);
    }
    const next = items.filter((i) => i.id !== id);
    onChange(next);
    if (thumbnailId === id) {
      onThumbnailChange(next[0]?.id ?? null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Image gallery</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-1 h-3 w-3" />
          Upload images
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <Upload className="h-8 w-8" />
          <span className="text-sm">Upload product images</span>
        </button>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {items.map((item) => (
                <SortableImage
                  key={item.id}
                  item={item}
                  isThumbnail={thumbnailId === item.id}
                  variantLabels={variantLabelsByImageId[item.id] ?? []}
                  onSetThumbnail={() => onThumbnailChange(item.id)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <p className="text-xs text-muted-foreground">
        Drag to reorder. Click the star to set the thumbnail. Variant labels
        appear on images assigned to a variant.
      </p>
    </div>
  );
}
