<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ExpenseCategory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ExpenseCategoryController extends Controller
{
    public function index(Request $request)
    {
        $categories = ExpenseCategory::query()
            ->withCount('expenses')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $categories]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('expense_categories')->where('tenant_id', $request->user()->tenant_id)],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $category = ExpenseCategory::create($data + ['tenant_id' => $request->user()->tenant_id]);

        DB::afterCommit(fn () => AuditLog::record('expense_category.created', $category));

        return response()->json(['data' => $category], 201);
    }

    public function show(ExpenseCategory $expenseCategory)
    {
        return response()->json(['data' => $expenseCategory]);
    }

    public function update(Request $request, ExpenseCategory $expenseCategory)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('expense_categories')->where('tenant_id', $request->user()->tenant_id)->ignore($expenseCategory->id)],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $expenseCategory->update($data);

        DB::afterCommit(fn () => AuditLog::record('expense_category.updated', $expenseCategory));

        return response()->json(['data' => $expenseCategory]);
    }

    public function destroy(ExpenseCategory $expenseCategory)
    {
        $expenseCategory->delete();

        DB::afterCommit(fn () => AuditLog::record('expense_category.deleted', $expenseCategory));

        return response()->json(['message' => 'Expense category deleted']);
    }
}