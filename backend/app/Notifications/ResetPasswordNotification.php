<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword as BaseResetPassword;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Password-reset link pointing at the SPA, not a backend blade route. The
 * token and email travel as query params; the frontend POSTs them back to the
 * /auth/reset-password endpoint to perform the actual reset.
 */
class ResetPasswordNotification extends BaseResetPassword
{
    use Queueable;

    /** {@inheritdoc} */
    protected function resetUrl($notifiable): string
    {
        return config('app.frontend_url').'/reset-password?'
            .http_build_query([
                'token' => $this->token,
                'email' => $notifiable->getEmailForPasswordReset(),
            ]);
    }

    /** {@inheritdoc} */
    public function toMail($notifiable): MailMessage
    {
        return (new MailMessage())
            ->subject('Reset your Hauzab password')
            ->line('You requested a password reset for your Hauzab account.')
            ->action('Reset password', $this->resetUrl($notifiable))
            ->line('This link expires in 60 minutes. If you didn\'t request a reset, no action is needed.');
    }
}