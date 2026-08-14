<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Expense;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExpenseController extends Controller
{
    public function index(Request $request)
    {
        $expenses = Expense::query()
            ->with(['category', 'user'])
            ->when($request->filled('category_id'), fn ($q) => $q->where('expense_category_id', $request->integer('category_id')))
            ->latest('date')
            ->latest()
            ->paginate($request->integer('per_page', 25))
            ->withQueryString();

        return response()->json($expenses);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['tenant_id'] = $request->user()->tenant_id;
        $data['user_id'] = $data['user_id'] ?? $request->user()->id;

        $expense = Expense::create($data);

        DB::afterCommit(fn () => AuditLog::record('expense.created', $expense));

        return response()->json(['data' => $expense->load(['category', 'user'])], 201);
    }

    public function show(Expense $expense)
    {
        return response()->json(['data' => $expense->load(['category', 'user'])]);
    }

    public function update(Request $request, Expense $expense)
    {
        $expense->update($this->validated($request));

        DB::afterCommit(fn () => AuditLog::record('expense.updated', $expense));

        return response()->json(['data' => $expense->load(['category', 'user'])]);
    }

    public function destroy(Expense $expense)
    {
        $expense->delete();

        DB::afterCommit(fn () => AuditLog::record('expense.deleted', $expense));

        return response()->json(['message' => 'Expense deleted']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'expense_category_id' => ['nullable', 'integer', 'exists:expense_categories,id'],
            'description' => ['required', 'string', 'max:191'],
            'amount' => ['required', 'numeric', 'min:0'],
            'date' => ['required', 'date'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);
    }
}