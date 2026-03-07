import {} from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const loginSchema = z.object({
    email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
});

const LoginForm = ({ onSubmit }) => {
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(loginSchema),
    });

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="login-form">
            <div className="form-group">   
                <label htmlFor="email">Email address</label>
                <input
                    type="email"
                    id="email"
                    data-testid="email-input"
                    {...register('email')}
                    className={errors.email ? 'input-error' : ''}
                />
                {errors.email && (
                    <span className="error-text">{errors.email.message}</span>
                )}
            </div>

            <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                    type="password"
                    id="password"
                    data-testid="password-input"
                    {...register('password')}
                    className={errors.password ? 'input-error' : ''}
                />
                {errors.password && (
                    <span className="error-text">{errors.password.message}</span>
                )}
            </div>

            <button type="submit" className="btn-primary" data-testid="login-button" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
        </form>
    )
};

export default LoginForm;