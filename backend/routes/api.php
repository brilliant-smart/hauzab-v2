<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\ConsignmentController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\ExpenseCategoryController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\ProductCategoryController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductManufacturerController;
use App\Http\Controllers\Api\ProductSupplierController;
use App\Http\Controllers\Api\ProductUnitController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Public auth endpoints.
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword']);

// Cloud receive endpoints — machine-to-machine, guarded by X-Sync-Secret
// rather than a cashier session, so they sit outside auth:sanctum.
Route::middleware('sync')->prefix('sync')->group(function () {
    Route::post('orders', [SyncController::class, 'storeOrder']);
    Route::post('orders/{uuid}/void', [SyncController::class, 'voidOrder']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/change-password', [AuthController::class, 'changePassword']);
    Route::get('/auth/profile', [AuthController::class, 'showProfile']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);

    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    // Catalog browse — available to any signed-in staff member.
    Route::get('products', [ProductController::class, 'index']);
    Route::get('products/low-stock', [ProductController::class, 'lowStock']);
    Route::get('products/expiring', [ProductController::class, 'expiring']);
    // Registered before the {product} wildcard so "import" isn't bound as an id.
    Route::get('products/import/template', [ProductController::class, 'importTemplate'])
        ->middleware('role:admin|supervisor|inventory_manager');
    Route::get('products/{product}', [ProductController::class, 'show']);

    Route::get('product-units', [ProductUnitController::class, 'index']);
    Route::get('product-categories', [ProductCategoryController::class, 'index']);
    Route::get('product-manufacturers', [ProductManufacturerController::class, 'index']);
    Route::get('product-suppliers', [ProductSupplierController::class, 'index']);

    // Register and customers — cashiers and managers ring up sales. Inventory
    // Manager is a products-only role (rank 0), excluded from this allow-list so
    // it cannot sell or browse sales/customers.
    Route::get('orders', [OrderController::class, 'index'])->middleware('role:admin|supervisor|staff');
    Route::post('orders', [OrderController::class, 'store'])->middleware('role:admin|supervisor|staff');
    Route::get('orders/{order}', [OrderController::class, 'show'])->middleware('role:admin|supervisor|staff');
    Route::apiResource('customers', CustomerController::class)->middleware('role:admin|supervisor|staff');

    // Product catalog management — admins, supervisors, and the products-only
    // Inventory Manager role. Kept as its own group (sibling to the manager group
    // below) so the parent group's role:admin|supervisor doesn't 403 the
    // products-only role before it reaches these routes.
    Route::middleware('role:admin|supervisor|inventory_manager')->group(function () {
        Route::post('products', [ProductController::class, 'store']);
        Route::post('products/image', [ProductController::class, 'uploadImage']);
        Route::post('products/import', [ProductController::class, 'import']);
        Route::put('products/{product}', [ProductController::class, 'update']);
        Route::patch('products/{product}', [ProductController::class, 'update']);
        Route::delete('products/{product}', [ProductController::class, 'destroy']);

        Route::apiResource('product-units', ProductUnitController::class)->except(['index']);
        Route::apiResource('product-categories', ProductCategoryController::class)->except(['index']);
        Route::apiResource('product-manufacturers', ProductManufacturerController::class)->except(['index']);
        Route::apiResource('product-suppliers', ProductSupplierController::class)->except(['index']);
    });

    // Employee, branch, device, dashboard, report, consignment, audit, and
    // expense management — admins and supervisors only. Inventory Manager
    // (rank 0) is excluded from this group, so none of these are reachable.
    Route::middleware('role:admin|supervisor')->group(function () {
        // Employee records are admin-only (owner decision: supervisors must
        // not see/manage staff accounts).
        Route::apiResource('users', UserController::class)->middleware('role:admin');

        // Branch list for the Devices form + device (till/tablet) administration.
        // Devices are admin-only (owner decision: supervisors must not administer tills).
        Route::get('branches', [BranchController::class, 'index']);
        Route::apiResource('devices', DeviceController::class)->middleware('role:admin');

        // Voiding a completed sale is a manager action.
        Route::post('orders/{order}/void', [OrderController::class, 'void']);

        // Reports, dashboard, consignments, audit log, and expenses.
        // Permission mirrors the old app's inverted supervisor/manager helpers:
        // managers (admin|supervisor) view; the audit trail (sales-audit,
        // activity log), exports, staff sales, and expense edit/delete are
        // admin-only (owner decision: supervisors must not see the audit trail).
        Route::get('dashboard/summary', [DashboardController::class, 'summary']);
        Route::get('dashboard/charts', [DashboardController::class, 'charts']);

        Route::get('reports/sales', [ReportController::class, 'sales']);
        Route::get('reports/sales-audit', [ReportController::class, 'salesAudit'])->middleware('role:admin');

        // Excel exports for the audit trail and stock receipts. Registered
        // before the {consignment} wildcard below so "export" isn't bound as an
        // id. Admin-only (the parent group allows admin|supervisor; the route's
        // own role:admin narrows it to admins).
        Route::get('audit-logs/export', [AuditLogController::class, 'export'])->middleware('role:admin');
        Route::get('consignments/export', [ConsignmentController::class, 'export'])->middleware('role:admin');

        Route::apiResource('consignments', ConsignmentController::class);
        // Activity log index is admin-only (paired with the admin-only export below).
        Route::apiResource('audit-logs', AuditLogController::class)->only(['index'])->middleware('role:admin');

        Route::apiResource('expense-categories', ExpenseCategoryController::class)->only(['index', 'show']);
        Route::apiResource('expenses', ExpenseController::class)->only(['index', 'show']);

        Route::middleware('role:admin')->group(function () {
            Route::get('reports/sales/export', [ReportController::class, 'salesExport']);
            Route::get('reports/sales-history/export', [ReportController::class, 'salesHistoryExport']);
            Route::get('reports/sales-audit/export', [ReportController::class, 'salesAuditExport']);
            Route::get('reports/staff-sales', [ReportController::class, 'staffSales']);
            Route::get('reports/staff-sales/export', [ReportController::class, 'staffSalesExport']);

            Route::apiResource('expense-categories', ExpenseCategoryController::class)->except(['index', 'show']);
            Route::apiResource('expenses', ExpenseController::class)->except(['index', 'show']);
        });
    });
});