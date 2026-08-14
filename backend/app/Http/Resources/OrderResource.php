<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'legacy_number' => $this->legacy_number,
            'uuid' => $this->uuid,
            'device_id' => $this->device_id,
            'status' => [
                'value' => $this->status?->value,
                'label' => $this->status?->label(),
            ],
            'subtotal' => $this->subtotal,
            'discount' => $this->discount,
            'total' => $this->total,
            'amount_paid' => $this->amount_paid,
            'change' => $this->change,
            'customer_id' => $this->customer_id,
            'customer_name' => $this->customer_name,
            'customer_phone' => $this->customer_phone,
            'note' => $this->note,
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'product_id' => $i->product_id,
                'product_name' => $i->product_name,
                'barcode' => $i->barcode,
                'quantity' => $i->quantity,
                'unit_price' => $i->unit_price,
                'line_total' => $i->line_total,
            ])),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => [
                'id' => $p->id,
                'method' => ['value' => $p->method?->value, 'label' => $p->method?->label()],
                'amount' => $p->amount,
            ])),
            'customer' => $this->whenLoaded('customer', fn () => $this->customer?->only(['id', 'name', 'phone'])),
            'user' => $this->whenLoaded('user', fn () => $this->user?->only(['id', 'name'])),
            'tenant' => $this->whenLoaded('tenant', fn () => $this->tenant?->only(['id', 'name', 'address', 'phone', 'email'])),
            'branch' => $this->whenLoaded('branch', fn () => $this->branch?->only(['id', 'name'])),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}