<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'size' => $this->size,
            'model' => $this->model,
            'department' => $this->department,
            'barcode' => $this->barcode,
            'image' => $this->image,
            'quantity' => $this->quantity,
            'cost_price' => $this->cost_price,
            'selling_price' => $this->selling_price,
            'reorder_level' => $this->reorder_level,
            'manufacture_date' => $this->manufacture_date?->format('Y-m-d'),
            'expire_date' => $this->expire_date?->format('Y-m-d'),
            'is_active' => $this->is_active,
            'category_id' => $this->category_id,
            'unit_id' => $this->unit_id,
            'manufacturer_id' => $this->manufacturer_id,
            'supplier_id' => $this->supplier_id,
            'category' => $this->whenLoaded('category', fn () => $this->category?->only(['id', 'name'])),
            'unit' => $this->whenLoaded('unit', fn () => $this->unit?->only(['id', 'name'])),
            'manufacturer' => $this->whenLoaded('manufacturer', fn () => $this->manufacturer?->only(['id', 'name'])),
            'supplier' => $this->whenLoaded('supplier', fn () => $this->supplier?->only(['id', 'name'])),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}