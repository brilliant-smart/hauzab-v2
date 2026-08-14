<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\ProductCategoryController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductManufacturerController;
use App\Http\Controllers\Api\ProductSupplierController;
use App\Http\Controllers\Api\ProductUnitController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Public auth endpoints.
Route::post('/auth/login', [AuthController::class, 'login']);

// Cloud receive endpoints — machine-to-machine, guarded by X-Sync-Secret
// rather than a cashier session, so they sit outside auth:sanctum.
Route::middleware('sync')->prefix('sync')->group(function () {
    Route::post('orders', [SyncController::class, 'storeOrder']);
    Route::post('orders/{uuid}/void', [SyncController::class, 'voidOrder']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/user', function (Request $request) {
        return $request->user();
    });

    // Catalog browse — available to any signed-in staff member.
    Route::get('products', [ProductController::class, 'index']);
    Route::get('products/low-stock', [ProductController::class, 'lowStock']);
    Route::get('products/expiring', [ProductController::class, 'expiring']);
    Route::get('products/{product}', [ProductController::class, 'show']);

    Route::get('product-units', [ProductUnitController::class, 'index']);
    Route::get('product-categories', [ProductCategoryController::class, 'index']);
    Route::get('product-manufacturers', [ProductManufacturerController::class, 'index']);
    Route::get('product-suppliers', [ProductSupplierController::class, 'index']);

    // Register and customers — any signed-in staff member can ring up sales.
    Route::get('orders', [OrderController::class, 'index']);
    Route::post('orders', [OrderController::class, 'store']);
    Route::get('orders/{order}', [OrderController::class, 'show']);
    Route::apiResource('customers', CustomerController::class);

    // Catalog and employee management — admins and supervisors only.
    Route::middleware('role:admin|supervisor')->group(function () {
        Route::post('products', [ProductController::class, 'store']);
        Route::put('products/{product}', [ProductController::class, 'update']);
        Route::patch('products/{product}', [ProductController::class, 'update']);
        Route::delete('products/{product}', [ProductController::class, 'destroy']);

        Route::apiResource('product-units', ProductUnitController::class)->except(['index']);
        Route::apiResource('product-categories', ProductCategoryController::class)->except(['index']);
        Route::apiResource('product-manufacturers', ProductManufacturerController::class)->except(['index']);
        Route::apiResource('product-suppliers', ProductSupplierController::class)->except(['index']);

        Route::apiResource('users', UserController::class);

        // Device (till/tablet) administration.
        Route::get('devices', [DeviceController::class, 'index']);
        Route::post('devices', [DeviceController::class, 'store']);

        // Voiding a completed sale is a manager action.
        Route::post('orders/{order}/void', [OrderController::class, 'void']);
    });
});