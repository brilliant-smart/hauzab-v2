<?php

namespace App\Http\Controllers\Api;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function summary(Request $request)
    {
        $statuses = [OrderStatus::Completed->value, OrderStatus::Credit->value];
        $tz = config('app.timezone');
        $today = Carbon::today($tz);
        $weekStart = (clone $today)->startOfWeek();
        $yearStart = Carbon::create($today->year, 1, 1, 0, 0, 0);

        $salesFor = function (Carbon $from, Carbon $to) use ($statuses) {
            return Order::whereIn('status', $statuses)
                ->whereDate('created_at', '>=', $from)
                ->whereDate('created_at', '<=', $to)
                ->selectRaw('COUNT(*) as count, COALESCE(SUM(amount_paid),0) as total')
                ->first();
        };

        $todaySales = $salesFor($today, (clone $today)->endOfDay());
        $weekSales = $salesFor($weekStart, (clone $today)->endOfDay());
        $monthStart = Carbon::create($today->year, $today->month, 1, 0, 0, 0);
        $monthSales = $salesFor($monthStart, (clone $today)->endOfDay());
        $yearSales = $salesFor($yearStart, (clone $today)->endOfDay());

        $monthlyExpense = Expense::whereYear('date', $today->year)
            ->whereMonth('date', $today->month)
            ->sum('amount');

        $lowStockCount = Product::query()
            ->whereColumn('quantity', '<=', 'reorder_level')
            ->count();

        $expiringCount = Product::query()
            ->whereNotNull('expire_date')
            ->whereDate('expire_date', '<=', now()->addDays(90))
            ->count();

        $productsCount = Product::count();
        $employeesCount = User::count();

        return response()->json([
            'today' => ['count' => (int) $todaySales->count, 'total' => (string) $todaySales->total],
            'week' => ['count' => (int) $weekSales->count, 'total' => (string) $weekSales->total],
            'month' => ['count' => (int) $monthSales->count, 'total' => (string) $monthSales->total],
            'year' => ['count' => (int) $yearSales->count, 'total' => (string) $yearSales->total],
            'monthly_expense' => (string) $monthlyExpense,
            'products_count' => $productsCount,
            'low_stock_count' => $lowStockCount,
            'expiring_count' => $expiringCount,
            'employees_count' => $employeesCount,
        ]);
    }

    /**
     * Trend + breakdown data for the dashboard charts. All queries are scoped to
     * the signed-in user's tenant and the last 30 calendar days (inclusive of
     * today) so a cashier/manager only ever sees their own store's numbers.
     */
    public function charts(Request $request)
    {
        $tenantId = $request->user()->tenant_id;
        $statuses = [OrderStatus::Completed->value, OrderStatus::Credit->value];
        $tz = config('app.timezone');
        $today = Carbon::today($tz);
        // 30 calendar days ending today.
        $from = (clone $today)->subDays(29)->startOfDay();

        // 1. Daily sales (revenue + transaction count), zero-padded for a
        //    continuous 30-day line even on days with no sales.
        $trendRows = Order::where('tenant_id', $tenantId)
            ->whereIn('status', $statuses)
            ->where('created_at', '>=', $from)
            ->selectRaw('DATE(created_at) as date, COALESCE(SUM(amount_paid), 0) as total, COUNT(*) as cnt')
            ->groupByRaw('DATE(created_at)')
            ->get();
        $byDate = [];
        foreach ($trendRows as $row) {
            $byDate[$row->date] = ['total' => $row->total, 'count' => $row->cnt];
        }
        $salesTrend = [];
        for ($i = 29; $i >= 0; $i--) {
            $day = (clone $today)->subDays($i);
            $key = $day->toDateString();
            $entry = $byDate[$key] ?? ['total' => 0, 'count' => 0];
            $salesTrend[] = [
                'date' => $key,
                'label' => $day->format('M j'),
                'total' => (string) $entry['total'],
                'count' => (int) $entry['count'],
            ];
        }

        // 2. Top-selling products by quantity over the window. product_name is
        //    denormalized on the line item, so this stays reliable even though
        //    category_id is mostly NULL across the catalog.
        $topRows = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.tenant_id', $tenantId)
            ->whereIn('orders.status', $statuses)
            ->where('orders.created_at', '>=', $from)
            ->selectRaw('order_items.product_name, SUM(order_items.quantity) as quantity, SUM(order_items.line_total) as revenue')
            ->groupBy('order_items.product_name')
            ->orderByDesc('quantity')
            ->limit(6)
            ->get();
        $topProducts = $topRows->map(fn ($r) => [
            'name' => $r->product_name,
            'quantity' => (string) $r->quantity,
            'revenue' => (string) $r->revenue,
        ])->values();

        // 3. Payment-method mix over the window. Always return all three tenders
        //    so the donut renders consistently even when one is unused.
        $paymentRows = DB::table('payments')
            ->join('orders', 'orders.id', '=', 'payments.order_id')
            ->where('orders.tenant_id', $tenantId)
            ->whereIn('orders.status', $statuses)
            ->where('orders.created_at', '>=', $from)
            ->selectRaw('payments.method, SUM(payments.amount) as total')
            ->groupBy('payments.method')
            ->pluck('total', 'method');
        $paymentMix = collect(PaymentMethod::cases())->map(function ($method) use ($paymentRows) {
            return [
                'method' => $method->value,
                'label' => $method->label(),
                'total' => (string) ($paymentRows[$method->value] ?? 0),
            ];
        })->values();

        // 4. Needs-attention lists — the items behind the low-stock / expiring
        //    card counts, so the manager can act without leaving the dashboard.
        $lowStock = Product::where('tenant_id', $tenantId)
            ->whereColumn('quantity', '<=', 'reorder_level')
            ->orderBy('quantity')
            ->limit(5)
            ->get(['id', 'name', 'quantity', 'reorder_level'])
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'quantity' => (string) $p->quantity,
                'reorder_level' => (string) $p->reorder_level,
            ])->values();

        $expiring = Product::where('tenant_id', $tenantId)
            ->whereNotNull('expire_date')
            ->whereDate('expire_date', '<=', now()->addDays(90))
            ->orderBy('expire_date')
            ->limit(5)
            ->get(['id', 'name', 'quantity', 'expire_date'])
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'quantity' => (string) $p->quantity,
                'expire_date' => $p->expire_date?->toDateString(),
            ])->values();

        return response()->json([
            'range' => [
                'days' => 30,
                'from' => $from->toDateString(),
                'to' => $today->toDateString(),
            ],
            'sales_trend' => $salesTrend,
            'top_products' => $topProducts,
            'payment_mix' => $paymentMix,
            'low_stock' => $lowStock,
            'expiring' => $expiring,
        ]);
    }
}