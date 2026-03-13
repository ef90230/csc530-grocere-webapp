import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// match backend registration schemas (employee vs customer)
const employeeSchema = z
  .object({
    userType: z.literal('employee'),
    employeeId: z.string().min(1, 'Employee ID is required'),
    firstName: z
      .string()
      .min(1, 'First name is required')
      .min(2, 'First name must be at least 2 characters'),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .min(2, 'Last name must be at least 2 characters'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    role: z.string().optional(),
    storeId: z.string().min(1, 'Store ID is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const customerSchema = z
  .object({
    userType: z.literal('customer'),
    customerId: z.string().min(1, 'Customer ID is required'),
    firstName: z
      .string()
      .min(1, 'First name is required')
      .min(2, 'First name must be at least 2 characters'),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .min(2, 'Last name must be at least 2 characters'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    phone: z.string().min(1, 'Phone is required').regex(/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number'),
    preferredStoreId: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const signupSchema = z.union([employeeSchema, customerSchema]);

const SignupForm = ({ onSubmit }) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signupSchema),
    mode: 'onSubmit',
    defaultValues: {
      userType: 'customer',
    },
  });

  const userType = watch('userType');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="signup-form">
      <div className="form-group">
        <label>User Type</label>
        <select {...register('userType')}>
          <option value="customer">Customer</option>
          <option value="employee">Employee</option>
        </select>
        {errors.userType && (
          <span className="error-text">{errors.userType.message}</span>
        )}
      </div>

      {userType === 'employee' && (
        <>
          <div className="form-group">
            <label htmlFor="employeeId">Employee ID</label>
            <input id="employeeId" {...register('employeeId')} />
            {errors.employeeId && (
              <span className="error-text">{errors.employeeId.message}</span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="storeId">Store ID</label>
            <input id="storeId" {...register('storeId')} />
            {errors.storeId && (
              <span className="error-text">{errors.storeId.message}</span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="role">Role (optional)</label>
            <input id="role" {...register('role')} />
            {errors.role && (
              <span className="error-text">{errors.role.message}</span>
            )}
          </div>
        </>
      )}

      {userType === 'customer' && (
        <>
          <div className="form-group">
            <label htmlFor="customerId">Customer ID</label>
            <input id="customerId" {...register('customerId')} />
            {errors.customerId && (
              <span className="error-text">{errors.customerId.message}</span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="phone">Phone</label>
            <input id="phone" {...register('phone')} />
            {errors.phone && (
              <span className="error-text">{errors.phone.message}</span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="preferredStoreId">Preferred Store ID</label>
            <input id="preferredStoreId" {...register('preferredStoreId')} />
            {errors.preferredStoreId && (
              <span className="error-text">{errors.preferredStoreId.message}</span>
            )}
          </div>
        </>
      )}

      <div className="form-group">
        <label htmlFor="firstName">First name</label>
        <input id="firstName" {...register('firstName')} />
        {errors.firstName && (
          <span className="error-text">{errors.firstName.message}</span>
        )}
      </div>
      <div className="form-group">
        <label htmlFor="lastName">Last name</label>
        <input id="lastName" {...register('lastName')} />
        {errors.lastName && (
          <span className="error-text">{errors.lastName.message}</span>
        )}
      </div>
      <div className="form-group">
        <label htmlFor="email">Email address</label>
        <input type="email" id="email" {...register('email')} />
        {errors.email && (
          <span className="error-text">{errors.email.message}</span>
        )}
      </div>
      <div className="form-group">
        <label htmlFor="password">Password</label>
        <input type="password" id="password" {...register('password')} />
        {errors.password && (
          <span className="error-text">{errors.password.message}</span>
        )}
      </div>
      <div className="form-group">
        <label htmlFor="confirmPassword">Confirm password</label>
        <input type="password" id="confirmPassword" {...register('confirmPassword')} />
        {errors.confirmPassword && (
          <span className="error-text">{errors.confirmPassword.message}</span>
        )}
      </div>
      <button type="submit" className="btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Signing up...' : 'Sign Up'}
      </button>
    </form>
  );
};

export default SignupForm;
