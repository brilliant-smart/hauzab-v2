<?php

namespace App\Http\Controllers\Api;

use App\Enums\OrderStatus;
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
            'year' => ['count' => (int) $yearSales->count, 'total' => (string) $yearSales->total],
            'monthly_expense' => (string) $monthlyExpense,
            'products_count' => $productsCount,
            'low_stock_count' => $lowStockCount,
            'expiring_count' => $expiringCount,
            'employees_count' => $employeesCount,
        ]);
    }
}